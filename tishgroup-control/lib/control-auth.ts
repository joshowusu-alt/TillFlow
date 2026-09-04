import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export const CONTROL_SESSION_COOKIE = 'tishgroup_control_session';

const SESSION_TTL_SECONDS = 60 * 60 * 12;

export const MIN_CONTROL_SESSION_SECRET_LENGTH = 16;
export const MIN_CONTROL_PASSWORD_LENGTH = 12;

export const ALLOWED_CONTROL_ROLES = ['CONTROL_ADMIN', 'ACCOUNT_MANAGER', 'COLLECTIONS_AGENT', 'SUPPORT_AGENT'] as const;

export type ControlStaffRole = (typeof ALLOWED_CONTROL_ROLES)[number];

type SessionPayload = {
  staffId: string;
  email: string;
  role: ControlStaffRole;
  sessionVersion: number;
  exp: number;
};

type ControlStaffSession = {
  id: string;
  name: string;
  email: string;
  role: ControlStaffRole;
  sessionVersion: number;
};

export type ControlStaffOption = {
  id: string;
  name: string;
  email: string;
  role: ControlStaffRole;
};

function isMissingControlStaffSchemaError(error: unknown) {
  return error instanceof Error && (
    error.message.includes('ControlStaff')
    || error.message.includes('controlStaff')
    || error.message.includes('no such table')
    || error.message.includes('does not exist in the current database')
  );
}

export function parseControlStaffRole(value: unknown): ControlStaffRole | null {
  const role = String(value ?? '').trim().toUpperCase();
  return (ALLOWED_CONTROL_ROLES as readonly string[]).includes(role) ? role as ControlStaffRole : null;
}

/** Fail-closed: unknown roles are never mapped to ACCOUNT_MANAGER. */
export function normalizeRole(role?: string | null): ControlStaffRole | null {
  return parseControlStaffRole(role);
}

export function canAuthenticateStaffPassword(passwordHash: string | null | undefined): boolean {
  return typeof passwordHash === 'string' && passwordHash.length > 0;
}

export function nextSessionVersion(current: number | null | undefined): number {
  const value = typeof current === 'number' && Number.isFinite(current) ? Math.trunc(current) : 0;
  return value + 1;
}

export function sessionVersionsMatch(cookieVersion: unknown, dbVersion: unknown): boolean {
  return typeof cookieVersion === 'number'
    && typeof dbVersion === 'number'
    && Number.isFinite(cookieVersion)
    && Number.isFinite(dbVersion)
    && cookieVersion === dbVersion;
}

function formatRoleLabel(role: ControlStaffRole) {
  return role.replace(/_/g, ' ');
}

/** Session HMAC secret comes only from CONTROL_SESSION_SECRET. No ACCESS_KEY fallback. */
export function getControlSessionSecret() {
  const secret = process.env.CONTROL_SESSION_SECRET?.trim() || '';
  if (secret.length < MIN_CONTROL_SESSION_SECRET_LENGTH) {
    return null;
  }
  return secret;
}

function encodePayload(payload: SessionPayload, secret: string) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function decodePayload(token: string, secret: string) {
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;

  const expected = createHmac('sha256', secret).update(body).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    const role = parseControlStaffRole(payload.role);
    if (!payload.staffId || !payload.email || !role || !payload.exp) {
      return null;
    }
    if (typeof payload.sessionVersion !== 'number' || !Number.isFinite(payload.sessionVersion)) {
      return null;
    }
    if (payload.exp * 1000 <= Date.now()) {
      return null;
    }
    return { ...payload, role };
  } catch {
    return null;
  }
}

export function controlAuthConfigured() {
  return Boolean(getControlSessionSecret());
}

export async function getControlStaffOptional(): Promise<ControlStaffSession | null> {
  const token = cookies().get(CONTROL_SESSION_COOKIE)?.value;
  const secret = getControlSessionSecret();

  if (!token || !secret) {
    return null;
  }

  const payload = decodePayload(token, secret);
  if (!payload) {
    return null;
  }

  try {
    const staff = await prisma.controlStaff.findUnique({
      where: { id: payload.staffId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        sessionVersion: true,
      },
    });

    if (!staff?.active) {
      return null;
    }

    const role = parseControlStaffRole(staff.role);
    if (!role) {
      return null;
    }

    if (!sessionVersionsMatch(payload.sessionVersion, staff.sessionVersion)) {
      return null;
    }

    return {
      id: staff.id,
      name: staff.name,
      email: staff.email,
      role,
      sessionVersion: staff.sessionVersion,
    };
  } catch (error) {
    if (isMissingControlStaffSchemaError(error)) {
      return null;
    }
    throw error;
  }
}

export async function requireControlStaff(roles?: ControlStaffRole[]) {
  const staff = await getControlStaffOptional();

  if (!staff) {
    redirect('/login');
  }

  if (roles && !roles.includes(staff.role)) {
    redirect('/');
  }

  return staff;
}

export async function createControlSession(staff: ControlStaffSession) {
  const secret = getControlSessionSecret();
  if (!secret) {
    throw new Error('Control-plane session secret is not configured.');
  }

  const role = parseControlStaffRole(staff.role);
  if (!role) {
    throw new Error('Control staff role is not allowlisted.');
  }

  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const token = encodePayload({
    staffId: staff.id,
    email: staff.email,
    role,
    sessionVersion: staff.sessionVersion,
    exp: expiresAt,
  }, secret);

  cookies().set({
    name: CONTROL_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(expiresAt * 1000),
  });
}

export function canManageSubscriptions(role: ControlStaffRole) {
  return role === 'CONTROL_ADMIN' || role === 'ACCOUNT_MANAGER';
}

export function canManageStaff(role: ControlStaffRole) {
  return role === 'CONTROL_ADMIN';
}

export function canRecordPayments(role: ControlStaffRole) {
  return role === 'CONTROL_ADMIN' || role === 'ACCOUNT_MANAGER' || role === 'COLLECTIONS_AGENT';
}

export function canWriteNotes(role: ControlStaffRole) {
  return role === 'CONTROL_ADMIN' || role === 'ACCOUNT_MANAGER' || role === 'COLLECTIONS_AGENT' || role === 'SUPPORT_AGENT';
}

export async function listActiveControlStaff(): Promise<ControlStaffOption[]> {
  try {
    const staff = await prisma.controlStaff.findMany({
      where: { active: true },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    return staff.flatMap((entry) => {
      const role = parseControlStaffRole(entry.role);
      if (!role) return [];
      return [{
        id: entry.id,
        name: entry.name,
        email: entry.email,
        role,
      }];
    });
  } catch (error) {
    if (isMissingControlStaffSchemaError(error)) {
      return [];
    }
    throw error;
  }
}

export async function listControlStaffDirectory(): Promise<Array<ControlStaffOption & { active: boolean; createdAt: string; hasPassword: boolean }>> {
  try {
    const staff = await prisma.controlStaff.findMany({
      orderBy: [{ active: 'desc' }, { role: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
        passwordHash: true,
      },
    });

    return staff.flatMap((entry) => {
      const role = parseControlStaffRole(entry.role);
      if (!role) return [];
      return [{
        id: entry.id,
        name: entry.name,
        email: entry.email,
        role,
        active: entry.active,
        createdAt: entry.createdAt.toISOString().slice(0, 10),
        hasPassword: canAuthenticateStaffPassword(entry.passwordHash),
      }];
    });
  } catch (error) {
    if (isMissingControlStaffSchemaError(error)) {
      return [];
    }
    throw error;
  }
}

export { formatRoleLabel, isMissingControlStaffSchemaError };
