import type { ReactNode } from 'react';

type SubmitTone = 'primary' | 'secondary';

export default function ReportFilterCard({
	children,
	actions,
	columnsClassName = 'sm:grid-cols-4',
	method = 'GET',
	submitLabel = 'Apply',
	submitTone = 'secondary',
	submitExtraClassName = '',
}: {
	children: ReactNode;
	actions?: ReactNode;
	columnsClassName?: string;
	method?: 'GET' | 'POST';
	submitLabel?: string;
	submitTone?: SubmitTone;
	submitExtraClassName?: string;
}) {
	const submitClassName = submitTone === 'primary' ? 'btn-primary' : 'btn-secondary';

	return (
		<form className={`card grid gap-3 p-3.5 sm:p-4 ${columnsClassName}`.trim()} method={method}>
			{children}
			<div className="flex items-end">
				<button className={`${submitClassName} w-full ${submitExtraClassName}`.trim()} type="submit">
					{submitLabel}
				</button>
			</div>
			{actions ? <div className="flex items-end gap-2 [&>*]:w-full sm:[&>*]:w-auto">{actions}</div> : null}
		</form>
	);
}
