type ReceiptData = {
  business: {
    name: string;
    currency: string;
    vatEnabled: boolean;
    vatNumber?: string | null;
  };
  store: { name: string };
  cashier: { name: string };
  customer?: { name: string; phone?: string | null } | null;
  invoice: {
    id: string;
    createdAt: string;
    subtotalPence: number;
    vatPence: number;
    totalPence: number;
    discountPence?: number;
  };
  lines: {
    name: string;
    qtyLabel: string;
    unitPricePence: number;
    lineTotalPence: number;
    lineDiscountPence: number;
    promoDiscountPence: number;
  }[];
  payments: { method: string; amountPence: number }[];
  template: string;
};

const TEXT_ENCODER = new TextEncoder();

const appendText = (buffer: number[], text: string) => {
  buffer.push(...TEXT_ENCODER.encode(text));
};

const appendCmd = (buffer: number[], bytes: number[]) => {
  buffer.push(...bytes);
};

const sanitize = (value: string) => value.replace(/[^\x20-\x7E]/g, '');

const formatMoney = (pence: number, currency: string) => {
  const amount = (pence / 100).toFixed(2);
  return `${currency} ${amount}`;
};

const formatLine = (left: string, right: string, width: number) => {
  const cleanLeft = sanitize(left);
  const cleanRight = sanitize(right);
  const space = Math.max(width - cleanLeft.length - cleanRight.length, 1);
  return `${cleanLeft}${' '.repeat(space)}${cleanRight}`;
};

export const toHexString = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

export function buildEscPosReceipt(data: ReceiptData) {
  const width = data.template === 'THERMAL_80' ? 42 : 48;
  const buffer: number[] = [];

  appendCmd(buffer, [0x1b, 0x40]); // init
  appendCmd(buffer, [0x1b, 0x61, 0x01]); // align center
  appendCmd(buffer, [0x1b, 0x45, 0x01]); // bold on
  appendText(buffer, `${sanitize(data.business.name)}\n`);
  appendCmd(buffer, [0x1b, 0x45, 0x00]); // bold off
  appendText(buffer, `${sanitize(data.store.name)}\n`);
  if (data.business.vatEnabled) {
    appendText(buffer, `VAT: ${sanitize(data.business.vatNumber ?? 'N/A')}\n`);
  }
  appendText(buffer, '\n');

  appendCmd(buffer, [0x1b, 0x61, 0x00]); // align left
  appendText(buffer, `Receipt: ${sanitize(data.invoice.id.slice(0, 8))}\n`);
  appendText(buffer, `Date: ${new Date(data.invoice.createdAt).toLocaleString('en-GB')}\n`);
  appendText(buffer, `Cashier: ${sanitize(data.cashier.name)}\n`);
  if (data.customer) {
    appendText(buffer, `Customer: ${sanitize(data.customer.name)}\n`);
  }
  appendText(buffer, `${'-'.repeat(width)}\n`);

  data.lines.forEach((line) => {
    appendText(buffer, `${sanitize(line.name)}\n`);
    appendText(buffer, `${sanitize(line.qtyLabel)}\n`);
    appendText(
      buffer,
      `${formatLine(
        formatMoney(line.lineTotalPence, data.business.currency),
        formatMoney(line.unitPricePence, data.business.currency),
        width
      )}\n`
    );
    const discount = line.lineDiscountPence + line.promoDiscountPence;
    if (discount > 0) {
      appendText(buffer, `Discounts: ${formatMoney(discount, data.business.currency)}\n`);
    }
    appendText(buffer, '\n');
  });

  appendText(buffer, `${'-'.repeat(width)}\n`);
  appendText(
    buffer,
    `${formatLine('Net subtotal', formatMoney(data.invoice.subtotalPence, data.business.currency), width)}\n`
  );
  if (data.invoice.discountPence && data.invoice.discountPence > 0) {
    appendText(
      buffer,
      `${formatLine(
        'Order discount',
        formatMoney(data.invoice.discountPence, data.business.currency),
        width
      )}\n`
    );
  }
  if (data.business.vatEnabled) {
    appendText(
      buffer,
      `${formatLine('VAT', formatMoney(data.invoice.vatPence, data.business.currency), width)}\n`
    );
  }
  appendCmd(buffer, [0x1b, 0x45, 0x01]); // bold
  appendText(
    buffer,
    `${formatLine('Total', formatMoney(data.invoice.totalPence, data.business.currency), width)}\n`
  );
  appendCmd(buffer, [0x1b, 0x45, 0x00]); // bold off

  appendText(buffer, `${'-'.repeat(width)}\n`);
  const cashPaid = data.payments
    .filter((payment) => payment.method === 'CASH')
    .reduce((sum, payment) => sum + payment.amountPence, 0);
  const cardPaid = data.payments
    .filter((payment) => payment.method === 'CARD')
    .reduce((sum, payment) => sum + payment.amountPence, 0);
  const transferPaid = data.payments
    .filter((payment) => payment.method === 'TRANSFER')
    .reduce((sum, payment) => sum + payment.amountPence, 0);
  const momoPaid = data.payments
    .filter((payment) => payment.method === 'MOBILE_MONEY')
    .reduce((sum, payment) => sum + payment.amountPence, 0);
  appendText(
    buffer,
    `${formatLine('Paid (cash)', formatMoney(cashPaid, data.business.currency), width)}\n`
  );
  if (cardPaid > 0) {
    appendText(
      buffer,
      `${formatLine('Paid (card)', formatMoney(cardPaid, data.business.currency), width)}\n`
    );
  }
  if (transferPaid > 0) {
    appendText(
      buffer,
      `${formatLine('Paid (transfer)', formatMoney(transferPaid, data.business.currency), width)}\n`
    );
  }
  if (momoPaid > 0) {
    appendText(
      buffer,
      `${formatLine('Paid (MoMo)', formatMoney(momoPaid, data.business.currency), width)}\n`
    );
  }

  appendCmd(buffer, [0x1b, 0x61, 0x01]); // center
  appendText(buffer, '\nThank you for shopping.\n');
  appendCmd(buffer, [0x1d, 0x56, 0x01]); // cut

  return new Uint8Array(buffer);
}
