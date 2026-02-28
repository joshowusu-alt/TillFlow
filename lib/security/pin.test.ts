import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const { prismaMock, bcryptHashMock, bcryptCompareMock } = vi.hoisted(() => ({
  prismaMock: {
    user: { findMany: vi.fn() },
  },
  bcryptHashMock: vi.fn(),
  bcryptCompareMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('bcryptjs', () => ({
  default: {
    hash: bcryptHashMock,
    compare: bcryptCompareMock,
  },
}));

import {
  sanitizePin,
  validatePin,
  hashApprovalPin,
  verifyManagerPin,
} from './pin';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeCandidate(overrides: {
  id?: string;
  name?: string;
  role?: 'MANAGER' | 'OWNER';
  approvalPinHash?: string | null;
} = {}) {
  const base = {
    id: 'user-1',
    name: 'Alice',
    role: 'MANAGER' as 'MANAGER' | 'OWNER',
    approvalPinHash: '$2b$10$hashedpin' as string | null,
  };
  // Use spread so explicit `null` values are not swallowed by ??‑style defaults
  return { ...base, ...overrides };
}

// ---------------------------------------------------------------------------
// sanitizePin
// ---------------------------------------------------------------------------
describe('sanitizePin', () => {
  it('returns only digit characters', () => {
    expect(sanitizePin('12 34')).toBe('1234');
    expect(sanitizePin('1-2-3-4')).toBe('1234');
    expect(sanitizePin('abc1234def')).toBe('1234');
  });

  it('returns an empty string when there are no digits', () => {
    expect(sanitizePin('abcdef')).toBe('');
    expect(sanitizePin('')).toBe('');
  });

  it('returns the same string when input is already all digits', () => {
    expect(sanitizePin('5678')).toBe('5678');
  });
});

// ---------------------------------------------------------------------------
// validatePin
// ---------------------------------------------------------------------------
describe('validatePin', () => {
  it('returns the sanitized PIN when it has exactly 4 digits', () => {
    expect(validatePin('1234')).toBe('1234');
  });

  it('returns the sanitized PIN when it has exactly 8 digits', () => {
    expect(validatePin('12345678')).toBe('12345678');
  });

  it('returns the sanitized PIN for lengths between 4 and 8', () => {
    expect(validatePin('123456')).toBe('123456');
  });

  it('strips non-digit characters before checking length', () => {
    // "1-2-3-4" sanitizes to "1234" (4 digits) — should pass
    expect(validatePin('1-2-3-4')).toBe('1234');
  });

  it('throws when the PIN has fewer than 4 digits', () => {
    expect(() => validatePin('123')).toThrow('PIN must be 4 to 8 digits.');
  });

  it('throws when the PIN has more than 8 digits', () => {
    expect(() => validatePin('123456789')).toThrow('PIN must be 4 to 8 digits.');
  });

  it('throws when the sanitized PIN is empty', () => {
    expect(() => validatePin('abcdef')).toThrow('PIN must be 4 to 8 digits.');
  });
});

// ---------------------------------------------------------------------------
// hashApprovalPin
// ---------------------------------------------------------------------------
describe('hashApprovalPin', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns the hash produced by bcrypt', async () => {
    bcryptHashMock.mockResolvedValue('$2b$10$mockedhash');

    const result = await hashApprovalPin('1234');

    expect(result).toBe('$2b$10$mockedhash');
  });

  it('calls bcrypt.hash with the sanitized PIN and a salt rounds of 10', async () => {
    bcryptHashMock.mockResolvedValue('$2b$10$mockedhash');

    await hashApprovalPin('1234');

    expect(bcryptHashMock).toHaveBeenCalledWith('1234', 10);
  });

  it('sanitizes the PIN before hashing (strips non-digit chars)', async () => {
    bcryptHashMock.mockResolvedValue('$2b$10$mockedhash');

    await hashApprovalPin('12-34');

    expect(bcryptHashMock).toHaveBeenCalledWith('1234', 10);
  });

  it('throws when the PIN is too short (< 4 digits)', async () => {
    await expect(hashApprovalPin('123')).rejects.toThrow('PIN must be 4 to 8 digits.');
  });

  it('throws when the PIN is too long (> 8 digits)', async () => {
    await expect(hashApprovalPin('123456789')).rejects.toThrow('PIN must be 4 to 8 digits.');
  });
});

// ---------------------------------------------------------------------------
// verifyManagerPin
// ---------------------------------------------------------------------------
describe('verifyManagerPin', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // ---- happy path ----------------------------------------------------------

  it('returns the matched user when the PIN is correct', async () => {
    const candidate = makeCandidate({ id: 'mgr-1', name: 'Bob', role: 'MANAGER' });
    prismaMock.user.findMany.mockResolvedValue([candidate]);
    bcryptCompareMock.mockResolvedValue(true);

    const result = await verifyManagerPin({ businessId: 'biz-1', pin: '1234' });

    expect(result).toEqual({ id: 'mgr-1', name: 'Bob', role: 'MANAGER' });
  });

  it('returns null when the PIN is incorrect', async () => {
    const candidate = makeCandidate();
    prismaMock.user.findMany.mockResolvedValue([candidate]);
    bcryptCompareMock.mockResolvedValue(false);

    const result = await verifyManagerPin({ businessId: 'biz-1', pin: '0000' });

    expect(result).toBeNull();
  });

  // ---- empty / absent users ------------------------------------------------

  it('returns null when there are no manager/owner candidates', async () => {
    prismaMock.user.findMany.mockResolvedValue([]);

    const result = await verifyManagerPin({ businessId: 'biz-1', pin: '1234' });

    expect(result).toBeNull();
  });

  it('returns null when candidates have null approvalPinHash', async () => {
    const candidate = makeCandidate({ approvalPinHash: null });
    prismaMock.user.findMany.mockResolvedValue([candidate]);
    // bcryptCompareMock should NOT be called for null hashes

    const result = await verifyManagerPin({ businessId: 'biz-1', pin: '1234' });

    expect(result).toBeNull();
    expect(bcryptCompareMock).not.toHaveBeenCalled();
  });

  // ---- blank / invalid PIN -------------------------------------------------

  it('returns null immediately when the PIN contains no digits', async () => {
    const result = await verifyManagerPin({ businessId: 'biz-1', pin: 'abc' });

    expect(result).toBeNull();
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  it('returns null immediately when an empty string is supplied as PIN', async () => {
    const result = await verifyManagerPin({ businessId: 'biz-1', pin: '' });

    expect(result).toBeNull();
    expect(prismaMock.user.findMany).not.toHaveBeenCalled();
  });

  // ---- multiple managers ---------------------------------------------------

  it('returns the first matching manager when multiple candidates exist', async () => {
    const alice = makeCandidate({ id: 'mgr-1', name: 'Alice', approvalPinHash: '$hash-a' });
    const bob   = makeCandidate({ id: 'mgr-2', name: 'Bob',   approvalPinHash: '$hash-b' });
    prismaMock.user.findMany.mockResolvedValue([alice, bob]);

    // Only Bob's PIN matches
    bcryptCompareMock.mockImplementation(
      (_pin: string, hash: string) => Promise.resolve(hash === '$hash-b'),
    );

    const result = await verifyManagerPin({ businessId: 'biz-1', pin: '5678' });

    expect(result).toEqual({ id: 'mgr-2', name: 'Bob', role: 'MANAGER' });
  });

  it('returns null when none of the multiple candidates match', async () => {
    const alice = makeCandidate({ id: 'mgr-1', approvalPinHash: '$hash-a' });
    const bob   = makeCandidate({ id: 'mgr-2', approvalPinHash: '$hash-b' });
    prismaMock.user.findMany.mockResolvedValue([alice, bob]);
    bcryptCompareMock.mockResolvedValue(false);

    const result = await verifyManagerPin({ businessId: 'biz-1', pin: '9999' });

    expect(result).toBeNull();
    expect(bcryptCompareMock).toHaveBeenCalledTimes(2);
  });

  it('matches an OWNER role as well as MANAGER', async () => {
    const owner = makeCandidate({ id: 'owner-1', name: 'Carol', role: 'OWNER', approvalPinHash: '$hash-owner' });
    prismaMock.user.findMany.mockResolvedValue([owner]);
    bcryptCompareMock.mockResolvedValue(true);

    const result = await verifyManagerPin({ businessId: 'biz-1', pin: '4321' });

    expect(result).toMatchObject({ id: 'owner-1', role: 'OWNER' });
  });

  // ---- query shape ---------------------------------------------------------

  it('queries only active MANAGER/OWNER users with a non-null approvalPinHash', async () => {
    prismaMock.user.findMany.mockResolvedValue([]);

    await verifyManagerPin({ businessId: 'biz-42', pin: '1234' });

    expect(prismaMock.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: 'biz-42',
          active: true,
          role: expect.objectContaining({ in: expect.arrayContaining(['MANAGER', 'OWNER']) }),
          approvalPinHash: expect.objectContaining({ not: null }),
        }),
      }),
    );
  });

  it('strips non-digit characters from the PIN before comparing', async () => {
    const candidate = makeCandidate({ approvalPinHash: '$hash' });
    prismaMock.user.findMany.mockResolvedValue([candidate]);
    bcryptCompareMock.mockResolvedValue(true);

    await verifyManagerPin({ businessId: 'biz-1', pin: '12-34' });

    // The first argument to bcrypt.compare should be the sanitized PIN
    expect(bcryptCompareMock).toHaveBeenCalledWith('1234', '$hash');
  });
});
