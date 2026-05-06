import { NextRequest, NextResponse } from 'next/server';
import type { Client, Notification } from 'pg';
import { isPostgresDatabaseUrl } from '@/lib/database-runtime';
import { getPublicOnlineOrder } from '@/lib/services/online-orders';
import {
  ONLINE_ORDER_STATUS_CHANNEL,
  isOrderStatusStreamEnabled,
  type OnlineOrderStatusSnapshot,
} from '@/lib/services/online-order-status-stream';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const HEARTBEAT_MS = 25_000;
const RECONNECT_MS = 50_000;
const TERMINAL_STATUSES = new Set(['COMPLETED', 'CANCELLED']);
let warnedMissingNonPoolingUrl = false;

function getListenerDatabaseUrl() {
  const url = process.env.POSTGRES_URL_NON_POOLING;
  if (isPostgresDatabaseUrl(url)) {
    return url;
  }

  if (process.env.NODE_ENV === 'production' && !warnedMissingNonPoolingUrl) {
    warnedMissingNonPoolingUrl = true;
    console.warn(
      '[order-status-stream] POSTGRES_URL_NON_POOLING is required for live order status streams. Falling back to polling.',
    );
  }

  return null;
}

function sseFrame(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function isTerminalStatus(status: string) {
  return TERMINAL_STATUSES.has(status);
}

async function createListenerClient() {
  const connectionString = getListenerDatabaseUrl();
  if (!connectionString) {
    throw new Error('No Postgres listener database URL configured.');
  }

  // Lazy dynamic import so pg is never loaded at module-evaluation time.
  // A static top-level import causes the build worker to hang on Windows
  // (and any environment where pg's module initialisation blocks the event loop).
  const { Client } = await import('pg');
  const client = new Client({ connectionString });
  await client.connect();
  await client.query(`LISTEN ${ONLINE_ORDER_STATUS_CHANNEL}`);
  return client;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  // Next.js 14 invokes force-dynamic Route Handlers once during the production
  // build to collect response metadata. Return immediately so the build worker
  // never opens a database connection or a long-lived stream.
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return NextResponse.json({ error: 'Not available during build.' }, { status: 503 });
  }

  const accept = request.headers.get('accept') ?? '';
  if (!accept.includes('text/event-stream')) {
    return NextResponse.json({ error: 'This endpoint requires EventSource.' }, { status: 426 });
  }

  if (!isOrderStatusStreamEnabled()) {
    return NextResponse.json({ error: 'Order status stream is disabled.' }, { status: 503 });
  }

  const slug = request.nextUrl.searchParams.get('slug') ?? '';
  const token = request.nextUrl.searchParams.get('token') ?? '';
  const initialOrder = await getPublicOnlineOrder({ slug, orderId: params.id, token });

  if (!initialOrder) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }

  let listener: Client | null = null;
  if (!isTerminalStatus(initialOrder.status)) {
    try {
      listener = await createListenerClient();
    } catch (error) {
      console.error('[order-status-stream] LISTEN setup failed', { orderId: params.id, error });
      return NextResponse.json({ error: 'Order status stream is unavailable.' }, { status: 503 });
    }
  }

  const currentOrder = await getPublicOnlineOrder({ slug, orderId: params.id, token });
  if (!currentOrder) {
    if (listener) {
      await listener.end().catch(() => undefined);
    }
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }

  const encoder = new TextEncoder();
  let cleanupStream: (() => Promise<void>) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
      let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

      const write = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(sseFrame(event, data)));
      };

      const cleanup = async () => {
        if (closed) return;
        closed = true;

        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
        }
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
        }

        request.signal.removeEventListener('abort', abort);

        if (listener) {
          listener.off('notification', onNotification);
          await listener.query(`UNLISTEN ${ONLINE_ORDER_STATUS_CHANNEL}`).catch(() => undefined);
          await listener.end().catch(() => undefined);
        }

        try {
          controller.close();
        } catch {
          // The browser may have already gone away.
        }
      };
      cleanupStream = cleanup;

      const closeWith = (event: string, data: unknown) => {
        write(event, data);
        void cleanup();
      };

      const onNotification = (notification: Notification) => {
        if (notification.channel !== ONLINE_ORDER_STATUS_CHANNEL || !notification.payload) {
          return;
        }

        try {
          const payload = JSON.parse(notification.payload) as OnlineOrderStatusSnapshot;
          if (payload.orderId !== params.id) {
            return;
          }

          write('status', payload);
          if (isTerminalStatus(payload.status)) {
            closeWith('done', { status: payload.status });
          }
        } catch (error) {
          console.error('[order-status-stream] Invalid NOTIFY payload', { orderId: params.id, error });
        }
      };

      function abort() {
        void cleanup();
      }

      listener?.on('notification', onNotification);
      request.signal.addEventListener('abort', abort);

      write('status', currentOrder);

      if (isTerminalStatus(currentOrder.status)) {
        closeWith('done', { status: currentOrder.status });
        return;
      }

      heartbeatTimer = setInterval(() => {
        write('heartbeat', { ts: new Date().toISOString() });
      }, HEARTBEAT_MS);

      reconnectTimer = setTimeout(() => {
        closeWith('reconnect', { ts: new Date().toISOString() });
      }, RECONNECT_MS);
    },
    cancel() {
      return cleanupStream?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
