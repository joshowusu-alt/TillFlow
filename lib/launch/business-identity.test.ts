import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearLaunchBusinessIdentity,
  createLaunchBusinessScope,
  getLaunchCopy,
  LAUNCH_BUSINESS_NAME_KEY,
  LAUNCH_BUSINESS_SCOPE_KEY,
  LAUNCH_GENERIC_MESSAGE,
  readLaunchBusinessName,
  saveLaunchBusinessIdentity,
  syncLaunchBusinessIdentity,
} from '@/lib/launch/business-identity';

describe('launch business identity', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('fails safely to generic copy when no name is cached', () => {
    expect(getLaunchCopy()).toEqual({
      message: LAUNCH_GENERIC_MESSAGE,
      detail: 'Checking your session and sync status',
      personalized: false,
      businessName: null,
    });
  });

  it('builds a single personalised message without workspace wording', () => {
    saveLaunchBusinessIdentity('EL-SHADDAI', 'biz-1');
    const copy = getLaunchCopy();
    expect(copy.message).toBe('Opening EL-SHADDAI...');
    expect(copy.detail).toBe("Getting today's sales, stock, and cash ready.");
    expect(copy.personalized).toBe(true);
    expect(copy.message).not.toContain('workspace');
  });

  it('clears name and opaque scope together', () => {
    saveLaunchBusinessIdentity('Store A', 'biz-a');
    expect(readLaunchBusinessName()).toBe('Store A');
    expect(window.localStorage.getItem(LAUNCH_BUSINESS_SCOPE_KEY)).toBe(
      createLaunchBusinessScope('biz-a'),
    );
    clearLaunchBusinessIdentity();
    expect(readLaunchBusinessName()).toBeNull();
    expect(window.localStorage.getItem(LAUNCH_BUSINESS_NAME_KEY)).toBeNull();
    expect(window.localStorage.getItem(LAUNCH_BUSINESS_SCOPE_KEY)).toBeNull();
  });

  it('replaces identity when business scope changes', () => {
    saveLaunchBusinessIdentity('Business A', 'id-a');
    syncLaunchBusinessIdentity('Business B', 'id-b');
    expect(readLaunchBusinessName()).toBe('Business B');
    expect(window.localStorage.getItem(LAUNCH_BUSINESS_SCOPE_KEY)).toBe(
      createLaunchBusinessScope('id-b'),
    );
  });

  it('updates cached name when the same business renames', () => {
    saveLaunchBusinessIdentity('Old Name', 'id-a');
    syncLaunchBusinessIdentity('New Name', 'id-a');
    expect(readLaunchBusinessName()).toBe('New Name');
  });

  it('does not store raw business id in launch copy keys', () => {
    saveLaunchBusinessIdentity('EL-SHADDAI', 'raw-business-uuid-123');
    expect(window.localStorage.getItem(LAUNCH_BUSINESS_NAME_KEY)).toBe('EL-SHADDAI');
    expect(window.localStorage.getItem(LAUNCH_BUSINESS_SCOPE_KEY)).not.toContain('raw-business');
    expect(window.localStorage.getItem(LAUNCH_BUSINESS_SCOPE_KEY)).not.toContain('uuid');
  });

  it('survives storage failures by failing closed', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => saveLaunchBusinessIdentity('X', 'y')).not.toThrow();
    spy.mockRestore();
  });
});
