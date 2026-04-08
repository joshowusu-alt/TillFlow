import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';

export const CONTROL_SESSION_COOKIE = 'tishgroup_control_session';

const SESSION_TTL_SECONDS = 60 * 60 * 12;

export type ControlStaffRole = 'CONTROL_ADMIN' | 'ACCOUNT_MANAGER' | 'COLLECTIONS_AGENT' | 'SUPPORT_AGENT';

type SessionPayload = {
  staffId: string;
  email: string;
  role: ControlStaffRole;
  exp: number;
};

type ControlStaffSession = {
  id: string;
  name: string;
  email: string;
  role: ControlStaffRole;
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

function normalizeRole(role?: string | null): ControlStaffRole {
  switch (String(role ?? '').toUpperCase()) {
    case 'CONTROL_ADMIN':
      return 'CONTROL_ADMIN';
    case 'COLLECTIONS_AGENT':
      return 'COLLECTIONS_AGENT';
    case 'SUPPORT_AGENT':
      return 'SUPPORT_AGENT';
    case 'ACCOUNT_MANAGER':
    default:
      return 'ACCOUNT_MANAGER';
  }
}

function formatRoleLabel(role: ControlStaffRole) {
  return role.replace(/_/g, ' ');
}

function getControlSessionSecret() {
  return process.env.CONTROL_SESSION_SECRET?.trim() || process.env.CONTROL_PLANE_ACCESS_KEY?.trim() || null;
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
    if (!payload.staffId || !payload.email || !payload.role || !payload.exp) {
      return null;
    }
    if (payload.exp * 1000 <= Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function controlAuthConfigured() {
  return Boolean(process.env.CONTROL_PLANE_ACCESS_KEY?.trim());
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
      },
    });

    if (!staff?.active) {
      return null;
    }

    return {
      id: staff.id,
      name: staff.name,
      email: staff.email,
      role: normalizeRole(staff.role),
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

  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const token = encodePayload({
    staffId: staff.id,
    email: staff.email,
    role: staff.role,
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

export async function findOrBootstrapControlStaff(email: string) {
  try {
    const existing = await prisma.controlStaff.findUnique({ where: { email } });
    if (existing) {
      return existing;
    }

    const bootstrapEmail = process.env.CONTROL_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
    if (!bootstrapEmail || email !== bootstrapEmail) {
      return null;
    }

    return prisma.controlStaff.create({
      data: {
        email,
        name: email.split('@')[0]?.replace(/[._-]/g, ' ') || 'Control admin',
        role: 'CONTROL_ADMIN',
        active: true,
      },
    });
  } catch (error) {
    if (isMissingControlStaffSchemaError(error)) {
      throw new Error('Control-plane database tables are not available yet. Apply the latest Prisma migration before signing in.');
    }
    throw error;
  }
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

    return staff.map((entry) => ({
      id: entry.id,
      name: entry.name,
      email: entry.email,
      role: normalizeRole(entry.role),
    }));
  } catch (error) {
    if (isMissingControlStaffSchemaError(error)) {
      return [];
    }
    throw error;
  }
}

export async function listControlStaffDirectory(): Promise<Array<ControlStaffOption & { active: boolean; createdAt: string }>> {
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
      },
    });

    return staff.map((entry) => ({
      id: entry.id,
      name: entry.name,
      email: entry.email,
      role: normalizeRole(entry.role),
      active: entry.active,
      createdAt: entry.createdAt.toISOString().slice(0, 10),
    }));
  } catch (error) {
    if (isMissingControlStaffSchemaError(error)) {
      return [];
    }
    throw error;
  }
}

export { formatRoleLabel, isMissingControlStaffSchemaError, normalizeRole };