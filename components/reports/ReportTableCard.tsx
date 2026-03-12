import type { ReactNode } from 'react';

export function ReportTableEmptyRow({
	colSpan,
	message,
	paddingClassName = 'px-3 py-6',
}: {
	colSpan: number;
	message: string;
	paddingClassName?: string;
}) {
	return (
		<tr>
			<td colSpan={colSpan} className={`${paddingClassName} text-center text-sm text-black/50`}>
				{message}
			</td>
		</tr>
	);
}

export default function ReportTableCard({
	title,
	children,
	tableClassName = 'table mt-3 w-full border-separate border-spacing-y-2',
}: {
	title?: string;
	children: ReactNode;
	tableClassName?: string;
}) {
	return (
		<div className="card overflow-hidden p-3.5 sm:p-4">
			{title ? <h2 className="text-base font-display font-semibold sm:text-lg">{title}</h2> : null}
			<div className="-mx-1 overflow-x-auto px-1 sm:mx-0 sm:px-0">
				<table className={tableClassName}>{children}</table>
			</div>
		</div>
	);
}