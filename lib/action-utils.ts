/**
 * Shared types and utilities for a consistent server-action API.
 *
 * Every action should return `ActionResult<T>`.  The `withBusinessContext`
 * helper eliminates the repeated "look up business + store / redirect if
 * missing" boilerplate (DRY) and keeps auth concerns in one place (SRP).
 */

import { prisma } from '@/lib/prisma';
import { requireUser, requireRole, type Role } from '@/lib/auth';
import { redirect } from 'next/navigation';

// ---------------------------------------------------------------------------
// Consistent result type
// ---------------------------------------------------------------------------

/** Successful action result. */
export type ActionSuccess<T = void> = T extends void
  ? { success: true }
  : { success: true; data: T };

/** Failed action result. */
export type ActionError = { success: false; error: string };

/** Every server-action returns this shape (or redirects). */
export type ActionResult<T = void> = ActionSuccess<T> | ActionError;

/** Build a success result. */
export function ok(): ActionResult<void>;
export function ok<T>(data: T): ActionResult<T>;
export function ok(data?: unknown) {
  if (data === undefined) return { success: true as const };
  return { success: true as const, data };
}

/** Build an error result. */
export function err(message: string): ActionError {
  return { success: false, error: message };
}

// ---------------------------------------------------------------------------
// Auth + context helpers
// ---------------------------------------------------------------------------

export interface BusinessContext {
  user: { id: string; role: string; name: string | null; email: string; businessId: string };
  businessId: string;
}

export interface BusinessStoreContext extends BusinessContext {
  storeId: string;
}

/**
 * Authenticate, enforce roles, resolve the business (and optionally the first
 * store) in one call.  Redirects when anything is missing.
 */
export async function withBusinessContext(
  roles?: Role[]
): Promise<BusinessContext> {
  const user = roles ? await requireRole(roles) : await requireUser();
  const business = await prisma.business.findUnique({ where: { id: user.businessId } });
  if (!business) redirect('/settings');
  return { user, businessId: business.id };
}

export async function withBusinessStoreContext(
  roles?: Role[]
): Promise<BusinessStoreContext> {
  const ctx = await withBusinessContext(roles);
  const store = await prisma.store.findFirst({ where: { businessId: ctx.businessId } });
  if (!store) redirect('/settings');
  return { ...ctx, storeId: store.id };
}

// ---------------------------------------------------------------------------
// Safe action wrapper
// ---------------------------------------------------------------------------

/**
 * Wrap any async action body so uncaught errors are returned as `ActionError`
 * instead of crashing.  NEXT_REDIRECT errors (from `redirect()`) are
 * re-thrown so Next.js can handle them.
 */
export async function safeAction<T>(
  fn: () => Promise<ActionResult<T>>
): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (error: unknown) {
    // Next.js redirect() throws a special error — rethrow it.
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') throw error;
    // Also handle the digest-based redirect used in newer Next.js
    if (
      error &&
      typeof error === 'object' &&
      'digest' in error &&
      typeof (error as any).digest === 'string' &&
      (error as any).digest.startsWith('NEXT_REDIRECT')
    ) {
      throw error;
    }
    // Return a user-friendly message instead of raw technical errors
    if (error instanceof Error) {
      const msg = error.message;
      // Hide Prisma / database internals from end users
      if (msg.includes('prisma') || msg.includes('P2002') || msg.includes('P2025') || msg.includes('42P01') || msg.includes('Raw query failed')) {
        return err('Something went wrong saving your data. Please try again or contact support.');
      }
      return err(msg);
    }
    return err('Something unexpected happened. Please try again.');
  }
}

/**
 * Identical to `safeAction` but typed as `Promise<void>` — use this for
 * actions bound to `<form action={…}>` which requires a void return.
 * Errors are silently swallowed (the redirect or error boundary handles them).
 */
export function formAction(fn: () => Promise<ActionResult>): Promise<void> {
  return safeAction(fn) as Promise<unknown> as Promise<void>;
}
