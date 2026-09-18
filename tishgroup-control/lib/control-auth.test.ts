import { afterEach, describe, expect, it } from 'vitest';
import { isSafeInternalReturnPath } from '@/lib/safe-return-path';
import {
  ALLOWED_CONTROL_ROLES,
  canAuthenticateStaffPassword,
  canMutateSupport,
  controlAuthConfigured,
  getControlSessionSecret,
  nextSessionVersion,
  normalizeRole,
  parseControlStaffRole,
  sessionVersionsMatch,
} from '@/lib/control-auth';

describe('parseControlStaffRole / normalizeRole', () => {
  it('accepts the allowlisted roles', () => {
    expect(ALLOWED_CONTROL_ROLES).toEqual([
      'CONTROL_ADMIN',
      'ACCOUNT_MANAGER',
      'COLLECTIONS_AGENT',
      'SUPPORT_AGENT',
    ]);

    for (const role of ALLOWED_CONTROL_ROLES) {
      expect(parseControlStaffRole(role)).toBe(role);
      expect(normalizeRole(role)).toBe(role);
    }
  });

  it('fails closed on unknown roles instead of mapping to ACCOUNT_MANAGER', () => {
    expect(parseControlStaffRole('SUPERUSER')).toBeNull();
    expect(parseControlStaffRole('admin')).toBeNull();
    expect(parseControlStaffRole('')).toBeNull();
    expect(parseControlStaffRole(null)).toBeNull();
    expect(parseControlStaffRole(undefined)).toBeNull();
    expect(normalizeRole('NOT_A_ROLE')).toBeNull();
    expect(normalizeRole('ACCOUNT_OWNER')).toBeNull();
    expect(normalizeRole()).toBeNull();
  });
});

describe('canMutateSupport', () => {
  it('is explicit for ACCOUNT_MANAGER and SUPPORT_AGENT and excludes COLLECTIONS_AGENT', () => {
    expect(canMutateSupport('CONTROL_ADMIN')).toBe(true);
    expect(canMutateSupport('ACCOUNT_MANAGER')).toBe(true);
    expect(canMutateSupport('SUPPORT_AGENT')).toBe(true);
    expect(canMutateSupport('COLLECTIONS_AGENT')).toBe(false);
  });
});

describe('canAuthenticateStaffPassword', () => {
  it('does not authenticate a null or empty passwordHash', () => {
    expect(canAuthenticateStaffPassword(null)).toBe(false);
    expect(canAuthenticateStaffPassword(undefined)).toBe(false);
    expect(canAuthenticateStaffPassword('')).toBe(false);
  });

  it('allows authentication only when a hash is present', () => {
    expect(canAuthenticateStaffPassword('$2a$12$placeholder-hash')).toBe(true);
  });
});

describe('session version helpers', () => {
  it('increments a stored session version', () => {
    expect(nextSessionVersion(0)).toBe(1);
    expect(nextSessionVersion(4)).toBe(5);
    expect(nextSessionVersion(null)).toBe(1);
    expect(nextSessionVersion(undefined)).toBe(1);
  });

  it('rejects mismatched cookie and database session versions', () => {
    expect(sessionVersionsMatch(0, 0)).toBe(true);
    expect(sessionVersionsMatch(2, 2)).toBe(true);
    expect(sessionVersionsMatch(1, 2)).toBe(false);
    expect(sessionVersionsMatch(undefined, 0)).toBe(false);
    expect(sessionVersionsMatch(0, undefined)).toBe(false);
  });
});

describe('isSafeInternalReturnPath', () => {
  it('rejects protocol-relative and other unsafe next targets', () => {
    expect(isSafeInternalReturnPath('//evil')).toBe(false);
    expect(isSafeInternalReturnPath('//evil.example/phish')).toBe(false);
    expect(isSafeInternalReturnPath('/\\evil')).toBe(false);
    expect(isSafeInternalReturnPath('https://evil.example')).toBe(false);
    expect(isSafeInternalReturnPath('/login')).toBe(false);
  });

  it('accepts same-origin internal paths', () => {
    expect(isSafeInternalReturnPath('/staff')).toBe(true);
    expect(isSafeInternalReturnPath('/businesses?filter=unreviewed')).toBe(true);
  });
});

describe('getControlSessionSecret', () => {
  const originalSession = process.env.CONTROL_SESSION_SECRET;
  const originalAccess = process.env.CONTROL_PLANE_ACCESS_KEY;

  afterEach(() => {
    if (originalSession === undefined) delete process.env.CONTROL_SESSION_SECRET;
    else process.env.CONTROL_SESSION_SECRET = originalSession;
    if (originalAccess === undefined) delete process.env.CONTROL_PLANE_ACCESS_KEY;
    else process.env.CONTROL_PLANE_ACCESS_KEY = originalAccess;
  });

  it('does not fall back to CONTROL_PLANE_ACCESS_KEY', () => {
    delete process.env.CONTROL_SESSION_SECRET;
    process.env.CONTROL_PLANE_ACCESS_KEY = 'this-is-a-long-access-key-value';
    expect(getControlSessionSecret()).toBeNull();
    expect(controlAuthConfigured()).toBe(false);
  });

  it('rejects CONTROL_SESSION_SECRET values shorter than 16 characters', () => {
    process.env.CONTROL_SESSION_SECRET = 'short-secret';
    process.env.CONTROL_PLANE_ACCESS_KEY = 'this-is-a-long-access-key-value';
    expect(getControlSessionSecret()).toBeNull();
    expect(controlAuthConfigured()).toBe(false);
  });

  it('uses CONTROL_SESSION_SECRET only when it meets the minimum length', () => {
    process.env.CONTROL_SESSION_SECRET = 'sixteen-chars-ok';
    process.env.CONTROL_PLANE_ACCESS_KEY = 'must-not-be-used-as-session-secret';
    expect(getControlSessionSecret()).toBe('sixteen-chars-ok');
    expect(controlAuthConfigured()).toBe(true);
  });
});
