import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ create: vi.fn(), unique: vi.fn(), context: vi.fn(), revalidate: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { user: { create: mocks.create } } }));
vi.mock('@/lib/audit', () => ({ audit: () => Promise.resolve() }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('@/lib/services/users', () => ({ hashPassword: async () => 'hashed', assertEmailUnique: mocks.unique }));
vi.mock('@/lib/action-utils', () => ({
  withBusinessContext: mocks.context,
  safeAction: async (fn: () => Promise<unknown>) => {
    try { return await fn(); } catch (error) { return { success: false, error: (error as Error).message }; }
  },
  err: (error: string) => ({ success: false, error }),
  ok: () => ({ success: true }),
}));

import { createUserAction } from './users';
import { userFormErrorMessage } from '@/app/(protected)/users/user-form-errors';

function form(pin = '') {
  const data = new FormData();
  data.set('name', 'Fictional cashier');
  data.set('email', 'fictional@example.invalid');
  data.set('password', 'fixture-password');
  data.set('role', 'CASHIER');
  data.set('approvalPin', pin);
  return data;
}

describe('add user feedback', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.context.mockResolvedValue({ user: { id: 'owner', role: 'OWNER' }, businessId: 'fictional' });
    mocks.create.mockResolvedValue({ id: 'new-user' });
  });

  it('returns the existing PIN validation reason without creating a user', async () => {
    const result = await createUserAction(form('123'));
    expect(result).toEqual({ success: false, error: 'PIN must be 4 to 8 digits.' });
    expect(userFormErrorMessage('PIN must be 4 to 8 digits.')).toBe('PIN must be 4 to 8 digits.');
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('returns the existing duplicate email reason', async () => {
    mocks.unique.mockRejectedValue(new Error('A user with that email already exists.'));
    expect(await createUserAction(form())).toEqual({ success: false, error: 'A user with that email already exists.' });
    expect(userFormErrorMessage('A user with that email already exists.')).toBe('A user with that email already exists.');
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('returns success and invalidates the list for each successful creation', async () => {
    expect(await createUserAction(form())).toEqual({ success: true });
    expect(await createUserAction(form())).toEqual({ success: true });
    expect(mocks.revalidate).toHaveBeenCalledTimes(2);
    expect(mocks.revalidate).toHaveBeenCalledWith('/users');
    expect(mocks.context).toHaveBeenCalledWith(['OWNER']);
  });

  it('does not echo unknown technical errors or prototype properties', () => {
    expect(userFormErrorMessage('private technical detail')).toBe('Unable to save this user. Please try again or contact support.');
    expect(userFormErrorMessage('constructor')).toBe('Unable to save this user. Please try again or contact support.');
  });
});
