'use server';

import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { formString, formOptionalString } from '@/lib/form-helpers';
import { withBusinessContext, formAction, type ActionResult } from '@/lib/action-utils';
import { audit } from '@/lib/audit';

export async function updateBusinessAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const name = formString(formData, 'name');
    const currency = formString(formData, 'currency') || 'GBP';
    const vatEnabled = formData.get('vatEnabled') === 'on';
    const vatNumber = formOptionalString(formData, 'vatNumber');
    const mode = (formString(formData, 'mode') || 'SIMPLE').toUpperCase();
    const receiptTemplate = formString(formData, 'receiptTemplate') || 'THERMAL_80';
    const printMode = formString(formData, 'printMode') || 'DIRECT_ESC_POS';
    const printerName = formOptionalString(formData, 'printerName');

    await prisma.business.update({
      where: { id: businessId },
      data: { name, currency, vatEnabled, vatNumber, mode, receiptTemplate, printMode, printerName }
    });

    await audit({ businessId, userId: user.id, userName: user.name, userRole: user.role, action: 'SETTINGS_UPDATE', entity: 'Business', entityId: businessId, details: { name, currency, mode } });

    redirect('/settings');
  }, '/settings');
}
