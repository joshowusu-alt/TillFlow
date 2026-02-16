import { headers } from 'next/headers';

type LogLevel = 'info' | 'warn' | 'error';

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }
  return { value: String(error) };
}

export function getRequestId() {
  return headers().get('x-request-id') ?? 'unknown';
}

export function appLog(level: LogLevel, message: string, context?: Record<string, unknown>) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    requestId: getRequestId(),
    ...(context ?? {})
  };
  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
}

export function appError(message: string, error: unknown, context?: Record<string, unknown>) {
  appLog('error', message, {
    error: serializeError(error),
    ...(context ?? {})
  });
}
