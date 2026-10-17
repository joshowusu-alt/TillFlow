import { notFound } from 'next/navigation';
import { storefrontPreviewOwner } from '@/lib/services/storefront-preview-guard';
export const dynamic = 'force-dynamic';
export default async function StorefrontAcceptancePage() {
  if (!await storefrontPreviewOwner()) notFound();
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
    <a className="underline" href="/online-orders">Open online orders</a>
  </main>;
}
