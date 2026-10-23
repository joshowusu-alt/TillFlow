import { withBusinessContext } from '@/lib/action-utils';
import { prisma } from '@/lib/prisma';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const { businessId, user } = await withBusinessContext(undefined, { requireWrite: false });
  const practitioner = await prisma.pharmacyPractitioner.findFirst({ where: { businessId, userId: user.id, active: true, registrationExpiresAt: { gt: new Date() } }, select: { id: true } });
  if (!practitioner) return new Response('Pharmacist access required.', { status: 403 });
  const rx = await prisma.pharmacyPrescription.findFirst({ where: { id: params.id, businessId }, select: { documentBody: true, documentContentType: true } });
  if (!rx) return new Response('Prescription not found.', { status: 404 });
  return new Response(new Uint8Array(rx.documentBody), { headers: { 'Content-Type': rx.documentContentType, 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline; filename="prescription"', 'Content-Security-Policy': "default-src 'none'; sandbox" } });
}
