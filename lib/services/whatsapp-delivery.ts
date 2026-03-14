import { prisma } from '@/lib/prisma';
import {
  extractMetaWebhookStatusEvents,
  type MetaWhatsAppWebhookStatus,
} from '@/lib/notifications/providers/meta-whatsapp';

function getStatusRank(status: string | null | undefined) {
  switch ((status ?? '').toUpperCase()) {
    case 'READ':
      return 4;
    case 'DELIVERED':
      return 3;
    case 'ACCEPTED':
      return 2;
    case 'FAILED':
      return 1;
    case 'REVIEW_REQUIRED':
    default:
      return 0;
  }
}

function resolveNextStatus(currentStatus: string | null | undefined, incomingStatus: MetaWhatsAppWebhookStatus) {
  const current = (currentStatus ?? '').toUpperCase();
  const incoming = incomingStatus.toUpperCase();

  if (incoming === 'FAILED') {
    if (current === 'DELIVERED' || current === 'READ') {
      return current;
    }
    return 'FAILED';
  }

  return getStatusRank(incoming) >= getStatusRank(current) ? incoming : current || incoming;
}

export async function applyMetaWhatsAppWebhookEvents(body: unknown) {
  const events = extractMetaWebhookStatusEvents(body);
  let updated = 0;
  let ignored = 0;

  for (const event of events) {
    const existing = await prisma.messageLog.findFirst({
      where: {
        channel: 'WHATSAPP',
        provider: 'META_WHATSAPP',
        providerMessageId: event.providerMessageId,
      },
      orderBy: { sentAt: 'desc' },
      select: { id: true, status: true, errorMessage: true, deliveredAt: true },
    });

    if (!existing) {
      ignored += 1;
      continue;
    }

    await prisma.messageLog.update({
      where: { id: existing.id },
      data: {
        status: resolveNextStatus(existing.status, event.status),
        providerStatus: event.providerStatus,
        errorMessage: event.errorMessage ?? (event.status === 'FAILED' ? existing.errorMessage : null),
        deliveredAt: event.deliveredAt ?? existing.deliveredAt,
      },
    });
    updated += 1;
  }

  return {
    received: events.length,
    updated,
    ignored,
  };
}
