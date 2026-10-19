'use server';
import { requireSelectedStoreContext, safeAction, ok } from '@/lib/action-utils';
import { transferBusinessCash } from '@/lib/services/purchase-funding';
import { formString, toPence } from '@/lib/form-helpers';
import { revalidatePath, revalidateTag } from 'next/cache';

export async function transferBusinessCashAction(data: FormData) {
  return safeAction(async () => {
    const { businessId, storeId, user } = await requireSelectedStoreContext(['OWNER', 'MANAGER'], formString(data, 'storeId'));
    await transferBusinessCash({ businessId, storeId, actorId: user.id, holderId: formString(data, 'holderId'), direction: formString(data, 'direction') as 'ISSUE' | 'RETURN' | 'REPAY_OWNER', source: formString(data, 'source') as 'TILL' | 'BANK' | 'OWNER_LOAN' | 'OWNER_CAPITAL', ownerId: formString(data, 'ownerId'), tillId: formString(data, 'tillId'), amountPence: toPence(formString(data, 'amount')), note: formString(data, 'note'), key: formString(data, 'key') });

    revalidatePath('/purchases'); revalidatePath('/purchases/cash'); revalidateTag('reports');
    return ok();
  });
}

export async function listFundingPeopleAction(storeId: string) {
  return safeAction(async () => {
    const { businessId } = await requireSelectedStoreContext(['OWNER', 'MANAGER'], storeId);
    const { prisma } = await import('@/lib/prisma');
    const { holdingCode, accountBalance } = await import('@/lib/services/purchase-funding');
    const people = await prisma.user.findMany({ where: { businessId, role: { in: ['OWNER', 'MANAGER'] } }, select: { id: true, name: true, role: true } });
    return ok(await Promise.all(people.map(async person => ({ ...person, balancePence: await accountBalance(prisma, businessId, holdingCode(storeId, person.id)) }))));
  });
}
