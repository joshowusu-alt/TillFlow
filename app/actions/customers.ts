'use server';

import { redirect } from 'next/navigation';
import { formString, formOptionalString, formPence } from '@/lib/form-helpers';
import { withBusinessContext, formAction, safeAction, ok, err, type ActionResult } from '@/lib/action-utils';
import { createCustomer, updateCustomer, quickCreateCustomer } from '@/lib/services/customers';

export async function createCustomerAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const name = formString(formData, 'name');
    const phone = formOptionalString(formData, 'phone');
    const email = formOptionalString(formData, 'email');
    const creditLimitPence = formPence(formData, 'creditLimit');
    const storeId = formOptionalString(formData, 'storeId');

    if (!name) return err('Please enter the customer name.');

    await createCustomer(businessId, { name, phone, email, creditLimitPence, storeId });

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

    const updated = await updateCustomer(id, businessId, { name, phone, email, creditLimitPence });
    if (!updated) return err('Customer not found. It may have been removed.');

    redirect(`/customers/${updated.id}`);
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

    const customer = await quickCreateCustomer(businessId, data);
    return ok(customer);
  });
}
