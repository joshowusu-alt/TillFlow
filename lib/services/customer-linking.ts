import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { normalizeCustomerPhone } from '@/lib/services/customers';

export async function linkStorefrontCustomerToPos(
  storefrontCustomerId: string,
  tx: Prisma.TransactionClient = prisma,
): Promise<{ posCustomerId: string | null; matched: boolean }> {
  const sc = await tx.storefrontCustomer.findUnique({
    where: { id: storefrontCustomerId },
    select: { id: true, businessId: true, phone: true, posCustomerId: true },
  });
  if (!sc) return { posCustomerId: null, matched: false };

  const canonical = normalizeCustomerPhone(sc.phone);
  if (!canonical) return { posCustomerId: null, matched: false };

  // If linked customer no longer matches the canonical phone, clear stale link
  // and continue with fresh matching.
  if (sc.posCustomerId) {
    const linked = await tx.customer.findUnique({
      where: { id: sc.posCustomerId },
      select: { id: true, phone: true },
    });
    const linkedCanonical = normalizeCustomerPhone(linked?.phone);
    if (linked?.id && linkedCanonical === canonical) {
      return { posCustomerId: linked.id, matched: true };
    }

    await tx.storefrontCustomer.update({
      where: { id: sc.id },
      data: { posCustomerId: null },
    });
  }

  const match = await tx.customer.findFirst({
    where: { businessId: sc.businessId, phone: canonical },
    select: { id: true },
  });
  if (!match) return { posCustomerId: null, matched: false };

  await tx.storefrontCustomer.update({
    where: { id: sc.id },
    data: { posCustomerId: match.id },
  });
  return { posCustomerId: match.id, matched: true };
}

export async function linkPosCustomerToStorefront(
  posCustomerId: string,
  tx: Prisma.TransactionClient = prisma,
): Promise<{ linkedCount: number }> {
  const customer = await tx.customer.findUnique({
    where: { id: posCustomerId },
    select: { id: true, businessId: true, phone: true },
  });
  if (!customer || !customer.phone) return { linkedCount: 0 };

  const canonical = normalizeCustomerPhone(customer.phone);
  if (!canonical) return { linkedCount: 0 };

  const result = await tx.storefrontCustomer.updateMany({
    where: {
      businessId: customer.businessId,
      phone: canonical,
      posCustomerId: null,
    },
    data: { posCustomerId: customer.id },
  });

  return { linkedCount: result.count };
}
