import type { ReactNode } from 'react';

export function ReportSummaryRow({
	label,
	value,
	divider = 'none',
	emphasis = 'normal',
	inset = false,
	tone = 'default',
}: {
	label: ReactNode;
	value: ReactNode;
	divider?: 'none' | 'subtle' | 'default';
	emphasis?: 'normal' | 'strong';
	inset?: boolean;
	tone?: 'default' | 'muted';
}) {
	const className = [
		'flex justify-between',
		divider === 'subtle' ? 'border-t border-black/5 pt-2' : '',
		divider === 'default' ? 'border-t border-black/10 pt-2' : '',
		emphasis === 'strong' ? 'text-base font-semibold' : '',
		inset ? 'pl-4 text-xs' : '',
		tone === 'muted' ? 'text-black/60' : '',
	].filter(Boolean).join(' ');

	return (
		<div className={className}>
			<span>{label}</span>
			<span className="font-semibold">{value}</span>
		</div>
	);
}

export default function ReportSummaryCard({
	children,
	spacingClassName = 'space-y-3',
}: {
	children: ReactNode;
	spacingClassName?: string;
}) {
	return <div className={`card p-6 text-sm ${spacingClassName}`}>{children}</div>;
}