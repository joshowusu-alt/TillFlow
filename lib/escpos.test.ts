import { describe, expect, it } from 'vitest';
import { buildEscPosReceipt } from './escpos';

const receipt = {
  business: { name: 'Test shop', currency: 'GHS', vatEnabled: false },
  store: { name: 'Main' }, cashier: { name: 'Cashier' },
  invoice: { id: 'sale', createdAt: '2026-11-25T10:00:00Z', subtotalPence: 5000, vatPence: 0, totalPence: 5000 },
  lines: [], template: 'THERMAL_80',
};

describe('ESC/POS receipt payments', () => {
  it('initializes native black text and keeps emphasis on through the entire receipt', () => {
    const bytes = buildEscPosReceipt({ ...receipt, payments: [{ method: 'CASH', amountPence: 5000 }] });
    const commands = [];
    let emphasized = false;
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0x1b || bytes[i] === 0x1d) {
        const command = bytes[i + 1];
        expect([0x40, 0x61, 0x45, 0x56]).toContain(command);
        const length = command === 0x40 ? 2 : 3;
        commands.push(Array.from(bytes.slice(i, i + length)));
        if (command === 0x45) emphasized = bytes[i + 2] === 1;
        i += length - 1;
      } else if (bytes[i] !== 10) {
        expect(emphasized).toBe(true);
      }
    }
    expect(commands[0]).toEqual([0x1b, 0x40]);
    expect(commands.filter(c => c[1] === 0x45)).toEqual([[0x1b, 0x45, 1], [0x1b, 0x45, 0]]);
    expect(commands.at(-1)).toEqual([0x1d, 0x56, 1]);
  });
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
