import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import CompactRouteLoading from '@/components/CompactRouteLoading';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('Route skeleton geometry parity', () => {
  it('gives Products, Shifts, Settings and People distinct Instant Loading shapes', () => {
    expect(read('app/(protected)/products/loading.tsx')).toContain('variant="products"');
    expect(read('app/(protected)/shifts/loading.tsx')).toContain('variant="shifts"');
    expect(read('app/(protected)/settings/loading.tsx')).toContain('variant="settings"');
    expect(read('app/(protected)/users/loading.tsx')).toContain('variant="people"');
    expect(read('app/(protected)/reports/loading.tsx')).toContain('variant="reports"');
    expect(read('app/(protected)/reports/money-received/loading.tsx')).toContain('variant="report-detail"');
    expect(read('app/(protected)/reports/balance-sheet/loading.tsx')).toContain('variant="report-detail"');
    expect(read('app/(protected)/reports/cashflow-forecast/loading.tsx')).toContain('variant="report-detail"');
    expect(read('app/(protected)/online-orders/loading.tsx')).toContain('variant="list"');
    expect(read('app/(protected)/products/[id]/loading.tsx')).toContain('variant="settings"');
    expect(read('app/(protected)/products/new/loading.tsx')).toContain('variant="settings"');
  });

  it('announces a route-specific loading name and respects reduced motion', () => {
    const src = read('components/CompactRouteLoading.tsx');
    expect(src).toContain('motion-reduce:animate-none');
    expect(src).toContain("products: 'Loading products'");
    render(React.createElement(CompactRouteLoading, { variant: 'products' }));
    expect(screen.getByRole('status', { name: 'Loading products' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading page' })).toBeNull();
  });

  it('does not force Products onto the generic list placeholder', () => {
    expect(read('app/(protected)/products/loading.tsx')).not.toContain('variant="list"');
    expect(read('components/CompactRouteLoading.tsx')).toContain('ProductCards');
    expect(read('components/CompactRouteLoading.tsx')).toContain('ReportCards');
  });
});
