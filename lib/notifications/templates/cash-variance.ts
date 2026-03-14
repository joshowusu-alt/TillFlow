import { formatMoney } from '@/lib/format';
import { buildWhatsAppDeepLink } from '@/lib/notifications/providers';

export function buildCashVarianceTemplate(input: {
  recipient?: string | null;
  businessName: string;
  cashierName: string;
  expectedCashPence: number;
  actualCashPence: number;
  variancePence: number;
  shiftRangeLabel: string;
  currency?: string | null;
}) {
  const currency = input.currency ?? 'GHS';
  const varianceLabel =
    input.variancePence === 0
      ? formatMoney(0, currency)
      : `${input.variancePence > 0 ? '+' : '-'}${formatMoney(Math.abs(input.variancePence), currency)}`;

  const lines = [
    `${input.businessName} - Cash Variance Alert`,
    `Cashier: ${input.cashierName}`,
    `Shift: ${input.shiftRangeLabel}`,
    '',
    `Expected cash: ${formatMoney(input.expectedCashPence, currency)}`,
    `Actual cash: ${formatMoney(input.actualCashPence, currency)}`,
    `Variance: ${varianceLabel}`,
    '',
    'Please review this shift closure.',
    'Sent by TillFlow POS',
  ];

  const text = lines.join('\n');
  return {
    text,
    deepLink: buildWhatsAppDeepLink(input.recipient ?? '', text),
  };
}
