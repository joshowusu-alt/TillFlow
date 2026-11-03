import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import ProductHistoryView from '@/components/products/ProductHistoryView';
import { requireBusinessStore } from '@/lib/auth';
import { getProductHistory, historyPage } from '@/lib/services/product-history';
import { localDateInstant } from '@/lib/reports/reporting-clock';

export const dynamic = 'force-dynamic';
export default async function ProductHistoryPage(
  props: { params: Promise<{ id: string }>; searchParams?: Promise<{ from?: string; to?: string; page?: string; receiptsPage?: string }> }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const { business, store } = await requireBusinessStore(['OWNER', 'MANAGER']);
  if (!business || !store) notFound();
  const start = localDateInstant(searchParams?.from, 'start', business.timezone);
  const endExclusive = localDateInstant(searchParams?.to, 'endExclusive', business.timezone);
  if ((searchParams?.from && !start) || (searchParams?.to && !endExclusive) || (start && endExclusive && start >= endExclusive)) {
    return <div className="card p-6"><h1 className="text-xl font-semibold">Check the history dates</h1><p className="mt-2">Choose valid dates with From on or before To.</p><Link className="btn-secondary mt-4" href={`/products/${encodeURIComponent(params.id)}/history`}>Clear dates</Link></div>;
  }
  const data = await getProductHistory({ businessId: business.id, storeId: store.id, productId: params.id, start, endExclusive, page: historyPage(searchParams?.page), receiptsPage: historyPage(searchParams?.receiptsPage) });
  if (!data) notFound();
  return <div className="min-w-0 space-y-5"><PageHeader title="Product history" subtitle={`${[data.product.name, data.product.publisher, data.product.edition].filter(Boolean).join(' · ')} · ${data.store.name}`} secondaryCta={{ label: '← Back to product', href: `/products/${encodeURIComponent(data.product.id)}` }} /><ProductHistoryView data={data} currency={business.currency} timeZone={business.timezone} from={searchParams?.from} to={searchParams?.to} /></div>;
}
