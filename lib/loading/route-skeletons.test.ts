import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import CompactRouteLoading from '@/components/CompactRouteLoading';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const GENERIC_FOUR_STAT_PATTERN = /grid-cols-4[\s\S]*\[\.\.\.Array\(4\)\]/;
const LEGACY_TABLE_SIX_ROWS = /\[\.\.\.Array\(6\)\]/;

describe('Phase 2a compact route skeletons', () => {
  it('keeps Phase 1 protected fallback on ProtectedRouteLoading', () => {
    const protectedLoading = read('app/(protected)/loading.tsx');
    expect(protectedLoading).toContain('ProtectedRouteLoading');
    expect(protectedLoading).not.toContain('AppLaunchLoading');
  });

  it('uses compact inventory-shaped loader without generic 4-stat table pattern', () => {
    const loader = read('app/(protected)/inventory/loading.tsx');
    expect(loader).toContain('CompactRouteLoading');
    expect(loader).toContain('variant="inventory"');
    expect(loader).not.toMatch(GENERIC_FOUR_STAT_PATTERN);
    expect(loader).not.toMatch(LEGACY_TABLE_SIX_ROWS);
  });

  it('uses compact sales list loader without stat-card dashboard pattern', () => {
    const loader = read('app/(protected)/sales/loading.tsx');
    expect(loader).toContain('CompactRouteLoading');
    expect(loader).toContain('variant="sales"');
    expect(loader).not.toMatch(GENERIC_FOUR_STAT_PATTERN);
    expect(loader).not.toMatch(LEGACY_TABLE_SIX_ROWS);
  });

  it('uses compact purchases list loader without generic 4-stat pattern', () => {
    const loader = read('app/(protected)/purchases/loading.tsx');
    expect(loader).toContain('CompactRouteLoading');
    expect(loader).toContain('variant="purchases"');
    expect(loader).not.toMatch(GENERIC_FOUR_STAT_PATTERN);
  });

  it('uses compact report-shaped fallback instead of generic table dashboard', () => {
    const loader = read('app/(protected)/reports/loading.tsx');
    const component = read('components/CompactRouteLoading.tsx');

    expect(loader).toContain('CompactRouteLoading');
    expect(loader).toContain('variant="reports"');
    expect(loader).not.toMatch(GENERIC_FOUR_STAT_PATTERN);
    expect(loader).not.toMatch(LEGACY_TABLE_SIX_ROWS);
    expect(component).toContain('ReportCards');
    expect(component).toContain('StatChips');
  });

  it('trims command center loader and avoids large duplicate Skeleton card grids', () => {
    const loader = read('app/(protected)/reports/command-center/loading.tsx');

    expect(loader).not.toContain("import Skeleton from '@/components/Skeleton'");
    expect(loader).not.toContain('Skeleton variant="card"');
    expect(loader).not.toContain('lg:grid-cols-3');
    expect(loader).not.toContain('lg:grid-cols-2');
    expect(loader).toContain('grid-cols-2');
  });

  it('leaves POS loader as a single non-branded PosBoardSkeleton', () => {
    const posLoader = read('app/(protected)/pos/loading.tsx');
    expect(posLoader).toContain('PosBoardSkeleton');
    expect(posLoader).not.toContain('TillFlow POS');
    expect(posLoader).not.toContain('CompactRouteLoading');
  });

  it('uses compact expenses and list loaders for previously legacy routes', () => {
    expect(read('app/(protected)/expenses/loading.tsx')).toContain('CompactRouteLoading');
    expect(read('app/(protected)/expenses/loading.tsx')).toContain('variant="expenses"');
    expect(read('app/(protected)/customers/loading.tsx')).toContain('variant="list"');
    expect(read('app/(protected)/products/loading.tsx')).toContain('variant="products"');
    expect(read('app/(protected)/shifts/loading.tsx')).toContain('variant="shifts"');
    expect(read('app/(protected)/settings/loading.tsx')).toContain('variant="settings"');
    expect(read('app/(protected)/users/loading.tsx')).toContain('variant="people"');
  });

  it('does not change checkout sale creation logic', () => {
    const salesActions = read('app/actions/sales.ts');
    const completeSaleBlock = salesActions.slice(
      salesActions.indexOf('export async function completeSaleAction'),
      salesActions.indexOf('export async function amendSaleAction'),
    );

    expect(completeSaleBlock).toContain('await createSale({');
    expect(salesActions).not.toContain('CompactRouteLoading');
  });

  it('renders compact route loaders without full-screen splash behaviour', () => {
    render(React.createElement(CompactRouteLoading, { variant: 'sales' }));

    expect(screen.getByRole('status', { name: 'Loading sales' })).toBeInTheDocument();
    expect(screen.queryByText(/Opening/i)).not.toBeInTheDocument();
  });
});
