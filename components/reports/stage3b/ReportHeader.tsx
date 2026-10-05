import type { ReactNode } from 'react';
import ReportsDestinationHead from '@/components/reports/ReportsDestinationHead';
import ReportsRefresh from '@/components/reports/ReportsRefresh';
import ReportMoreActions from './ReportMoreActions';

/** Scoped to Stage 3B destinations; the layout continues to own the single return landmark. */
export default function ReportHeader({ title, scopeLabel, periodLabel, actions }: {
  title: string; scopeLabel: string; periodLabel: string; actions?: ReactNode;
}) {
  return <ReportsDestinationHead title={title} scopeLabel={scopeLabel} periodLabel={periodLabel} showRefresh={false}
    actions={<><ReportsRefresh compact fetchedAt={new Date().toISOString()} autoRefreshMs={title === 'Trading' ? 120_000 : undefined} />{actions ? <ReportMoreActions>{actions}</ReportMoreActions> : null}</>} />;
}
