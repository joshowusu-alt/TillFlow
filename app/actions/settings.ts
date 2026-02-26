'use server';

import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { formString, formOptionalString, toPence } from '@/lib/form-helpers';
import { withBusinessContext, formAction, type ActionResult } from '@/lib/action-utils';
import { audit } from '@/lib/audit';
import { ensureChartOfAccounts } from '@/lib/accounting';

/** Lightweight action for onboarding wizard to set store mode */
export async function setStoreModeAction(storeMode: 'SINGLE_STORE' | 'MULTI_STORE'): Promise<ActionResult> {
  const { user, businessId } = await withBusinessContext(['OWNER']);
  const validated = storeMode === 'MULTI_STORE' ? 'MULTI_STORE' : 'SINGLE_STORE';
  await prisma.business.update({
    where: { id: businessId },
    data: { storeMode: validated },
  });
  audit({
    businessId,
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    action: 'SETTINGS_UPDATE',
    entity: 'Business',
    entityId: businessId,
    details: { storeMode: validated, source: 'onboarding' },
  });
  return { success: true };
}

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
    const tinNumber = formOptionalString(formData, 'tinNumber');
    const phone = formOptionalString(formData, 'phone');
    const address = formOptionalString(formData, 'address');
    const momoEnabled = formData.get('momoEnabled') === 'on';
    const momoProvider = formOptionalString(formData, 'momoProvider');
    const momoNumber = formOptionalString(formData, 'momoNumber');
    const customerScopeRaw = (formString(formData, 'customerScope') || 'SHARED').toUpperCase();
    const customerScope = customerScopeRaw === 'BRANCH' ? 'BRANCH' : 'SHARED';
    const requireOpenTillForSales = formData.get('requireOpenTillForSales') === 'on';
    const varianceReasonRequired = formData.get('varianceReasonRequired') === 'on';
    const discountApprovalThresholdBps = Math.max(
      0,
      Math.min(10_000, parseInt(String(formData.get('discountApprovalThresholdBps') || '1500'), 10) || 0)
    );
    const inventoryAdjustmentRiskThresholdBase = Math.max(
      1,
      parseInt(String(formData.get('inventoryAdjustmentRiskThresholdBase') || '50'), 10) || 50
    );
    const cashVarianceRiskThresholdPence = Math.max(
      0,
      parseInt(String(formData.get('cashVarianceRiskThresholdPence') || '2000'), 10) || 2000
    );
    // Opening Capital is entered in whole currency units by the user (e.g. 5000 = GHS 5,000)
    const openingCapitalPence = Math.max(0, toPence(formData.get('openingCapitalPence')));
    const storeModeRaw = (formString(formData, 'storeMode') || 'SINGLE_STORE').toUpperCase();
    const storeMode = storeModeRaw === 'MULTI_STORE' ? 'MULTI_STORE' : 'SINGLE_STORE';

    await prisma.business.update({
      where: { id: businessId },
      data: {
        name,
        currency,
        vatEnabled,
        vatNumber,
        mode,
        receiptTemplate,
        printMode,
        printerName,
        tinNumber,
        phone,
        address,
        momoEnabled,
        momoProvider,
        momoNumber,
        customerScope,
        openingCapitalPence,
        requireOpenTillForSales,
        varianceReasonRequired,
        discountApprovalThresholdBps,
        inventoryAdjustmentRiskThresholdBase,
        cashVarianceRiskThresholdPence,
        storeMode,
      }
    });

    // When switching to ADVANCED, ensure Chart of Accounts exists so reports work immediately
    if (mode === 'ADVANCED') {
      await ensureChartOfAccounts(businessId);
    }

    audit({ businessId, userId: user.id, userName: user.name, userRole: user.role, action: 'SETTINGS_UPDATE', entity: 'Business', entityId: businessId, details: { name, currency, mode } });

    redirect('/settings');
  }, '/settings');
}
