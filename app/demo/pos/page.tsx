import { prisma } from '@/lib/prisma';
import { getDemoBusiness, seedDemoAction } from '@/app/actions/demo';
import { getCurrencySymbol } from '@/lib/format';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function DemoPosPage() {
  let demo = await getDemoBusiness();

  // Auto-seed on first visit
  if (!demo) {
    const result = await seedDemoAction().catch(() => null);
    if (result?.businessId) {
      demo = await getDemoBusiness();
    }
  }

  if (!demo) {
    return (
      <div className="card p-12 text-center">
        <h2 className="text-xl font-semibold mb-2">Demo not available</h2>
        <p className="text-black/50">Could not initialise the demo environment. Please try again shortly.</p>
        <Link href="/demo" className="btn-primary mt-4 inline-block">Retry</Link>
      </div>
    );
  }

  const store = await prisma.store.findFirst({ where: { businessId: demo.id } });
  if (!store) {
    return <div className="card p-8 text-center">Demo store not found.</div>;
  }

  const [products, categories, inventory] = await Promise.all([
    prisma.product.findMany({
      where: { businessId: demo.id, active: true },
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, barcode: true,
        sellingPriceBasePence: true, vatRateBps: true,
        category: { select: { name: true, colour: true } },
      },
    }),
    prisma.category.findMany({
      where: { businessId: demo.id },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, colour: true },
    }),
    prisma.inventoryBalance.findMany({
      where: { storeId: store.id },
      select: { productId: true, qtyOnHandBase: true },
    }),
  ]);

  // Recent "demo" sales for context
  const recentSales = await prisma.salesInvoice.findMany({
    where: { businessId: demo.id },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, totalPence: true, createdAt: true },
  });

  const stockMap = new Map(inventory.map((i) => [i.productId, i.qtyOnHandBase]));
  const currency = demo.currency ?? 'GHS';
  const sym = getCurrencySymbol(currency);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{demo.name}</h1>
          <p className="text-sm text-black/40">Interactive product catalogue · {products.length} items</p>
        </div>
        <div className="flex gap-2">
          <a
            href="/register"
            className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-blue-900"
          >
            Start Free Trial →
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Product grid */}
        <div className="lg:col-span-2 space-y-4">
          {categories.map((cat) => {
            const catProducts = products.filter((p) => p.category?.name === cat.name);
            if (!catProducts.length) return null;
            return (
              <div key={cat.id}>
                <div
                  className="mb-2 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold text-white"
                  style={{ background: cat.colour ?? '#64748b' }}
                >
                  {cat.name}
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {catProducts.map((p) => {
                    const qty = stockMap.get(p.id) ?? 0;
                    const lowStock = qty < 20;
                    const price = p.sellingPriceBasePence / 100;
                    return (
                      <div
                        key={p.id}
                        className="relative rounded-xl border border-black/10 bg-white p-3 shadow-sm hover:shadow transition-shadow"
                      >
                        {lowStock && (
                          <span className="absolute right-2 top-2 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
                            Low
                          </span>
                        )}
                        <div className="mb-1 text-xs font-medium text-black/40 uppercase tracking-wide">
                          {p.barcode}
                        </div>
                        <div className="mb-1 font-semibold text-black/80 leading-tight">{p.name}</div>
                        <div className="text-lg font-bold text-emerald-600">
                          {sym}{price.toFixed(2)}
                        </div>
                        <div className="mt-1 text-xs text-black/40">Stock: {qty}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Sidebar: stats + recent sales */}
        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="mb-3 font-semibold text-sm">Demo Business Stats</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-black/50">Products</span>
                <span className="font-medium">{products.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-black/50">Categories</span>
                <span className="font-medium">{categories.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-black/50">Currency</span>
                <span className="font-medium">{currency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-black/50">MoMo</span>
                <span className="font-medium text-emerald-600">Enabled</span>
              </div>
              <div className="flex justify-between">
                <span className="text-black/50">VAT</span>
                <span className="font-medium text-emerald-600">Enabled</span>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <h3 className="mb-3 font-semibold text-sm">Recent Sales</h3>
            {recentSales.length === 0 ? (
              <p className="text-xs text-black/40">No sales yet in demo.</p>
            ) : (
              <div className="space-y-2">
                {recentSales.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-sm">
                    <div>
                    <div className="font-medium">{sym}{(s.totalPence / 100).toFixed(2)}</div>
                    <div className="text-xs text-black/40">Invoice</div>
                    </div>
                    <div className="text-xs text-black/30">
                      {new Date(s.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* CTA */}
          <div className="rounded-2xl bg-gradient-to-br from-accent to-blue-900 p-6 text-white">
            <h3 className="mb-2 font-bold text-lg leading-tight">Ready for your store?</h3>
            <p className="mb-4 text-sm text-white/80">
              Get a full instance with multi-branch, WhatsApp alerts, offline mode, and more.
            </p>
            <a
              href="/register"
              className="block rounded-xl bg-white px-4 py-2 text-center text-sm font-semibold text-accent hover:bg-blue-50"
            >
              Create Free Account
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
