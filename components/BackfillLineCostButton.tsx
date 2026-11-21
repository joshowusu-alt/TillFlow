import Link from 'next/link';

export default function BackfillLineCostButton() {
  return <div className="space-y-2">
    <p className="text-sm text-slate-600">Historical costs require original purchase and journal evidence. Automatic backfill from present-day product costs is disabled.</p>
    <Link href="/products/cost-resolution" className="btn-secondary inline-flex min-h-11 items-center">Review missing costs →</Link>
  </div>;
}
