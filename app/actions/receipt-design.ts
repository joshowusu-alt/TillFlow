'use server';

import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export async function updateReceiptDesignAction(formData: FormData) {
    await requireRole(['OWNER', 'MANAGER']);

    const business = await prisma.business.findFirst();
    if (!business) {
        throw new Error('Business not found');
    }

    await prisma.business.update({
        where: { id: business.id },
        data: {
            receiptHeader: formData.get('receiptHeader') as string || null,
            receiptFooter: formData.get('receiptFooter') as string || null,
            receiptLogoUrl: formData.get('receiptLogoUrl') as string || null,
            receiptShowVatNumber: formData.get('receiptShowVatNumber') === 'on',
            receiptShowAddress: formData.get('receiptShowAddress') === 'on',
            socialMediaHandle: formData.get('socialMediaHandle') as string || null,
            address: formData.get('address') as string || null,
            phone: formData.get('phone') as string || null
        }
    });

    revalidatePath('/settings/receipt-design');
    revalidatePath('/receipts');
}
