import { describe, expect, it } from 'vitest';
import { calendarDate, expiryDate, patientAge, chooseEligibleBatches, pharmacyCartHash, validatePatient, positiveQuantity, type PharmacyRule } from './policy';

const now = new Date('2026-10-23T12:00:00Z');
const rule: PharmacyRule = { productId: 'medicine', medicineClass: 'PRESCRIPTION', minimumPatientAge: 18, checkInstructions: '', updatedAt: now };

describe('pharmacy dispensing policy', () => {
  it('distinguishes the day before and day of the patient birthday', () => {
    expect(patientAge(calendarDate('2008-10-24', 'birth date'), now)).toBe(17);
    expect(patientAge(calendarDate('2008-10-23', 'birth date'), now)).toBe(18);
    expect(() => validatePatient([rule], 'Patient', calendarDate('2008-10-24', 'birth date'), true, now)).toThrow('configured age check');
    expect(() => validatePatient([rule], 'Patient', calendarDate('2008-10-23', 'birth date'), true, now)).not.toThrow();
  });
  it('requires an age check on the patient and does not infer one for ordinary OTC', () => {
    expect(() => validatePatient([rule], '', null, true, now)).toThrow('patient name');
    expect(() => validatePatient([rule], 'Patient', calendarDate('1990-01-01', 'birth date'), false, now)).toThrow('configured age check');
    expect(() => validatePatient([{ ...rule, medicineClass: 'OTC', minimumPatientAge: null }], '', null, false, now)).not.toThrow();
  });
  it.each(['2026-02-30', '23/10/2026', '', '2026-13-01'])('rejects an invalid calendar date %s', raw => {
    expect(() => calendarDate(raw, 'expiry date')).toThrow('valid expiry date');
  });
  it('treats a printed expiry date as valid through that UTC calendar day', () => {
    expect(expiryDate('2026-10-23').toISOString()).toBe('2026-10-23T23:59:59.999Z');
    expect(() => patientAge(calendarDate('2027-01-01', 'birth date'), now)).toThrow('future');
  });
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid base-unit quantity %s', value => {
    expect(() => positiveQuantity(value)).toThrow('positive whole quantity');
  });
  it('uses earliest eligible expiry, splits across batches and excludes quarantine and expired stock', () => {
    const batch = { productId: 'medicine', quarantined: false, qtyRemainingBase: 3 };
    expect(chooseEligibleBatches([
      { ...batch, id: 'later', expiresAt: expiryDate('2027-01-01') },
      { ...batch, id: 'expired', expiresAt: expiryDate('2026-01-01') },
      { ...batch, id: 'held', quarantined: true, expiresAt: expiryDate('2026-11-01') },
      { ...batch, id: 'first', qtyRemainingBase: 2, expiresAt: expiryDate('2026-12-01') },
    ], [{ productId: 'medicine', qtyBase: 4 }], now)).toEqual([
      { batchId: 'first', productId: 'medicine', qtyBase: 2 }, { batchId: 'later', productId: 'medicine', qtyBase: 2 },
    ]);
  });
  it('cannot double-allocate a batch when quantities occur on multiple lines', () => {
    expect(() => chooseEligibleBatches([{ id: 'only', productId: 'medicine', quarantined: false, qtyRemainingBase: 3, expiresAt: expiryDate('2027-01-01') }], [{ productId: 'medicine', qtyBase: 2 }, { productId: 'medicine', qtyBase: 2 }], now)).toThrow('not enough');
  });
  it('binds review to aggregate quantities and current product policy', () => {
    const hash = pharmacyCartHash([{ productId: 'medicine', qtyBase: 2 }], [rule]);
    expect(pharmacyCartHash([{ productId: 'medicine', qtyBase: 1 }, { productId: 'medicine', qtyBase: 1 }], [rule])).toBe(hash);
    expect(pharmacyCartHash([{ productId: 'medicine', qtyBase: 3 }], [rule])).not.toBe(hash);
    expect(pharmacyCartHash([{ productId: 'medicine', qtyBase: 2 }], [{ ...rule, checkInstructions: 'Additional review' }])).not.toBe(hash);
  });
});
