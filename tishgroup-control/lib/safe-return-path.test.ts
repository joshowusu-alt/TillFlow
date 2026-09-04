import { describe, expect, it } from 'vitest';
import { isSafeInternalReturnPath, safeReturnPath, withRedirectParam } from './safe-return-path';

describe('safeReturnPath', () => {
  it('rejects protocol-relative and encoded escapes', () => {
    expect(isSafeInternalReturnPath('//evil.example')).toBe(false);
    expect(isSafeInternalReturnPath('/\\evil.example')).toBe(false);
    expect(isSafeInternalReturnPath('/command/support')).toBe(true);
    expect(safeReturnPath('//evil.example', '/command/scale')).toBe('/command/scale');
    expect(safeReturnPath('/login', '/command/support')).toBe('/command/support');
  });

  it('appends redirect params without concatenating onto a path that lacks ?', () => {
    expect(withRedirectParam('/command/support', 'error', 'Permission denied')).toBe(
      '/command/support?error=Permission+denied',
    );
    expect(withRedirectParam('/command/scale?businessId=b1', 'error', 'Missing note')).toBe(
      '/command/scale?businessId=b1&error=Missing+note',
    );
    expect(withRedirectParam('//evil.example', 'error', 'nope')).toBe('/?error=nope');
  });
});
