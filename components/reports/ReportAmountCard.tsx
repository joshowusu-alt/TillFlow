import StatCard from '@/components/StatCard';
import FinancialAmount from '@/components/reports/FinancialAmount';

/** Reports-only adapter: other StatCard consumers, including Home, are unchanged. */
export default function ReportAmountCard({ pence, currency, label, helper, tone = 'default', unavailableLabel = '—' }: {
  pence: number | null;
  unavailableLabel?: string;
  currency: string;
  label: string;
  helper?: string;
  tone?: 'default' | 'accent' | 'danger' | 'success' | 'warn';
}) {
  return <StatCard label={label} helper={helper} tone={tone} value={pence == null ? unavailableLabel : (
    <div className="financial-fit" data-report-amount-card>
      <FinancialAmount pence={pence} currency={currency} variant="prominent" />
    </div>
  )} />;
}
