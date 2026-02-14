'use server';

import { prisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { formOptionalString } from '@/lib/form-helpers';
import { withBusinessContext, formAction, ok, type ActionResult } from '@/lib/action-utils';

export async function updateReceiptDesignAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { businessId } = await withBusinessContext(['OWNER', 'MANAGER']);

    await prisma.business.update({
      where: { id: businessId },
      data: {
        receiptHeader: formOptionalString(formData, 'receiptHeader'),
        receiptFooter: formOptionalString(formData, 'receiptFooter'),
        receiptLogoUrl: formOptionalString(formData, 'receiptLogoUrl'),
        receiptShowVatNumber: formData.get('receiptShowVatNumber') === 'on',
        receiptShowAddress: formData.get('receiptShowAddress') === 'on',
        socialMediaHandle: formOptionalString(formData, 'socialMediaHandle'),
        address: formOptionalString(formData, 'address'),
        phone: formOptionalString(formData, 'phone')
      }
    });

    revalidatePath('/settings/receipt-design');
    revalidatePath('/receipts');
    return ok();
  });
}
