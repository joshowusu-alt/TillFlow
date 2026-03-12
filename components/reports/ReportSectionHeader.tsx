import type { ReactNode } from 'react';

export default function ReportSectionHeader({
	title,
	subtitle,
	trailing,
	className = 'mb-3',
	titleClassName = '',
}: {
	title: ReactNode;
	subtitle?: ReactNode;
	trailing?: ReactNode;
	className?: string;
	titleClassName?: string;
}) {
	return (
		<div className={`flex flex-wrap items-center justify-between gap-2 ${className}`.trim()}>
			<div>
				<h2 className={`text-lg font-display font-semibold ${titleClassName}`.trim()}>{title}</h2>
				{subtitle ? <p className="text-sm text-black/50">{subtitle}</p> : null}
			</div>
			{trailing ? <div className="flex items-center gap-2">{trailing}</div> : null}
		</div>
	);
}