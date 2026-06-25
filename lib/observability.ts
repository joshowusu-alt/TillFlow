import * as Sentry from '@sentry/nextjs';
import { headers } from 'next/headers';

type LogLevel = 'info' | 'warn' | 'error';

export const PERFORMANCE_THRESHOLDS_MS = {
  route: 1500,
  report: 2500,
  action: 1000,
  critical: 5000,
} as const;

type PerformanceMetadata = Record<string, unknown>;

type PerformanceTimingOptions = {
  thresholdMs?: number;
  operationType?: 'route' | 'report' | 'action' | 'service';
};

const PERFORMANCE_METADATA_ALLOWLIST = new Set([
  'action',
  'businessId',
  'cacheState',
  'cartLineCount',
  'distinctProductCount',
  'duplicateCheckPerformed',
  'environment',
  'hasBankTransferPayment',
  'hasCardPayment',
  'hasCashPayment',
  'hasCredit',
  'hasCustomerId',
  'hasDiscount',
  'hasMobileMoneyPayment',
  'isOfflineSubmission',
  'operationType',
  'page',
  'pageSize',
  'paymentMethodCount',
  'resultCategory',
  'role',
  'route',
  'rowCount',
  'stage',
  'status',
  'storeId',
  'userRole',
]);

const SENSITIVE_METADATA_KEY_PATTERN =
  /body|cookie|email|invoiceLine|lineDetails|name|password|phone|reference|secret|supplier|token/i;

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
  try {
    return headers().get('x-request-id') ?? 'unknown';
  } catch {
    return 'unknown';
  }
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
    Sentry.captureException(context?.error || new Error(message), {
      extra: context,
    });
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

function shouldLogAllPerformanceTimings() {
  return process.env.PERFORMANCE_LOGS === 'true' || process.env.PERFORMANCE_LOGS === '1';
}

function sanitizePerformanceValue(value: unknown) {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return undefined;
}

export function sanitizePerformanceMetadata(metadata: PerformanceMetadata = {}) {
  const safe: PerformanceMetadata = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!PERFORMANCE_METADATA_ALLOWLIST.has(key)) continue;
    if (SENSITIVE_METADATA_KEY_PATTERN.test(key)) continue;

    const sanitized = sanitizePerformanceValue(value);
    if (sanitized !== undefined) {
      safe[key] = sanitized;
    }
  }
  return safe;
}

function thresholdBucket(durationMs: number) {
  if (durationMs >= PERFORMANCE_THRESHOLDS_MS.critical) return 'critical';
  if (durationMs >= PERFORMANCE_THRESHOLDS_MS.report) return 'heavy';
  if (durationMs >= PERFORMANCE_THRESHOLDS_MS.route) return 'slow';
  return 'normal';
}

function errorCategory(error: unknown) {
  if (error instanceof Error) return error.name || 'Error';
  return 'UnknownError';
}

export async function measureServerOperation<T>(
  operation: string,
  callback: () => Promise<T>,
  metadata: PerformanceMetadata = {},
  options: PerformanceTimingOptions = {},
): Promise<T> {
  const startedAt = performance.now();
  const thresholdMs = options.thresholdMs ?? PERFORMANCE_THRESHOLDS_MS.route;
  const baseMetadata = sanitizePerformanceMetadata(metadata);

  try {
    const result = await callback();
    const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
    const logAll = shouldLogAllPerformanceTimings();
    const slowInProduction = process.env.NODE_ENV === 'production' && durationMs >= thresholdMs;

    if (logAll || slowInProduction) {
      const level: LogLevel = durationMs >= thresholdMs ? 'warn' : 'info';
      appLog(level, 'performance.operation', {
        operation,
        durationMs,
        thresholdMs,
        thresholdBucket: thresholdBucket(durationMs),
        environment: process.env.NODE_ENV ?? 'development',
        operationType: options.operationType ?? baseMetadata.operationType ?? 'service',
        status: 'ok',
        ...baseMetadata,
      });
    }

    return result;
  } catch (error) {
    const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
    appLog('error', 'performance.operation.error', {
      operation,
      durationMs,
      thresholdMs,
      thresholdBucket: thresholdBucket(durationMs),
      environment: process.env.NODE_ENV ?? 'development',
      operationType: options.operationType ?? baseMetadata.operationType ?? 'service',
      status: 'error',
      resultCategory: errorCategory(error),
      ...baseMetadata,
    });
    throw error;
  }
}
