'use server';

import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { formString, formOptionalString, formPence } from '@/lib/form-helpers';
import { withBusinessContext, formAction, ok, err, type ActionResult } from '@/lib/action-utils';

export async function createSupplierAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const name = formString(formData, 'name');
    const phone = formOptionalString(formData, 'phone');
    const email = formOptionalString(formData, 'email');
    const creditLimitPence = formPence(formData, 'creditLimit');

    if (!name) return err('Please enter the supplier name.');

    await prisma.supplier.create({
      data: { businessId, name, phone, email, creditLimitPence }
    });

    redirect('/suppliers');
  }, '/suppliers');
}

export async function updateSupplierAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    await withBusinessContext(['MANAGER', 'OWNER']);

    const id = formString(formData, 'id');
    if (!id) return err('Could not find that supplier. Please refresh and try again.');

    const name = formString(formData, 'name');
    const phone = formOptionalString(formData, 'phone');
    const email = formOptionalString(formData, 'email');
    const creditLimitPence = formPence(formData, 'creditLimit');

    await prisma.supplier.update({
      where: { id },
      data: { name, phone, email, creditLimitPence }
    });

    redirect(`/suppliers/${id}`);
  }, '/suppliers');
}
