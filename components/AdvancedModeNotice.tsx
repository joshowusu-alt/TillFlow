import Link from 'next/link';

export default function AdvancedModeNotice({
  title = 'Advanced mode required',
  description = 'Enable Advanced mode in Settings to access this section.'
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="card p-6 space-y-3">
      <div className="text-lg font-display font-semibold">{title}</div>
      <p className="text-sm text-black/60">{description}</p>
      <Link href="/settings" className="btn-primary w-fit">
        Go to Settings
      </Link>
    </div>
  );
}
