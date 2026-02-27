import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

/**
 * Hash a plain-text password using bcrypt (cost 10).
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/**
 * Delete all active sessions for a user (force re-login).
 */
export async function invalidateUserSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

/**
 * Throw if a user with `email` already exists, optionally excluding `excludeUserId`.
 * Returns void if the email is available.
 */
export async function assertEmailUnique(
  email: string,
  excludeUserId?: string
): Promise<void> {
  const existing = await prisma.user.findFirst({
    where: excludeUserId
      ? { email, NOT: { id: excludeUserId } }
      : { email },
    select: { id: true },
  });
  if (existing) throw new Error('A user with that email already exists.');
}

/**
 * Throw if `actorRole` is not permitted to modify a user with `targetRole`.
 * Currently: only an OWNER can modify another OWNER.
 */
export function assertActorCanModifyRole(
  actorRole: string,
  targetRole: string
): void {
  if (targetRole === 'OWNER' && actorRole !== 'OWNER') {
    throw new Error("Only an owner can reset another owner's password.");
  }
}
