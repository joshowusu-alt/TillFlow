'use server';

import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { redirect } from 'next/navigation';

export async function updateBusinessAction(formData: FormData) {
  await requireRole(['MANAGER', 'OWNER']);
  const business = await prisma.business.findFirst();
  if (!business) {
    redirect('/onboarding');
  }

  const name = String(formData.get('name') || '');
  const currency = String(formData.get('currency') || 'GBP');
  const vatEnabled = formData.get('vatEnabled') === 'on';
  const vatNumber = String(formData.get('vatNumber') || '') || null;
  const mode = (String(formData.get('mode') || 'SIMPLE') || 'SIMPLE').toUpperCase();
  const receiptTemplate = String(formData.get('receiptTemplate') || 'THERMAL_80');
  const printMode = String(formData.get('printMode') || 'DIRECT_ESC_POS');
  const printerName = String(formData.get('printerName') || '') || null;

  await prisma.business.update({
    where: { id: business.id },
    data: { name, currency, vatEnabled, vatNumber, mode, receiptTemplate, printMode, printerName }
  });

  redirect('/settings');
}
