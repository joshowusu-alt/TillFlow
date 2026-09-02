import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SHELL_COMPACT_LANDSCAPE_MQ,
  SHELL_DESKTOP_SHORT_MQ,
  classifyShellLayout,
  shellShowsHeaderHamburger,
  shellShowsHeaderSignOut,
  shellUsesBottomTabs,
} from './shell-layout';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('Shell layout contract', () => {
  it('classifies the agreed viewports without treating short desktop as phone-compact', () => {
    expect(classifyShellLayout({ width: 390, height: 844 })).toBe('phone-portrait');
    expect(classifyShellLayout({ width: 390, height: 400 })).toBe('phone-keyboard');
    expect(classifyShellLayout({ width: 844, height: 390 })).toBe('phone-landscape-compact');
    expect(classifyShellLayout({ width: 568, height: 320 })).toBe('phone-landscape-compact');
    expect(classifyShellLayout({ width: 768, height: 1024 })).toBe('tablet');
    expect(classifyShellLayout({ width: 1024, height: 768 })).toBe('desktop');
    expect(classifyShellLayout({ width: 1280, height: 480 })).toBe('desktop-short');
    expect(classifyShellLayout({ width: 1920, height: 1080 })).toBe('desktop');
  });

  it('keeps header Sign out on short desktop and uses More on compact phones', () => {
    expect(shellShowsHeaderSignOut('desktop-short')).toBe(true);
    expect(shellShowsHeaderSignOut('desktop')).toBe(true);
    expect(shellShowsHeaderSignOut('tablet')).toBe(true);
    expect(shellShowsHeaderSignOut('phone-landscape-compact')).toBe(false);
    expect(shellShowsHeaderSignOut('phone-portrait')).toBe(false);
    expect(shellShowsHeaderSignOut('phone-keyboard')).toBe(false);
    expect(shellUsesBottomTabs('phone-portrait', false)).toBe(true);
    expect(shellUsesBottomTabs('desktop', false)).toBe(false);
    expect(shellShowsHeaderHamburger('phone-portrait', false)).toBe(false);
    expect(shellShowsHeaderHamburger('phone-portrait', true)).toBe(true);
    expect(shellShowsHeaderHamburger('desktop', false)).toBe(false);
    expect(shellShowsHeaderHamburger('desktop', true)).toBe(false);
  });

  it('keeps CSS and TopNav matchMedia on the same compact-phone query', () => {
    const css = read('app/globals.css');
    const topNav = read('components/TopNav.tsx');
    expect(css).toContain(`@media ${SHELL_COMPACT_LANDSCAPE_MQ}`);
    expect(css).toContain(`@media ${SHELL_DESKTOP_SHORT_MQ}`);
    expect(topNav).toContain('SHELL_COMPACT_LANDSCAPE_MQ');
    expect(topNav).toContain('SHELL_LG_PX');
    expect(topNav).toContain('inert');
    expect(css).not.toContain('@media (orientation: landscape) and (max-height: 500px) {');
  });
});
