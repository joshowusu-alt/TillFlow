import { getUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
export const QA_BUSINESS = 'cmthpypdi0001l7z520e9t0nm';
export const QA_STORE = 'cmthpypis0003l7z5fq9bui8h';
export async function storefrontPreviewOwner() {
  if (process.env.VERCEL_ENV !== 'preview' || process.env.VERCEL_GIT_COMMIT_REF !== 'fix/storefront-reliability-alerts') return null;
  let db: URL;
  try { db = new URL(process.env.POSTGRES_PRISMA_URL || ''); } catch { return null; }
  if (!/^ep-raspy-cell-za73nd28(-pooler)?\./.test(db.hostname) || !db.hostname.endsWith('.neon.tech') || db.pathname !== '/tillflow_preview') return null;
  const user = await getUser();
  if (!user || user.role !== 'OWNER' || user.businessId !== QA_BUSINESS) return null;
  const business = await prisma.business.findUnique({ where: { id: QA_BUSINESS }, select: { storefrontSlug: true, smsNotificationsEnabled: true } });
  if (!business || business.storefrontSlug !== 'storefront-preview-134' || business.smsNotificationsEnabled) return null;
  return user;
}
