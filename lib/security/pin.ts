import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

export function sanitizePin(pin: string) {
  return pin.replace(/[^\d]/g, '');
}

export function validatePin(pin: string) {
  const normalized = sanitizePin(pin);
  if (normalized.length < 4 || normalized.length > 8) {
    throw new Error('PIN must be 4 to 8 digits.');
  }
  return normalized;
}

export async function hashApprovalPin(pin: string) {
  return bcrypt.hash(validatePin(pin), 10);
}

export async function verifyManagerPin(input: {
  businessId: string;
  pin: string;
}) {
  const normalized = sanitizePin(input.pin);
  if (!normalized) return null;

  const candidates = await prisma.user.findMany({
    where: {
      businessId: input.businessId,
      active: true,
      role: { in: ['MANAGER', 'OWNER'] },
      approvalPinHash: { not: null },
    },
    select: {
      id: true,
      name: true,
      role: true,
      approvalPinHash: true,
    },
  });

  for (const candidate of candidates) {
    if (!candidate.approvalPinHash) continue;
    const ok = await bcrypt.compare(normalized, candidate.approvalPinHash);
    if (ok) {
      return {
        id: candidate.id,
        name: candidate.name,
        role: candidate.role,
      };
    }
  }
  return null;
}
