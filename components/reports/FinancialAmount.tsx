import { formatMoney } from '@/lib/format';

const BASE =
  'max-w-full tabular-nums text-ink [overflow-wrap:anywhere] [word-break:break-word]';

const VARIANT = {
  hero: `${BASE} block w-full font-display font-semibold leading-tight text-[clamp(1.35rem,5vw+0.35rem,2rem)]`,
  prominent: `${BASE} block w-full font-display text-xl font-semibold sm:text-2xl`,
  inline: `${BASE} inline-block font-semibold text-base sm:text-lg`,
  compact: `${BASE} inline-block text-sm font-semibold`,
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
