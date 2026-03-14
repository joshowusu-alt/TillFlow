import { formatMoney } from '@/lib/format';
import { buildWhatsAppDeepLink } from '@/lib/notifications/providers';

export function buildVoidReturnAlertTemplate(input: {
  recipient?: string | null;
  businessName: string;
  kind: 'VOID' | 'RETURN';
  cashierName: string;
  invoiceNumber: string;
  amountPence: number;
  items: string[];
  reason: string;
  currency?: string | null;
}) {
  const currency = input.currency ?? 'GHS';
  const lines = [
    `${input.businessName} - ${input.kind === 'VOID' ? 'Large Void' : 'Large Return'} Alert`,
    `Cashier: ${input.cashierName}`,
    `Invoice: ${input.invoiceNumber}`,
    `${input.kind === 'VOID' ? 'Void amount' : 'Return amount'}: ${formatMoney(input.amountPence, currency)}`,
    `Reason: ${input.reason}`,
    '',
    'Items:',
    ...(input.items.length > 0 ? input.items.map((item) => `- ${item}`) : ['- No items recorded']),
    '',
    'Please review this transaction.',
    'Sent by TillFlow POS',
  ];

  const text = lines.join('\n');
  return {
    text,
    deepLink: buildWhatsAppDeepLink(input.recipient ?? '', text),
  };
}
