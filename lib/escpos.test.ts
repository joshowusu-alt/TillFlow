import { describe, expect, it } from 'vitest';
import { buildEscPosReceipt } from './escpos';

const receipt = {
  business: { name: 'Test shop', currency: 'GHS', vatEnabled: false },
  store: { name: 'Main' }, cashier: { name: 'Cashier' },
  invoice: { id: 'sale', createdAt: '2026-11-25T10:00:00Z', subtotalPence: 5000, vatPence: 0, totalPence: 5000 },
  lines: [], template: 'THERMAL_80',
};

describe('ESC/POS receipt payments', () => {
  it.each([
    ['MOBILE_MONEY', 'Paid (MoMo)'],
    ['CARD', 'Paid (card)'],
    ['TRANSFER', 'Paid (Bank Transfer)'],
  ])('prints only the positive payment for %s', (method, label) => {
    const printed = new TextDecoder().decode(buildEscPosReceipt({ ...receipt, payments: [
      { method: 'CASH', amountPence: 0 },
      { method, amountPence: 5000 },
    ] }));
    expect(printed).not.toContain('Paid (cash)');
    expect(printed).toContain(label);
    expect(printed).toContain('GHS 50.00');
  });

  it('prints both positive payments in a mixed receipt', () => {
    const printed = new TextDecoder().decode(buildEscPosReceipt({ ...receipt, payments: [
      { method: 'CASH', amountPence: 2000 },
      { method: 'CARD', amountPence: 3000 },
      { method: 'CARD', amountPence: 0, reference: 'ZERO-REF' },
    ] }));
    expect(printed).toMatch(/Paid \(cash\).*GHS 20\.00/);
    expect(printed).toMatch(/Paid \(card\).*GHS 30\.00/);
    expect(printed).not.toContain('ZERO-REF');
  });
});
