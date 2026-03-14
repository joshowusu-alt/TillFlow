import { formatMoney } from '@/lib/format';
import { buildWhatsAppDeepLink } from '@/lib/notifications/providers';

export function buildDebtorReminderTemplate(input: {
  recipient?: string | null;
  businessName: string;
  customerName: string;
  outstandingBalancePence: number;
  lastPaymentDateLabel: string;
  agingDays: number;
  currency?: string | null;
}) {
  const currency = input.currency ?? 'GHS';
  const lines = [
    `Hello ${input.customerName},`,
    '',
    `${input.businessName} is reminding you about your outstanding balance.`,
    `Outstanding balance: ${formatMoney(input.outstandingBalancePence, currency)}`,
    `Last payment: ${input.lastPaymentDateLabel}`,
    `Aging: ${input.agingDays} day${input.agingDays === 1 ? '' : 's'}`,
    '',
    'Please make payment at your earliest convenience. Thank you.',
    'Sent by TillFlow POS',
  ];

  const text = lines.join('\n');
  return {
    text,
    deepLink: buildWhatsAppDeepLink(input.recipient ?? '', text),
  };
}
