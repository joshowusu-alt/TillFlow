export type QaRole = 'owner' | 'cashier' | 'manager';

type RoleCredentials = {
  email: string;
  password: string;
};

const ROLE_ENV: Record<QaRole, { email: string; password: string }> = {
  owner: {
    email: 'PLAYWRIGHT_OWNER_EMAIL',
    password: 'PLAYWRIGHT_OWNER_PASSWORD',
  },
  cashier: {
    email: 'PLAYWRIGHT_CASHIER_EMAIL',
    password: 'PLAYWRIGHT_CASHIER_PASSWORD',
  },
  manager: {
    email: 'PLAYWRIGHT_MANAGER_EMAIL',
    password: 'PLAYWRIGHT_MANAGER_PASSWORD',
  },
};

export function getBaseUrl() {
  return process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:6200';
}

export function requireRoleCredentials(role: QaRole): RoleCredentials {
  const keys = ROLE_ENV[role];
  const email = process.env[keys.email]?.trim();
  const password = process.env[keys.password]?.trim();

  if (!email || !password) {
    throw new Error(
      `Missing QA credentials for ${role}. Set ${keys.email} and ${keys.password} before running authenticated Playwright QA.`,
    );
  }

  return { email, password };
}

export function hasRoleCredentials(role: QaRole) {
  try {
    requireRoleCredentials(role);
    return true;
  } catch {
    return false;
  }
}

export function qaSaleAllowed() {
  return (
    process.env.PLAYWRIGHT_ALLOW_QA_SALE === 'true' &&
    process.env.PLAYWRIGHT_QA_TENANT_CONFIRMED === 'true'
  );
}

export function missingRoleEnvMessage(role: QaRole) {
  const keys = ROLE_ENV[role];
  return `Set ${keys.email} and ${keys.password}`;
}
