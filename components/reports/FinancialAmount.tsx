import { formatMoney } from '@/lib/format';

const BASE =
  'max-w-full whitespace-nowrap tabular-nums text-ink';

const VARIANT = {
  hero: `${BASE} block w-full font-display font-semibold leading-none [font-size:clamp(1.05rem,9cqi,2rem)]`,
  prominent: `${BASE} block w-full font-display font-semibold leading-none [font-size:clamp(0.8rem,8cqi,1.5rem)]`,
  inline: `${BASE} inline-block font-semibold leading-none [font-size:clamp(0.8rem,6cqi,1.125rem)]`,
  compact: `${BASE} inline-block font-semibold leading-none [font-size:clamp(0.7rem,5cqi,0.875rem)]`,
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
