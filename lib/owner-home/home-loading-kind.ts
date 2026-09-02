import { cache } from 'react';
import { cookies } from 'next/headers';
import { requireBusiness } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const HOME_LOADING_KIND_COOKIE = 'tf_home_kind';
export type OwnerHomeLoadingKind = 'checklist' | 'established';

export function readHomeLoadingKindCookie(): OwnerHomeLoadingKind | null {
  try {
    const value = cookies().get(HOME_LOADING_KIND_COOKIE)?.value;
    if (value === 'checklist' || value === 'established') return value;
  } catch {
    // cookies() can throw outside a request context.
  }
  return null;
}

export function writeHomeLoadingKindCookie(kind: OwnerHomeLoadingKind) {
  const isSecure = process.env.NODE_ENV === 'production' && !process.env.BASE_URL?.startsWith('http://');
  try {
    cookies().set(HOME_LOADING_KIND_COOKIE, kind, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  } catch {
    // cookies().set is not always available in RSC.
  }
}

export function homeLoadingKindFromFacts(input: {
  onboardingCompletedAt: Date | null | undefined;
  hasFirstSale: boolean;
}): OwnerHomeLoadingKind {
  if (input.onboardingCompletedAt || input.hasFirstSale) return 'established';
  return 'checklist';
}

/**
 * Cheapest Home skeleton selector that matches `needsFullReadiness`
 * (`!(firstSale || onboardingCompletedAt)`). Uses the layout's cached
 * `requireBusiness` and at most one sale-existence lookup — never product counts.
 */
export const getOwnerHomeLoadingKind = cache(async (): Promise<OwnerHomeLoadingKind> => {
  const { user, business } = await requireBusiness();
  if (user.role !== 'OWNER') return 'established';
  if (business.onboardingCompletedAt) return 'established';

  const cookie = readHomeLoadingKindCookie();
  if (cookie === 'established') return 'established';

  const firstSale = await prisma.salesInvoice.findFirst({
    where: {
      businessId: business.id,
      paymentStatus: { notIn: ['RETURNED', 'VOID'] },
      OR: [{ qaTag: null }, { qaTag: { not: 'DEMO_DAY' } }],
    },
    select: { id: true },
  });

  return firstSale ? 'established' : 'checklist';
});
