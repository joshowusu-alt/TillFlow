'use server';

/**
 * Legacy database-backed demo actions are intentionally disabled.
 *
 * The public business demo now lives under /demo and is assembled from
 * deterministic in-memory fixtures. It should not create, mutate, or reset
 * tenant data in Prisma.
 */
export async function getDemoBusiness() {
  return null;
}

export async function ensureDemoBusiness() {
  return null;
}

export async function seedDemoAction(): Promise<{ ok: boolean; businessId?: string; error?: string }> {
  return { ok: false, error: 'Database-backed demo mode is disabled. Use /demo.' };
}

export async function resetDemoAction(): Promise<{ ok: boolean; error?: string }> {
  return { ok: true };
}
