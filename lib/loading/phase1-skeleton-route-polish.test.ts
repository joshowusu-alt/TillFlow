import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import ChecklistReadinessSkeleton from '@/app/(protected)/onboarding/ChecklistReadinessSkeleton';
import OwnerReadinessSkeleton from '@/app/(protected)/onboarding/OwnerReadinessSkeleton';
import PosBoardSkeleton from '@/app/(protected)/pos/PosBoardSkeleton';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Loading Phase 1: skeleton and route-loader polish', () => {
  it('uses checklist-shaped light skeleton for onboarding Instant Loading and Suspense', () => {
    const loading = read('app/(protected)/onboarding/loading.tsx');
    const page = read('app/(protected)/onboarding/page.tsx');
    const checklist = read('app/(protected)/onboarding/ChecklistReadinessSkeleton.tsx');

    expect(loading).toContain('ChecklistReadinessSkeleton');
    expect(loading).not.toContain('OwnerReadinessSkeleton');
    expect(page).toContain('ChecklistReadinessSkeleton');
    expect(page).toContain('fallback={<ChecklistReadinessSkeleton />}');
    expect(page).not.toContain('fallback={<OwnerReadinessSkeleton />}');
    expect(page).not.toMatch(/import OwnerReadinessSkeleton/);

    expect(checklist).toContain('Preparing setup checklist');
    expect(checklist).toContain('from-accentSoft');
    expect(checklist).not.toContain('bg-slate-900');
    expect(checklist).not.toContain('Preparing owner home');
  });

  it('preserves completed-home dark skeleton separately without wiring it to route loading', () => {
    const homeSkeleton = read('app/(protected)/onboarding/OwnerReadinessSkeleton.tsx');
    expect(homeSkeleton).toContain('bg-slate-900');
    expect(homeSkeleton).toContain('Preparing owner home');
    expect(homeSkeleton).toContain('Completed owner-home');
  });

  it('renders checklist skeleton without dark completed-home control-centre shell', () => {
    const { container } = render(React.createElement(ChecklistReadinessSkeleton));
    expect(screen.getByRole('status', { name: 'Preparing setup checklist' })).toBeInTheDocument();
    expect(container.querySelector('.bg-slate-900')).toBeNull();
  });

  it('still renders completed-home skeleton with dark hero when used directly', () => {
    const { container } = render(React.createElement(OwnerReadinessSkeleton));
    expect(screen.getByRole('status', { name: 'Preparing owner home' })).toBeInTheDocument();
    expect(container.querySelector('.bg-slate-900')).not.toBeNull();
  });

  it('collapses POS route loading to a single non-branded PosBoardSkeleton', () => {
    const posLoader = read('app/(protected)/pos/loading.tsx');
    const posPage = read('app/(protected)/pos/page.tsx');

    expect(posLoader).toContain('PosBoardSkeleton');
    expect(posLoader).not.toContain('TillFlow POS');
    expect(posLoader).not.toContain('Logo');
    expect(posLoader).not.toContain('min-h-[70vh]');
    expect(posPage).toContain('PosBoardSkeleton');
  });

  it('renders one POS-shaped skeleton without TillFlow POS branding', () => {
    render(React.createElement(PosBoardSkeleton));
    expect(screen.getByRole('status', { name: 'Loading point of sale' })).toBeInTheDocument();
    expect(screen.queryByText(/TillFlow POS/i)).not.toBeInTheDocument();
  });

  it('unifies expenses and similar list routes onto CompactRouteLoading', () => {
    expect(read('app/(protected)/expenses/loading.tsx')).toContain('variant="expenses"');
    expect(read('app/(protected)/products/loading.tsx')).toContain('variant="list"');
    expect(read('app/(protected)/customers/loading.tsx')).toContain('variant="list"');
    expect(read('app/(protected)/suppliers/loading.tsx')).toContain('variant="list"');
    expect(read('app/(protected)/users/loading.tsx')).toContain('variant="list"');
    expect(read('app/(protected)/payments/loading.tsx')).toContain('variant="list"');
    expect(read('app/(protected)/shifts/loading.tsx')).toContain('variant="list"');
    expect(read('app/(protected)/settings/loading.tsx')).toContain('variant="list"');

    const compact = read('components/CompactRouteLoading.tsx');
    expect(compact).toContain("'expenses'");
    expect(compact).toContain("'list'");
    expect(compact).not.toContain('TillFlow');
    expect(compact).not.toContain('AppLaunchLoading');
  });

  it('does not change root launch / splash surfaces', () => {
    expect(read('app/loading.tsx')).toContain('RootLaunchLoading');
    expect(read('components/RootLaunchLoading.tsx')).toContain('mode="launch"');
    expect(read('components/RootLaunchLoading.tsx')).toContain('shell="fullscreen"');
    expect(read('app/launch/page.tsx')).toContain('LaunchRedirector');
    expect(read('components/LaunchRedirector.tsx')).toContain("tillflow:launching");
    expect(read('components/AppLaunchLoading.tsx')).toContain('mode?:');
  });
});
