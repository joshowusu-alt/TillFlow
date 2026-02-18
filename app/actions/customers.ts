'use server';

import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { formString, formOptionalString, formPence } from '@/lib/form-helpers';
import { withBusinessContext, formAction, safeAction, ok, err, type ActionResult } from '@/lib/action-utils';

export async function createCustomerAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { customerScope: true },
    });
    if (!business) return err('Business not found.');

    const name = formString(formData, 'name');
    const phone = formOptionalString(formData, 'phone');
    const email = formOptionalString(formData, 'email');
    const creditLimitPence = formPence(formData, 'creditLimit');
    const storeIdRaw = formOptionalString(formData, 'storeId');

    if (!name) return err('Please enter the customer name.');

    let storeId: string | null = null;
    if (business.customerScope === 'BRANCH') {
      if (!storeIdRaw) return err('Select a branch/store for this customer.');
      const store = await prisma.store.findFirst({
        where: { id: storeIdRaw, businessId },
        select: { id: true },
      });
      if (!store) return err('Invalid branch/store selected.');
      storeId = store.id;
    }

    await prisma.customer.create({
      data: { businessId, storeId, name, phone, email, creditLimitPence }
    });

    redirect('/customers');
  }, '/customers');
}

export async function updateCustomerAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const id = formString(formData, 'id');
    if (!id) return err('Could not find that customer. Please refresh and try again.');

    const name = formString(formData, 'name');
    const phone = formOptionalString(formData, 'phone');
    const email = formOptionalString(formData, 'email');
    const creditLimitPence = formPence(formData, 'creditLimit');

    const customer = await prisma.customer.findFirst({
      where: { id, businessId },
      select: { id: true },
    });
    if (!customer) return err('Customer not found. It may have been removed.');

    await prisma.customer.update({
      where: { id: customer.id },
      data: { name, phone, email, creditLimitPence }
    });

    redirect(`/customers/${customer.id}`);
  }, '/customers');
}

export async function quickCreateCustomerAction(data: {
  name: string;
  phone: string | null;
  email: string | null;
  creditLimitPence: number;
}): Promise<ActionResult<{ id: string; name: string }>> {
  return safeAction(async () => {
    const { businessId } = await withBusinessContext();

    if (!data.name?.trim()) return err('Customer name is required.');

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { customerScope: true, stores: { select: { id: true }, take: 1 } },
    });
    if (!business) return err('Business not found.');

    let storeId: string | null = null;
    if (business.customerScope === 'BRANCH') {
      storeId = business.stores[0]?.id ?? null;
    }

    const customer = await prisma.customer.create({
      data: {
        businessId,
        storeId,
        name: data.name.trim(),
        phone: data.phone?.trim() || null,
        email: data.email?.trim() || null,
        creditLimitPence: Math.max(0, data.creditLimitPence || 0),
      },
      select: { id: true, name: true },
    });

    return ok(customer);
  });
}
