import Link from 'next/link';
import Image from 'next/image';
import { buildDemoLedger } from '@/lib/demo-fixtures';
import { ADOM_RETAIL_DEMO_SLUG } from '@/lib/demo-sandbox/constants';
import { formatMoney } from '@/lib/format';

export default function DemoStorePage() {
  const snapshot = buildDemoLedger();
  const byCategory = snapshot.categories.map((cat) => ({
    cat,
    products: snapshot.products.filter((p) => p.categoryId === cat.id).slice(0, 8),
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-ink">Demo online store</h1>
        <p className="mt-1 text-sm text-muted">
          Preview categories, product cards and checkout flow — sample data only.
        </p>
      </div>

      <div className="rounded-2xl border border-black/8 bg-gradient-to-r from-accent to-blue-700 p-6 text-white">
        <p className="text-xs font-semibold uppercase tracking-widest opacity-80">Powered by TillFlow</p>
        <h2 className="mt-1 text-xl font-bold">{snapshot.businessName}</h2>
        <p className="mt-2 text-sm opacity-90">Order online · Pay with MoMo · Pick up at the shop</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href={`/shop/${ADOM_RETAIL_DEMO_SLUG}`}
            className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-accent"
          >
            Open live storefront preview
          </Link>
          <Link href="/demo/orders" className="rounded-xl border border-white/40 px-4 py-2 text-sm font-semibold">
            View sample orders
          </Link>
        </div>
      </div>

      {byCategory.map(({ cat, products }) =>
        products.length === 0 ? null : (
          <section key={cat.id}>
            <h3 className="text-sm font-bold text-ink">{cat.name}</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {products.map((p) => (
                <div key={p.id} className="rounded-xl border bg-white p-3 shadow-sm">
                  <div className="relative h-24 w-full overflow-hidden rounded-lg bg-slate-50">
                    <Image src={p.imagePath} alt="" fill className="object-contain p-2" sizes="120px" />
                  </div>
                  <p className="mt-2 text-sm font-semibold line-clamp-2">{p.name}</p>
                  <p className="text-sm font-bold text-accent">{formatMoney(p.sellingPricePence, 'GHS')}</p>
                  <p className="text-[11px] text-muted">Sample listing · {p.unit}</p>
                </div>
              ))}
            </div>
          </section>
        )
      )}

      <div className="card p-5 text-sm text-muted">
        <p className="font-semibold text-ink">Checkout (sample)</p>
        <ol className="mt-2 list-decimal list-inside space-y-1">
          <li>Customer adds items to cart</li>
          <li>Enters demo phone 0200-000-000</li>
          <li>Receives MoMo payment instructions</li>
          <li>Staff confirms payment and marks order preparing → ready → collected</li>
        </ol>
      </div>
    </div>
  );
}
