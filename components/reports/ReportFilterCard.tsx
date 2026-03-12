import type { ReactNode } from 'react';

type SubmitTone = 'primary' | 'secondary';

export default function ReportFilterCard({
	children,
	actions,
	columnsClassName = 'sm:grid-cols-4',
	method = 'GET',
	submitLabel = 'Apply',
	submitTone = 'secondary',
}: {
	children: ReactNode;
	actions?: ReactNode;
	columnsClassName?: string;
	method?: 'GET' | 'POST';
	submitLabel?: string;
	submitTone?: SubmitTone;
}) {
	const submitClassName = submitTone === 'primary' ? 'btn-primary' : 'btn-secondary';

	return (
		<form className={`card grid gap-3 p-4 ${columnsClassName}`.trim()} method={method}>
			{children}
			<div className="flex items-end">
				<button className={`${submitClassName} w-full`} type="submit">
					{submitLabel}
				</button>
			</div>
			{actions ? <div className="flex items-end gap-2">{actions}</div> : null}
		</form>
	);
}