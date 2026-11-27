import { describe, expect, it } from 'vitest';
import { supportsDesktopDirectPrint } from './receipt-print-platform';

describe('receipt direct printing platform', () => {
  it.each(['iPhone', 'iPad', 'Android', 'Windows Phone', 'Silk', 'Tablet'])('excludes %s', userAgent => {
    expect(supportsDesktopDirectPrint({ userAgent, platform: '', maxTouchPoints: 2 })).toBe(false);
  });
  it('excludes desktop-style iPad and touch-only Windows tablet', () => {
    expect(supportsDesktopDirectPrint({ userAgent: 'Macintosh Safari', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(false);
    expect(supportsDesktopDirectPrint({ userAgent: 'Windows Chrome', platform: 'Win32', maxTouchPoints: 5 }, true)).toBe(false);
  });
  it('allows desktop and touchscreen laptops with a fine pointer', () => {
    expect(supportsDesktopDirectPrint({ userAgent: 'Macintosh Safari', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(true);
    expect(supportsDesktopDirectPrint({ userAgent: 'Windows Chrome', platform: 'Win32', maxTouchPoints: 5 })).toBe(true);
  });
});
