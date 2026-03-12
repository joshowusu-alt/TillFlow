import type { ReactNode } from 'react';

import ReportFilterCard from './ReportFilterCard';

export default function DateRangeFilterCard({
	from,
	to,
	submitLabel = 'Update',
	submitTone = 'primary',
	extraFields,
}: {
	from: string;
	to: string;
	submitLabel?: string;
	submitTone?: 'primary' | 'secondary';
	extraFields?: ReactNode;
}) {
	const hasExtraFields = !!extraFields;

	return (
		<ReportFilterCard
			columnsClassName={hasExtraFields ? 'md:grid-cols-4' : 'md:grid-cols-3'}
			submitLabel={submitLabel}
			submitTone={submitTone}
		>
			<div>
				<label className="label">From</label>
				<input className="input" name="from" type="date" defaultValue={from} />
			</div>
			<div>
				<label className="label">To</label>
				<input className="input" name="to" type="date" defaultValue={to} />
			</div>
			{extraFields}
		</ReportFilterCard>
	);
}