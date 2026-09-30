import { formatMoney } from '@/lib/format';

const VARIANT = {
  hero: 'financial-amount financial-amount--hero font-display',
  prominent: 'financial-amount financial-amount--prominent font-display',
  inline: 'financial-amount financial-amount--inline',
  compact: 'financial-amount financial-amount--compact',
} as const;

export type FinancialAmountVariant = keyof typeof VARIANT;

export type FinancialAmountProps = {
  pence: number;
  currency: string;
  variant?: FinancialAmountVariant;
  className?: string;
  'data-testid'?: string;
};

export default function FinancialAmount({
  pence,
  currency,
  variant = 'inline',
  className = '',
  'data-testid': testId = 'financial-amount',
}: FinancialAmountProps) {
  const amount =
    pence < 0 ? `−${formatMoney(Math.abs(pence), currency)}` : formatMoney(pence, currency);
  return (
    <span
      data-financial-amount={testId}
      data-testid={testId}
      className={`${VARIANT[variant]} ${className}`.trim()}
    >
      {amount}
    </span>
  );
}
