import { createHash } from 'node:crypto';

export const MEDICINE_CLASSES = ['GENERAL', 'OTC', 'PHARMACIST', 'PRESCRIPTION'] as const;
export type MedicineClass = typeof MEDICINE_CLASSES[number];
export type PharmacyRule = { productId: string; medicineClass: string; minimumPatientAge: number | null; checkInstructions: string; updatedAt: Date };
export type PharmacyQuantity = { productId: string; qtyBase: number };

export function calendarDate(raw: string, label: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error(`Enter a valid ${label}.`);
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== raw) throw new Error(`Enter a valid ${label}.`);
  return date;
}

export function expiryDate(raw: string): Date {
  return new Date(calendarDate(raw, 'expiry date').getTime() + 86400000 - 1);
}

export function patientAge(birth: Date, today = new Date()): number {
  if (birth > today) throw new Error('Patient date of birth cannot be in the future.');
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  if (today.getUTCMonth() < birth.getUTCMonth() || (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate())) age--;
  return age;
}

export function positiveQuantity(value: unknown): number {
  const quantity = Number(value);
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error('Enter a positive whole quantity in base units.');
  return quantity;
}

export function pharmacyCartHash(quantities: PharmacyQuantity[], rules: PharmacyRule[]): string {
  const totals = new Map<string, number>();
  for (const line of quantities) totals.set(line.productId, (totals.get(line.productId) ?? 0) + positiveQuantity(line.qtyBase));
  const cart = [...totals].sort(([a], [b]) => a.localeCompare(b));
  const policy = rules.map(rule => [rule.productId, rule.medicineClass, rule.minimumPatientAge, rule.checkInstructions, rule.updatedAt.toISOString()]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return createHash('sha256').update(JSON.stringify({ cart, policy })).digest('hex');
}

export function validatePatient(rules: PharmacyRule[], name: string, birth: Date | null, confirmed: boolean, now = new Date()) {
  const identityNeeded = rules.some(rule => rule.medicineClass === 'PRESCRIPTION' || rule.minimumPatientAge !== null);
  if (identityNeeded && (!name.trim() || !birth)) throw new Error('Enter the patient name and date of birth, rather than the collector’s details.');
  if (birth) patientAge(birth, now);
  for (const rule of rules) {
    if (rule.minimumPatientAge !== null && (!birth || !confirmed || patientAge(birth, now) < rule.minimumPatientAge)) {
      throw new Error('The patient does not meet the configured age check. Ask the pharmacist to review the medicine.');
    }
  }
}

export function chooseEligibleBatches(batches: { id: string; productId: string; expiresAt: Date; qtyRemainingBase: number; quarantined: boolean }[], quantities: PharmacyQuantity[], now = new Date()) {
  const remaining = new Map(batches.map(batch => [batch.id, batch.qtyRemainingBase]));
  const allocations: { batchId: string; productId: string; qtyBase: number }[] = [];
  const ordered = [...batches].sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime() || a.id.localeCompare(b.id));
  for (const line of quantities) {
    let needed = positiveQuantity(line.qtyBase);
    for (const batch of ordered) {
      if (batch.productId !== line.productId || batch.quarantined || batch.expiresAt <= now) continue;
      const qty = Math.min(needed, remaining.get(batch.id) ?? 0);
      if (qty <= 0) continue;
      allocations.push({ batchId: batch.id, productId: line.productId, qtyBase: qty });
      remaining.set(batch.id, (remaining.get(batch.id) ?? 0) - qty);
      needed -= qty;
      if (!needed) break;
    }
    if (needed) throw new Error('There is not enough unexpired, released batch stock for this medicine.');
  }
  return allocations;
}
