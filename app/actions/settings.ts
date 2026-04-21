'use server';

import { findBusinessCommercialSnapshot } from '@/lib/billing-db-compat';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { formString, formOptionalString, toPence } from '@/lib/form-helpers';
import { withBusinessContext, formAction, type ActionResult } from '@/lib/action-utils';
import { audit } from '@/lib/audit';
import { ensureChartOfAccounts } from '@/lib/accounting';
import { getBusinessPlan, hasPlanAccess, type BusinessPlan } from '@/lib/features';

function parseOptionalDate(value: string | null | undefined) {
  if (!value?.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Lightweight action for onboarding wizard to set store mode */
export async function setStoreModeAction(storeMode: 'SINGLE_STORE' | 'MULTI_STORE'): Promise<ActionResult> {
  const { user, businessId } = await withBusinessContext(['OWNER']);
  const { business: currentBusiness } = await findBusinessCommercialSnapshot(businessId);
  const requestedStoreMode = storeMode === 'MULTI_STORE' ? 'MULTI_STORE' : 'SINGLE_STORE';
  const plan = getBusinessPlan((currentBusiness as any)?.plan ?? (currentBusiness?.mode as any), requestedStoreMode as any);
  const validated = requestedStoreMode === 'MULTI_STORE' && hasPlanAccess(plan, 'PRO') ? 'MULTI_STORE' : 'SINGLE_STORE';
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
    details: { storeMode: validated, requestedStoreMode, source: 'onboarding' },
  }).catch((e) => console.error('[audit]', e));
  return { success: true };
}

export async function updateBusinessAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);
    const { business: currentBusiness } = await findBusinessCommercialSnapshot(businessId);

    const name = formString(formData, 'name');
    const currency = formString(formData, 'currency') || 'GHS';
    const vatEnabled = formData.get('vatEnabled') === 'on';
    const vatNumber = formOptionalString(formData, 'vatNumber');
    const receiptTemplate = formString(formData, 'receiptTemplate') || 'THERMAL_80';
    const printMode = formString(formData, 'printMode') || 'DIRECT_ESC_POS';
    const printerName = formOptionalString(formData, 'printerName');
    const labelPrintModeRaw = (formString(formData, 'labelPrintMode') || 'BROWSER_PDF').toUpperCase();
    const labelPrintMode = labelPrintModeRaw === 'ZPL_DIRECT' ? 'ZPL_DIRECT' : 'BROWSER_PDF';
    const labelSizeRaw = (formString(formData, 'labelSize') || 'SHELF_TAG').toUpperCase();
    const labelSize =
      labelSizeRaw === 'PRODUCT_STICKER' || labelSizeRaw === 'A4_SHEET' ? labelSizeRaw : 'SHELF_TAG';
    const labelPrinterName = formOptionalString(formData, 'labelPrinterName');
    const tinNumber = formOptionalString(formData, 'tinNumber');
    const phone = formOptionalString(formData, 'phone');
    const address = formOptionalString(formData, 'address');
    const momoEnabled = formData.get('momoEnabled') === 'on';
    const momoProvider = formOptionalString(formData, 'momoProvider');
    const momoNumber = formOptionalString(formData, 'momoNumber');
    const requireOpenTillForSales = formData.get('requireOpenTillForSales') === 'on';
    const varianceReasonRequired = formData.get('varianceReasonRequired') === 'on';
    const discountApprovalThresholdBps = Math.max(
      0,
      Math.min(10_000, parseInt(String(formData.get('discountApprovalThresholdBps') || '1500'), 10) || 0)
    );
    const minimumMarginThresholdBps = Math.max(
      0,
      Math.min(10_000, Math.round((parseFloat(String(formData.get('minimumMarginThresholdPercent') || '15')) || 0) * 100))
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
    const plan = getBusinessPlan((currentBusiness as any)?.plan ?? (currentBusiness?.mode as any), (currentBusiness?.storeMode as any) ?? 'SINGLE_STORE');

    await prisma.business.update({
      where: { id: businessId },
      data: {
        name,
        currency,
        vatEnabled,
        vatNumber,
        receiptTemplate,
        printMode,
        printerName,
        labelPrintMode,
        labelSize,
        labelPrinterName,
        tinNumber,
        phone,
        address,
        momoEnabled,
        momoProvider,
        momoNumber,
        openingCapitalPence,
        requireOpenTillForSales,
        varianceReasonRequired,
        discountApprovalThresholdBps,
        minimumMarginThresholdBps,
        inventoryAdjustmentRiskThresholdBase,
        cashVarianceRiskThresholdPence,
      } as any
    });

    if (hasPlanAccess(plan, 'GROWTH')) {
      await ensureChartOfAccounts(businessId);
    }

    audit({ businessId, userId: user.id, userName: user.name, userRole: user.role, action: 'SETTINGS_UPDATE', entity: 'Business', entityId: businessId, details: { name, currency, momoEnabled } }).catch((e) => console.error('[audit]', e));

    redirect('/settings');
  }, '/settings');
}

export async function updateOrganizationSettingsAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);
    const { business: currentBusiness } = await findBusinessCommercialSnapshot(businessId);

    const customerScopeRaw = (formString(formData, 'customerScope') || 'SHARED').toUpperCase();
    const customerScope = customerScopeRaw === 'BRANCH' ? 'BRANCH' : 'SHARED';
    const storeModeRaw = (formString(formData, 'storeMode') || 'SINGLE_STORE').toUpperCase();
    const requestedStoreMode = storeModeRaw === 'MULTI_STORE' ? 'MULTI_STORE' : 'SINGLE_STORE';
    const plan = getBusinessPlan((currentBusiness as any)?.plan ?? (currentBusiness?.mode as any), requestedStoreMode as any);
    const storeMode = requestedStoreMode === 'MULTI_STORE' && hasPlanAccess(plan, 'PRO') ? 'MULTI_STORE' : 'SINGLE_STORE';

    await prisma.business.update({
      where: { id: businessId },
      data: {
        customerScope,
        storeMode,
      } as any,
    });

    audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'SETTINGS_UPDATE',
      entity: 'Business',
      entityId: businessId,
      details: { customerScope, storeMode, requestedStoreMode, source: 'organization-settings' },
    }).catch((e) => console.error('[audit]', e));

    redirect('/settings/organization');
  }, '/settings/organization');
}

export async function updatePlanBillingScheduleAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { businessId } = await withBusinessContext(['OWNER'], { requireWrite: false });
    redirect('/settings/billing?error=Billing schedule changes are now managed by Tishgroup Control. Contact Tishgroup to update your commercial record.');
  }, '/settings/billing');
}

export async function recordPlanPaymentAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { businessId } = await withBusinessContext(['OWNER'], { requireWrite: false });
    redirect('/settings/billing?error=Payments are now recorded by Tishgroup Control. Contact Tishgroup to restore access or confirm payment.');
  }, '/settings/billing');
}

export async function requestPlanUpgradeAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER'], { requireWrite: false });
    const { business: currentBusiness, billingSchemaReady } = await findBusinessCommercialSnapshot(businessId);

    if (!billingSchemaReady) {
      redirect('/settings/billing?error=Billing schema is not deployed yet. Run the latest database migrations before using upgrade requests.');
    }

    const desiredPlanRaw = (formString(formData, 'desiredPlan') || '').toUpperCase();
    const desiredPlan: BusinessPlan =
      desiredPlanRaw === 'PRO' ? 'PRO' : desiredPlanRaw === 'GROWTH' ? 'GROWTH' : 'STARTER';
    const feature = formOptionalString(formData, 'feature');
    const requestNote = formOptionalString(formData, 'requestNote');
    const currentPlan = getBusinessPlan((currentBusiness as any)?.plan ?? (currentBusiness?.mode as any));

    if (hasPlanAccess(currentPlan, desiredPlan)) {
      redirect(
        `/settings/billing?error=${encodeURIComponent(
          desiredPlan === currentPlan
            ? `This business is already on ${desiredPlan}.`
            : `Upgrade requests must target a higher plan than ${currentPlan}.`
        )}`
      );
    }

    const requestedAt = new Date().toISOString();
    const noteLines = [
      `[${requestedAt}] Upgrade request`,
      `Requested by: ${user.name} (${user.role})`,
      `Current plan: ${currentPlan}`,
      `Requested plan: ${desiredPlan}`,
      feature ? `Feature context: ${feature}` : null,
      requestNote ? `Request note: ${requestNote}` : null,
    ].filter(Boolean);

    const nextBillingNotes = [((currentBusiness as any)?.billingNotes as string | undefined)?.trim(), noteLines.join('\n')]
      .filter(Boolean)
      .join('\n\n');

    await prisma.business.update({
      where: { id: businessId },
      data: {
        billingNotes: nextBillingNotes,
      } as any,
    });

    audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'SETTINGS_UPDATE',
      entity: 'Business',
      entityId: businessId,
      details: { source: 'billing-upgrade-request', currentPlan, desiredPlan, feature },
    }).catch((e) => console.error('[audit]', e));

    redirect(`/settings/billing?requested=1&desiredPlan=${desiredPlan}${feature ? `&feature=${encodeURIComponent(feature)}` : ''}`);
  }, '/settings/billing');
}

export async function updateLoyaltySettingsAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);
    const { business: currentBusiness } = await findBusinessCommercialSnapshot(businessId);
    const plan = getBusinessPlan((currentBusiness as any)?.plan ?? (currentBusiness?.mode as any));
    if (!hasPlanAccess(plan, 'GROWTH')) {
      redirect('/settings/loyalty?error=Loyalty+programme+requires+Growth+plan');
    }

    const loyaltyEnabled = formData.get('loyaltyEnabled') === 'on';
    const loyaltyPointsPerGhsPence = Math.max(1, parseInt(String(formData.get('loyaltyPointsPerGhsPence') || '100'), 10) || 100);
    const loyaltyGhsPerHundredPoints = Math.max(1, parseInt(String(formData.get('loyaltyGhsPerHundredPoints') || '100'), 10) || 100);

    await prisma.business.update({
      where: { id: businessId },
      data: { loyaltyEnabled, loyaltyPointsPerGhsPence, loyaltyGhsPerHundredPoints } as any,
    });

    audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'SETTINGS_UPDATE',
      entity: 'Business',
      entityId: businessId,
      details: { source: 'loyalty-settings', loyaltyEnabled, loyaltyPointsPerGhsPence, loyaltyGhsPerHundredPoints },
    }).catch((e) => console.error('[audit]', e));

    redirect('/settings/loyalty');
  }, '/settings/loyalty');
}
