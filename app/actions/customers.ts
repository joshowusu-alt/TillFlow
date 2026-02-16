'use server';

import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { formString, formOptionalString, formPence } from '@/lib/form-helpers';
import { withBusinessContext, formAction, ok, err, type ActionResult } from '@/lib/action-utils';

export async function createCustomerAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const name = formString(formData, 'name');
    const phone = formOptionalString(formData, 'phone');
    const email = formOptionalString(formData, 'email');
    const creditLimitPence = formPence(formData, 'creditLimit');

    if (!name) return err('Please enter the customer name.');

    await prisma.customer.create({
      data: { businessId, name, phone, email, creditLimitPence }
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
