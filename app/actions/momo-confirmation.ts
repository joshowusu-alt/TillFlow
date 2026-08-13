'use server';

import { headers } from 'next/headers';
import { revalidatePath, revalidateTag } from 'next/cache';
import { safeAction, withBusinessContext, type ActionResult } from '@/lib/action-utils';
import { getBusinessStores } from '@/lib/services/stores';
import { confirmMomoPayment } from '@/lib/services/momo-confirmation';
import { revalidateOwnerDashboardCache } from '@/lib/reports/cache-revalidation';

export type ConfirmMomoPaymentActionData = {
  paymentId: string;
  alreadyConfirmed: boolean;
  receivedAt: string;
};

export async function confirmMomoPaymentAction(input: {
  paymentId: string;
  reference: string;
  note: string;
}): Promise<ActionResult<ConfirmMomoPaymentActionData>> {
  return safeAction(async () => {
    const { user, businessId } = await withBusinessContext(['OWNER', 'MANAGER']);
    const { stores } = await getBusinessStores(businessId);

    const hdrs = headers();
    const ip =
      hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      hdrs.get('x-real-ip') ??
      null;

    const result = await confirmMomoPayment({
      paymentId: input.paymentId,
      reference: input.reference,
      note: input.note,
      actor: {
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        businessId,
      },
      authorisedStoreIds: stores.map((store) => store.id),
      ipAddress: ip,
    });

    if (!result.alreadyConfirmed) {
      revalidateTag('reports');
      revalidateOwnerDashboardCache();
      revalidatePath('/reports/momo-confirmation');
      revalidatePath('/reports/money-received');
    }

    return {
      success: true as const,
      data: {
        paymentId: result.paymentId,
        alreadyConfirmed: result.alreadyConfirmed,
        receivedAt: result.receivedAt.toISOString(),
      },
    };
  });
}
