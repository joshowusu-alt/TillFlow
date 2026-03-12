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
		<div className="card overflow-x-auto p-4">
			{title ? <h2 className="text-lg font-display font-semibold">{title}</h2> : null}
			<table className={tableClassName}>{children}</table>
		</div>
	);
}