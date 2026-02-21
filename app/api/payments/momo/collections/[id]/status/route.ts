import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { checkMobileMoneyCollectionStatus } from '@/lib/services/mobile-money';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const collection = await checkMobileMoneyCollectionStatus({
      businessId: user.businessId,
      collectionId: params.id,
      force: true,
    });

    return NextResponse.json({
      id: collection.id,
      status: collection.status,
      providerStatus: collection.providerStatus,
      providerTransactionId: collection.providerTransactionId,
      providerReference: collection.providerReference,
      failureReason: collection.failureReason,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to check status' },
      { status: 400 }
    );
  }
}
