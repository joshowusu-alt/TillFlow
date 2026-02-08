'use server';

import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { redirect } from 'next/navigation';

const toPence = (value: string) => {
  const trimmed = value.replace(/,/g, '').trim();
  if (!trimmed) return 0;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? 0 : Math.round(parsed * 100);
};

export async function createCustomerAction(formData: FormData) {
  await requireRole(['MANAGER', 'OWNER']);
  const business = await prisma.business.findFirst();
  if (!business) redirect('/settings');

  const name = String(formData.get('name') || '');
  const phone = String(formData.get('phone') || '') || null;
  const email = String(formData.get('email') || '') || null;
  const creditLimitPence = toPence(String(formData.get('creditLimit') || ''));

  await prisma.customer.create({
    data: { businessId: business.id, name, phone, email, creditLimitPence }
  });

  redirect('/customers');
}

export async function updateCustomerAction(formData: FormData) {
  await requireRole(['MANAGER', 'OWNER']);
  const business = await prisma.business.findFirst();
  if (!business) redirect('/settings');

  const id = String(formData.get('id') || '');
  const name = String(formData.get('name') || '');
  const phone = String(formData.get('phone') || '') || null;
  const email = String(formData.get('email') || '') || null;
  const creditLimitPence = toPence(String(formData.get('creditLimit') || ''));

  await prisma.customer.update({
    where: { id },
    data: { name, phone, email, creditLimitPence }
  });

  redirect(`/customers/${id}`);
}
