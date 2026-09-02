import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import PosBoardSkeleton from '@/app/(protected)/pos/PosBoardSkeleton';
import ChecklistReadinessSkeleton from '@/app/(protected)/onboarding/ChecklistReadinessSkeleton';
import OwnerReadinessSkeleton from '@/app/(protected)/onboarding/OwnerReadinessSkeleton';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('Home and POS skeleton state selection', () => {
  it('does not wrap completed Home in a page-level checklist Suspense fallback', () => {
    const page = read('app/(protected)/onboarding/page.tsx');
    const content = read('app/(protected)/onboarding/OwnerReadinessContent.tsx');
    expect(page).not.toContain('ChecklistReadinessSkeleton');
    expect(content).toContain('needsFullReadiness');
    expect(content).toContain('fallback={<ChecklistReadinessSkeleton />}');
    expect(content).toContain('OwnerHomeCompletedStream');
  });

  it('caches the owner critical shell so loading and content share one lookup', () => {
    const shell = read('lib/owner-home/critical-shell.ts');
    expect(shell).toContain('import { cache } from \'react\'');
    expect(shell).toContain('export const getOwnerHomeCriticalShell = cache(');
  });

  it('renders distinct Home skeletons for checklist vs established control centre', () => {
    render(React.createElement(ChecklistReadinessSkeleton));
    expect(screen.getByRole('status', { name: 'Preparing setup checklist' })).toBeInTheDocument();
    render(React.createElement(OwnerReadinessSkeleton));
    expect(screen.getByRole('status', { name: 'Preparing owner home' })).toBeInTheDocument();
  });

  it('POS skeleton uses a mobile checkout bar and a desktop cart, not a promised till control', () => {
    const { container } = render(React.createElement(PosBoardSkeleton));
    expect(screen.getByRole('status', { name: 'Loading point of sale' })).toBeInTheDocument();
    expect(container.querySelector('[data-pos-skeleton-search="true"]')).not.toBeNull();
    expect(container.querySelector('[data-pos-skeleton-cart="mobile"]')).not.toBeNull();
    expect(container.querySelector('[data-pos-skeleton-cart="desktop"]')).not.toBeNull();
    expect(container.querySelector('[data-pos-skeleton-cart="desktop"]')?.className).toContain('hidden');
    expect(container.querySelector('[data-pos-skeleton-cart="desktop"]')?.className).toContain('lg:block');
    expect(screen.queryByText(/Preparing checkout/i)).toBeNull();
    expect(screen.queryByText(/Till 3/i)).toBeNull();
  });
});
