import DemoTrySale from '../_components/DemoTrySale';

export const metadata = {
  title: 'Try a sample sale | Adom Retail Demo',
};

export default function DemoTrySalePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-ink">Try a sample sale</h1>
        <p className="mt-1 text-sm text-muted">
          Search products, build a cart, choose Cash, MoMo, credit or card, and complete a practice checkout.
        </p>
      </div>
      <DemoTrySale />
    </div>
  );
}
