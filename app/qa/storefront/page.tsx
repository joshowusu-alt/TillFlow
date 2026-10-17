import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { storefrontPreviewOwner, QA_BUSINESS } from '@/lib/services/storefront-preview-guard';
export const dynamic = 'force-dynamic';
export default async function StorefrontAcceptancePage() {
  if (!await storefrontPreviewOwner()) notFound();
  const results = await prisma.storefrontEvent.findMany({ where: { businessId: QA_BUSINESS, eventType: 'qa_acceptance' }, orderBy: { timestamp: 'desc' }, take: 12 });
  return <main className="mx-auto max-w-2xl space-y-5 p-6">
    <h1 className="text-2xl font-bold">Storefront acceptance tests</h1>
    <p>Isolated fictional shop only. SMS is disabled. Each test retains its order records for inspection.</p>
    {[
      ['checkout_retry', 'Concurrent checkout retry'],
      ['posting_retry', 'Concurrent sale posting'],
      ['cancel_posting', 'Cancellation versus posting'],
      ['expiry_race', 'Concurrent expiry passes'],
    ].map(([scenario, label]) => <form key={scenario} action="/api/qa/storefront-reliability" method="post">
      <input type="hidden" name="scenario" value={scenario} />
      <button className="rounded-lg bg-blue-700 px-4 py-3 text-white" type="submit">{label}</button>
    </form>)}
    <h2 className="text-xl font-bold">Recent results</h2>
    {results.map(result => <pre key={result.id} className="overflow-auto rounded border p-3 text-xs">{JSON.stringify(JSON.parse(result.metadata || '{}'), null, 2)}</pre>)}
    <a className="underline" href="/online-orders">Open online orders</a>
  </main>;
}
