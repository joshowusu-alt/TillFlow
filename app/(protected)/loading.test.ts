import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import ProtectedRouteLoading from '@/components/ProtectedRouteLoading';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Protected route loading fallback (Phase 1)', () => {
  it('does not use AppLaunchLoading or launch copy in protected loading.tsx', () => {
    const protectedLoading = read('app/(protected)/loading.tsx');
    const component = read('components/ProtectedRouteLoading.tsx');

    expect(protectedLoading).not.toContain('AppLaunchLoading');
    expect(protectedLoading).not.toContain('mode="launch"');
    expect(protectedLoading).not.toContain('shell="launch"');
    expect(protectedLoading).toContain('ProtectedRouteLoading');

    expect(component).not.toContain('AppLaunchLoading');
    expect(component).not.toContain('Opening');
    expect(component).not.toContain('z-[9999]');
    expect(component).not.toContain('fixed inset-0');
    expect(component).not.toContain('min-h-dvh');
    expect(component).not.toContain('w-screen');
  });

  it('keeps branded launch loading for cold boot entry points', () => {
    const rootLoading = read('app/loading.tsx');
    const launchPage = read('app/launch/page.tsx');

    expect(rootLoading).toContain('AppLaunchLoading');
    expect(rootLoading).toContain('mode="launch"');
    expect(rootLoading).toContain('shell="fullscreen"');
    expect(launchPage).toContain('tillflow-logo-blue.png');
    expect(launchPage).toContain('LaunchRedirector');
    expect(launchPage).toContain('fixed inset-0');
  });

  it('renders a calm in-app skeleton without launch branding', () => {
    render(React.createElement(ProtectedRouteLoading));

    expect(screen.getByRole('status', { name: 'Loading page' })).toBeInTheDocument();
    expect(screen.getByText('Loading page…')).toBeInTheDocument();
    expect(screen.queryByText(/Opening/i)).not.toBeInTheDocument();
    expect(screen.queryByAltText('TillFlow')).not.toBeInTheDocument();
  });
});
