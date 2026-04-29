/**
 * Storefront payment-mode helpers shared by the public storefront and the
 * order confirmation page.
 *
 * Modes:
 *   MOMO_NUMBER           - merchant receives MoMo to a regular phone number
 *   MERCHANT_SHORTCODE    - merchant receives MoMo via a short merchant ID
 *   BANK_TRANSFER         - customer pays into a bank account
 *   MANUAL_CONFIRMATION   - merchant contacts customer with payment instructions
 */

export type StorefrontPaymentMode =
  | 'MOMO_NUMBER'
  | 'MERCHANT_SHORTCODE'
  | 'BANK_TRANSFER'
  | 'MANUAL_CONFIRMATION';

const VALID_MODES: ReadonlyArray<StorefrontPaymentMode> = [
  'MOMO_NUMBER',
  'MERCHANT_SHORTCODE',
  'BANK_TRANSFER',
  'MANUAL_CONFIRMATION',
];

export function normalizePaymentMode(value: string | null | undefined): StorefrontPaymentMode {
  if (!value) return 'MOMO_NUMBER';
  const upper = value.toUpperCase();
  return (VALID_MODES as readonly string[]).includes(upper)
    ? (upper as StorefrontPaymentMode)
    : 'MOMO_NUMBER';
}

export type StorefrontPaymentConfig = {
  mode: StorefrontPaymentMode;
  momoNumber: string | null;
  momoNetwork: string | null;
  merchantShortcode: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankBranch: string | null;
  paymentNote: string | null;
};

/**
 * Produce a short customer-facing instruction line ("Send GH₵X to ...") tailored
 * to the configured payment mode. Returns `null` when the merchant has not yet
 * filled in the details required for the selected mode.
 */
export function getPaymentInstructionLine(
  config: StorefrontPaymentConfig,
  amountFormatted: string,
  reference: string,
): string {
  switch (config.mode) {
    case 'MERCHANT_SHORTCODE':
      if (!config.merchantShortcode) {
        return `Send ${amountFormatted}. Reference: ${reference}.`;
      }
      return `Send ${amountFormatted} to merchant number ${config.merchantShortcode}. Use ${reference} as the payment reference.`;
    case 'BANK_TRANSFER': {
      const parts = [config.bankName, config.bankAccountNumber].filter(Boolean).join(' · ');
      if (!parts) {
        return `Send ${amountFormatted} via bank transfer. Reference: ${reference}.`;
      }
      return `Send ${amountFormatted} via bank transfer to ${parts}. Use ${reference} as the payment reference.`;
    }
    case 'MANUAL_CONFIRMATION':
      return `We'll contact you with payment instructions for ${reference} (${amountFormatted}).`;
    case 'MOMO_NUMBER':
    default:
      if (!config.momoNumber) {
        return `Send ${amountFormatted}. Reference: ${reference}.`;
      }
      return config.momoNetwork
        ? `Send ${amountFormatted} to ${config.momoNumber} on ${config.momoNetwork}. Use ${reference} as the payment reference.`
        : `Send ${amountFormatted} to ${config.momoNumber}. Use ${reference} as the payment reference.`;
  }
}

/**
 * Long-form instruction body shown on the order confirmation screen. Returns a
 * structured object the UI can render: a human label for the mode, the recipient
 * details to display, and a fallback message when the mode is manual or
 * details are missing.
 */
export function getPaymentInstructionDetails(config: StorefrontPaymentConfig) {
  switch (config.mode) {
    case 'MERCHANT_SHORTCODE':
      return {
        modeLabel: 'Merchant number',
        recipient: config.merchantShortcode,
        recipientCaption: config.momoNetwork ?? null,
        manual: false,
        ready: Boolean(config.merchantShortcode),
      };
    case 'BANK_TRANSFER':
      return {
        modeLabel: 'Bank transfer',
        recipient: config.bankAccountNumber,
        recipientCaption: [config.bankName, config.bankAccountName, config.bankBranch].filter(Boolean).join(' · ') || null,
        manual: false,
        ready: Boolean(config.bankAccountNumber && config.bankName),
      };
    case 'MANUAL_CONFIRMATION':
      return {
        modeLabel: 'Payment on contact',
        recipient: null,
        recipientCaption: 'The store will reach out with payment instructions shortly.',
        manual: true,
        ready: true,
      };
    case 'MOMO_NUMBER':
    default:
      return {
        modeLabel: 'Mobile money',
        recipient: config.momoNumber,
        recipientCaption: config.momoNetwork,
        manual: false,
        ready: Boolean(config.momoNumber),
      };
  }
}

/**
 * Pre-formatted WhatsApp share message for the customer to send to the store.
 * Always references the order code, includes the amount, and adapts to the
 * configured payment mode so the customer never sees "ask the store" copy.
 */
export function buildPaymentShareMessage(args: {
  storeName: string;
  reference: string;
  amountFormatted: string;
  config: StorefrontPaymentConfig;
}): string {
  const { storeName, reference, amountFormatted, config } = args;
  const head = `Hi, I placed an order at ${storeName}. My reference is *${reference}* for ${amountFormatted}.`;

  switch (config.mode) {
    case 'MERCHANT_SHORTCODE':
      return [
        head,
        config.merchantShortcode
          ? `Please send payment to merchant number ${config.merchantShortcode} using ${reference} as the reference note.`
          : `Please confirm the merchant number to use for payment.`,
      ].join('\n');
    case 'BANK_TRANSFER': {
      const lines = [head];
      if (config.bankName) lines.push(`Bank: ${config.bankName}`);
      if (config.bankAccountName) lines.push(`Account name: ${config.bankAccountName}`);
      if (config.bankAccountNumber) lines.push(`Account number: ${config.bankAccountNumber}`);
      if (config.bankBranch) lines.push(`Branch: ${config.bankBranch}`);
      lines.push(`Use ${reference} as the payment reference note.`);
      return lines.join('\n');
    }
    case 'MANUAL_CONFIRMATION':
      return [
        head,
        `Please reach out with payment instructions and I'll send the money straight away.`,
      ].join('\n');
    case 'MOMO_NUMBER':
    default:
      return [
        head,
        config.momoNumber
          ? `Please send payment to ${config.momoNumber}${config.momoNetwork ? ` on ${config.momoNetwork}` : ''} using ${reference} as the reference note.`
          : `Please confirm the MoMo number to send the payment.`,
      ].join('\n');
  }
}
