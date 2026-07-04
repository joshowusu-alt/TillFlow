type OperationalMetricCardProps = {
  label: string;
  value: string;
  helper?: string;
};

export default function OperationalMetricCard({ label, value, helper }: OperationalMetricCardProps) {
  return (
    <div className="operational-metric-card">
      <div className="operational-metric-card__label">{label}</div>
      <div className="operational-metric-card__value">{value}</div>
      {helper ? <div className="operational-metric-card__helper">{helper}</div> : null}
    </div>
  );
}
