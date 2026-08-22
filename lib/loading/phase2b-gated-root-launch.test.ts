import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import RootLaunchLoading, {
  ROOT_COLD_START_MESSAGE,
} from '@/components/RootLaunchLoading';
import {
  LAUNCH_GENERIC_MESSAGE,
  LAUNCH_BUSINESS_NAME_KEY,
} from '@/lib/launch/business-identity';
import {
  LAUNCHING_SESSION_KEY,
  LAUNCH_SPLASH_SEEN_KEY,
  isIntentionalLaunchSession,
} from '@/lib/launch/launch-session';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Loading Phase 2B: gated RootLaunchLoading', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('does not render Opening your business when the launch flag is absent', () => {
    window.localStorage.setItem(LAUNCH_BUSINESS_NAME_KEY, 'EL-SHADDAI');
    const { container } = render(React.createElement(RootLaunchLoading));

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(LAUNCH_GENERIC_MESSAGE)).not.toBeInTheDocument();
    expect(screen.queryByText(/Opening your business/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Opening EL-SHADDAI...')).not.toBeInTheDocument();
  });

  it('renders fullscreen launch copy when the intentional launch flag is set', async () => {
    window.sessionStorage.setItem(LAUNCHING_SESSION_KEY, '1');
    window.sessionStorage.removeItem(LAUNCH_SPLASH_SEEN_KEY);

    render(React.createElement(RootLaunchLoading));

    expect(await screen.findByText(ROOT_COLD_START_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText('Loading section...')).not.toBeInTheDocument();
  });

  it('personalises launch copy only while the launch session is active', async () => {
    window.localStorage.setItem(LAUNCH_BUSINESS_NAME_KEY, 'EL-SHADDAI');
    window.sessionStorage.setItem(LAUNCHING_SESSION_KEY, '1');
    window.sessionStorage.removeItem(LAUNCH_SPLASH_SEEN_KEY);

    render(React.createElement(RootLaunchLoading));

    expect(await screen.findByText('Opening EL-SHADDAI...')).toBeInTheDocument();
    expect(screen.queryByText(ROOT_COLD_START_MESSAGE)).not.toBeInTheDocument();
  });

  it('does not treat splash-already-seen as an intentional launch', () => {
    window.sessionStorage.setItem(LAUNCHING_SESSION_KEY, '1');
    window.sessionStorage.setItem(LAUNCH_SPLASH_SEEN_KEY, '1');
    window.localStorage.setItem(LAUNCH_BUSINESS_NAME_KEY, 'EL-SHADDAI');

    expect(isIntentionalLaunchSession()).toBe(false);
    const { container } = render(React.createElement(RootLaunchLoading));
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/Opening/i)).not.toBeInTheDocument();
  });

  it('keeps /launch as the only setter of the launching flag', () => {
    const redirector = read('components/LaunchRedirector.tsx');
    const completion = read('components/LaunchSessionCompletion.tsx');
    const session = read('lib/launch/launch-session.ts');
    const usersAction = read('app/actions/users.ts');
    const reportsLoading = read('app/(protected)/reports/loading.tsx');
    const posLoading = read('app/(protected)/pos/loading.tsx');

    expect(session).toContain("tillflow:launching");
    expect(redirector).toContain('LAUNCHING_SESSION_KEY');
    expect(redirector).toContain("setItem(LAUNCHING_SESSION_KEY, '1')");
    expect(completion).toContain('removeItem(LAUNCHING_SESSION_KEY)');
    expect(usersAction).not.toContain('tillflow:launching');
    expect(usersAction).not.toContain('LAUNCHING_SESSION_KEY');
    expect(reportsLoading).not.toContain('AppLaunchLoading');
    expect(reportsLoading).not.toContain('Opening your business');
    expect(posLoading).not.toContain('Opening your business');
  });

  it('bypasses root launch splash on auth Instant Loading', () => {
    const authLoading = read('app/(auth)/loading.tsx');
    expect(authLoading).toContain('return null');
    expect(authLoading).not.toContain('RootLaunchLoading');
    expect(authLoading).not.toContain('AppLaunchLoading');
    expect(authLoading).not.toContain('Opening your business');
  });

  it('does not show launch copy on reports or POS route loaders', () => {
    expect(read('app/(protected)/reports/loading.tsx')).not.toContain('Opening');
    expect(read('app/(protected)/reports/money-received/page.tsx')).not.toContain('Opening your business');
    expect(read('app/(protected)/pos/loading.tsx')).toContain('PosBoardSkeleton');
    expect(read('app/loading.tsx')).toContain('RootLaunchLoading');
  });

  it('keeps login identity clear on auth entry', () => {
    expect(read('app/(auth)/login/page.tsx')).toContain('ClearLaunchIdentityOnAuthEntry');
    expect(read('components/LogoutForm.tsx')).toContain('clearLaunchBusinessIdentity');
    expect(read('lib/launch/business-identity.ts')).toContain('syncLaunchBusinessIdentity');
  });
});
