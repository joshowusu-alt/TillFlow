'use server';

import { redirect } from 'next/navigation';
import { formString, formOptionalString, formPence } from '@/lib/form-helpers';
import { withBusinessContext, formAction, err } from '@/lib/action-utils';
import { createSupplier, updateSupplier, deleteSupplier } from '@/lib/services/suppliers';
import { audit } from '@/lib/audit';

export async function createSupplierAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const name = formString(formData, 'name');
    const phone = formOptionalString(formData, 'phone');
    const email = formOptionalString(formData, 'email');
    const creditLimitPence = formPence(formData, 'creditLimit');

    if (!name) return err('Please enter the supplier name.');

    await createSupplier(businessId, { name, phone, email, creditLimitPence });

    redirect('/suppliers');
  }, '/suppliers');
}

export async function updateSupplierAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const id = formString(formData, 'id');
    if (!id) return err('Could not find that supplier. Please refresh and try again.');

    const name = formString(formData, 'name');
    const phone = formOptionalString(formData, 'phone');
    const email = formOptionalString(formData, 'email');
    const creditLimitPence = formPence(formData, 'creditLimit');

    const updated = await updateSupplier(id, businessId, { name, phone, email, creditLimitPence });
    if (!updated) return err('Supplier not found. It may have been removed.');

    redirect(`/suppliers/${updated.id}`);
  }, '/suppliers');
}

export async function deleteSupplierAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const id = formString(formData, 'id');
    if (!id) return err('Supplier ID is required.');

    const deleted = await deleteSupplier(id, businessId);
    if (!deleted) return err('Supplier not found. It may have already been removed.');

    audit({ businessId, userId: user.id, userName: user.name, userRole: user.role, action: 'SUPPLIER_DELETE', entity: 'Supplier', entityId: id, details: { name: deleted.name } }).catch(() => {});

    redirect('/suppliers');
  }, '/suppliers');
}
