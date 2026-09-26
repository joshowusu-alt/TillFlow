/**
 * Name-normalised probable duplicate suppliers. Preview only — no merge.
 */

import { prisma } from '@/lib/prisma';
import { payableDocumentBalance } from '@/lib/reports/payables-balance';

export function normalizeSupplierName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export type DuplicateSupplierMember = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  outstandingPence: number;
};

export type DuplicateSupplierGroup = {
  normalizedName: string;
  members: DuplicateSupplierMember[];
  totalOutstandingPence: number;
};

export async function findProbableDuplicateSuppliers(
  businessId: string,
): Promise<DuplicateSupplierGroup[]> {
  const suppliers = await prisma.supplier.findMany({
    where: { businessId },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      purchaseInvoices: {
        where: {
          supplierId: { not: null },
          paymentStatus: { in: ['UNPAID', 'PART_PAID'] },
        },
        select: {
          totalPence: true,
          paymentStatus: true,
          payments: { select: { amountPence: true } },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  const grouped = new Map<string, DuplicateSupplierMember[]>();
  for (const supplier of suppliers) {
    const key = normalizeSupplierName(supplier.name);
    if (!key) continue;
    const outstandingPence = supplier.purchaseInvoices.reduce(
      (sum, invoice) => sum + payableDocumentBalance(invoice).balancePence,
      0,
    );
    const member: DuplicateSupplierMember = {
      id: supplier.id,
      name: supplier.name,
      phone: supplier.phone,
      email: supplier.email,
      outstandingPence,
    };
    const existing = grouped.get(key);
    if (existing) existing.push(member);
    else grouped.set(key, [member]);
  }

  const groups: DuplicateSupplierGroup[] = [];
  for (const [normalizedName, members] of grouped) {
    if (members.length < 2) continue;
    groups.push({
      normalizedName,
      members,
      totalOutstandingPence: members.reduce((sum, member) => sum + member.outstandingPence, 0),
    });
  }

  return groups.sort((a, b) => a.normalizedName.localeCompare(b.normalizedName));
}
