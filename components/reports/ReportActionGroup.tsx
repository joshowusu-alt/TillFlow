import type { ReactNode } from 'react';

export default function ReportActionGroup({
	children,
	className = '',
}: {
	children: ReactNode;
	className?: string;
}) {
	return <div className={`flex flex-wrap gap-2 ${className}`.trim()}>{children}</div>;
}