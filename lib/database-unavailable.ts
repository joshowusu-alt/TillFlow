/** Server-side classification: never send database exception text to the browser. */
export function isDatabaseUnavailable(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current = error;
  for (let depth = 0; current && typeof current === 'object' && depth < 6; depth++) {
    if (seen.has(current)) break;
    seen.add(current);
    const e = current as { code?: string; name?: string; message?: string; status?: number; statusCode?: number; cause?: unknown };
    if (['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(e.code ?? '') ||
      e.name === 'PrismaClientInitializationError') return true;
    const message = e.message ?? '';
    if (/neon/i.test(message) && (e.status === 402 || e.statusCode === 402 || /quota|402|compute.*limit|network.*limit|payment required|endpoint.*disabled/i.test(message))) return true;
    current = e.cause;
  }
  return false;
}
