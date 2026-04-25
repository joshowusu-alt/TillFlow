import { getUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getFeatures } from '@/lib/features';
import { redirect } from 'next/navigation';

export default async function Home() {
  const user = await getUser();
  if (user) {
    if (user.role === 'OWNER') {
      const business = await prisma.business.findUnique({
        where: { id: user.businessId },
        select: { mode: true, plan: true, storeMode: true },
      });
      const features = getFeatures((business?.plan ?? business?.mode) as any, business?.storeMode as any);
      redirect(features.ownerIntelligence ? '/reports/owner' : '/reports/dashboard');
    }
    redirect('/pos');
  }
  redirect('/welcome');
}
