type ReceiptData = {
  business: {
    name: string;
    currency: string;
    vatEnabled: boolean;
    vatNumber?: string | null;
    address?: string | null;
    phone?: string | null;
    tinNumber?: string | null;
  };
  store: { name: string };
  cashier: { name: string };
  customer?: { name: string; phone?: string | null } | null;
  invoice: {
    id: string;
    createdAt: string;
    transactionNumber?: string | null;
    subtotalPence: number;
    vatPence: number;
    totalPence: number;
    discountPence?: number;
    changeDuePence?: number;
  };
  lines: {
    name: string;
    qtyLabel: string;
    unitPricePence: number;
    lineTotalPence: number;
    lineDiscountPence: number;
    promoDiscountPence: number;
  }[];
  payments: {
    method: string;
    amountPence: number;
    reference?: string | null;
    network?: string | null;
    payerMsisdn?: string | null;
  }[];
  template: string;
};

const TEXT_ENCODER = new TextEncoder();

const appendText = (buffer: number[], text: string) => {
  buffer.push(...TEXT_ENCODER.encode(text));
};

const appendCmd = (buffer: number[], bytes: number[]) => {
  buffer.push(...bytes);
};

const appendLine = (buffer: number[], text = '') => {
  appendText(buffer, `${text}\n`);
};

const sanitize = (value: string) => value.replace(/[^\x20-\x7E]/g, '');

const formatMoney = (pence: number, currency: string) => {
  const amount = (pence / 100).toFixed(2);
  return `${currency} ${amount}`;
};

const padRight = (value: string, width: number) => {
  const clean = sanitize(value);
  return clean.length >= width ? clean.slice(0, width) : `${clean}${' '.repeat(width - clean.length)}`;
};

const padLeft = (value: string, width: number) => {
  const clean = sanitize(value);
  return clean.length >= width ? clean.slice(0, width) : `${' '.repeat(width - clean.length)}${clean}`;
};

const wrapText = (value: string, width: number) => {
  const clean = sanitize(value).replace(/\s+/g, ' ').trim();
  if (!clean) return [''];

  const words = clean.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (word.length > width) {
      if (current) {
        lines.push(current);
        current = '';
      }

      for (let index = 0; index < word.length; index += width) {
        const chunk = word.slice(index, index + width);
        if (chunk.length === width) {
          lines.push(chunk);
        } else {
          current = chunk;
        }
      }
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= width) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines;
};

const formatLine = (left: string, right: string, width: number) => {
  const cleanLeft = sanitize(left);
  const cleanRight = sanitize(right);
  const space = Math.max(width - cleanLeft.length - cleanRight.length, 1);
  return `${cleanLeft}${' '.repeat(space)}${cleanRight}`;
};

const formatItemRow = (
  index: number,
  line: ReceiptData['lines'][number],
  currency: string,
  config: { index: number; item: number; qty: number; total: number }
) => {
  const descriptionLines = wrapText(line.name, config.item);
  const qtyLines = wrapText(line.qtyLabel, config.qty);
  const total = formatMoney(line.lineTotalPence, currency);
  const rows: string[] = [];
  const rowCount = Math.max(descriptionLines.length, qtyLines.length, 1);

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    rows.push(
      [
        padRight(rowIndex === 0 ? String(index + 1) : '', config.index),
        padRight(descriptionLines[rowIndex] ?? '', config.item),
        padLeft(qtyLines[rowIndex] ?? '', config.qty),
        padLeft(rowIndex === 0 ? total : '', config.total)
      ].join(' ')
    );
  }

  return rows;
};

export const toHexString = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

export function buildEscPosReceipt(data: ReceiptData) {
  const width = data.template === 'THERMAL_80' ? 42 : 48;
  const itemColumns =
    data.template === 'THERMAL_80'
      ? { index: 3, item: 17, qty: 8, total: 11 }
      : { index: 3, item: 24, qty: 8, total: 10 };
  const noteWidth = width - 4;
  const buffer: number[] = [];
  const lineDiscountTotal = data.lines.reduce(
    (sum, line) => sum + line.lineDiscountPence + line.promoDiscountPence,
    0
  );

  appendCmd(buffer, [0x1b, 0x40]);
  appendCmd(buffer, [0x1b, 0x61, 0x01]);
  appendCmd(buffer, [0x1b, 0x45, 0x01]);
  appendLine(buffer, sanitize(data.business.name));
  appendCmd(buffer, [0x1b, 0x45, 0x00]);
  appendLine(buffer, sanitize(data.store.name));
  if (data.business.address) appendLine(buffer, sanitize(data.business.address));
  if (data.business.phone) appendLine(buffer, `Tel: ${sanitize(data.business.phone)}`);
  if (data.business.vatEnabled) {
    appendLine(buffer, `VAT: ${sanitize(data.business.vatNumber ?? 'N/A')}`);
  }
  if (data.business.tinNumber) {
    appendLine(buffer, `TIN: ${sanitize(data.business.tinNumber)}`);
  }
  appendLine(buffer);

  appendCmd(buffer, [0x1b, 0x61, 0x00]);
  appendLine(
    buffer,
    `Receipt: ${sanitize(data.invoice.transactionNumber ?? data.invoice.id.slice(0, 8).toUpperCase())}`
  );
  appendLine(buffer, `Date: ${new Date(data.invoice.createdAt).toLocaleString('en-GB')}`);
  appendLine(buffer, `Cashier: ${sanitize(data.cashier.name)}`);
  if (data.customer?.name) appendLine(buffer, `Customer: ${sanitize(data.customer.name)}`);
  if (data.customer?.phone) appendLine(buffer, `Phone: ${sanitize(data.customer.phone)}`);

  appendLine(buffer, '-'.repeat(width));
  appendLine(
    buffer,
    [
      padRight('#', itemColumns.index),
      padRight('DESCRIPTION', itemColumns.item),
      padLeft('QTY', itemColumns.qty),
      padLeft('TOTAL', itemColumns.total)
    ].join(' ')
  );
  appendLine(buffer, '-'.repeat(width));

  data.lines.forEach((line, index) => {
    formatItemRow(index, line, data.business.currency, itemColumns).forEach((row) => {
      appendLine(buffer, row);
    });

    const discount = line.lineDiscountPence + line.promoDiscountPence;
    if (discount > 0) {
      wrapText(`Discount ${formatMoney(discount, data.business.currency)}`, noteWidth).forEach(
        (noteLine) => {
          appendLine(buffer, `    ${noteLine}`);
        }
      );
    }

    appendLine(buffer);
  });

  appendLine(buffer, '-'.repeat(width));
  appendLine(
    buffer,
    formatLine('Net subtotal', formatMoney(data.invoice.subtotalPence, data.business.currency), width)
  );
  if (lineDiscountTotal > 0) {
    appendLine(
      buffer,
      formatLine('Discounts applied', formatMoney(lineDiscountTotal, data.business.currency), width)
    );
  }
  if (data.invoice.discountPence && data.invoice.discountPence > 0) {
    appendLine(
      buffer,
      formatLine('Order discount', formatMoney(data.invoice.discountPence, data.business.currency), width)
    );
  }
  if (data.business.vatEnabled) {
    appendLine(buffer, formatLine('VAT', formatMoney(data.invoice.vatPence, data.business.currency), width));
  }
  appendCmd(buffer, [0x1b, 0x45, 0x01]);
  appendLine(buffer, formatLine('TOTAL', formatMoney(data.invoice.totalPence, data.business.currency), width));
  appendCmd(buffer, [0x1b, 0x45, 0x00]);

  appendLine(buffer, '-'.repeat(width));
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
  const momoPayments = data.payments.filter(
    (payment) => payment.method === 'MOBILE_MONEY' && payment.amountPence > 0
  );

  appendLine(buffer, formatLine('Paid (cash)', formatMoney(cashPaid, data.business.currency), width));
  if (cardPaid > 0) {
    appendLine(buffer, formatLine('Paid (card)', formatMoney(cardPaid, data.business.currency), width));
  }
  if (transferPaid > 0) {
    appendLine(
      buffer,
      formatLine('Paid (transfer)', formatMoney(transferPaid, data.business.currency), width)
    );
  }
  if (momoPaid > 0) {
    appendLine(buffer, formatLine('Paid (MoMo)', formatMoney(momoPaid, data.business.currency), width));
    for (const payment of momoPayments) {
      const details = `${payment.network ?? 'MOMO'} ${payment.payerMsisdn ?? ''}`.trim();
      if (details) appendLine(buffer, `    ${sanitize(details)}`);
      if (payment.reference) appendLine(buffer, `    Ref: ${sanitize(payment.reference)}`);
    }
  }
  if (data.invoice.changeDuePence && data.invoice.changeDuePence > 0) {
    appendLine(
      buffer,
      formatLine('Change due', formatMoney(data.invoice.changeDuePence, data.business.currency), width)
    );
  }

  appendCmd(buffer, [0x1b, 0x61, 0x01]);
  appendLine(buffer);
  appendLine(buffer, 'Thank you for shopping with us.');
  appendCmd(buffer, [0x1d, 0x56, 0x01]);

  return new Uint8Array(buffer);
}
