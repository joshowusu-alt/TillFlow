import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('mobile overflow guards', () => {
  const globals = read('app/globals.css');
  const searchFilter = read('components/SearchFilter.tsx');
  const pageHeader = read('components/PageHeader.tsx');
  const metricCard = read('components/OperationalMetricCard.tsx');
  const suppliers = read('app/(protected)/suppliers/page.tsx');
  const customers = read('app/(protected)/customers/page.tsx');
  const products = read('app/(protected)/products/page.tsx');
  const layout = read('app/(protected)/layout.tsx');

  it('clips horizontal overflow at the main shell and defines operational layout utilities', () => {
    expect(globals).toContain('.app-main-shell');
    expect(globals).toContain('overflow-x: clip');
    expect(globals).toContain('.operational-page');
    expect(globals).toContain('.operational-metric-grid');
    expect(globals).toContain('.operational-filter-row');
    expect(globals).toContain('.operational-search-shell');
    expect(globals).toContain('minmax(0, 1fr)');
  });

  it('keeps shared search and page header wrappers shrink-safe on mobile', () => {
    expect(searchFilter).toContain('min-w-0 w-full');
    expect(searchFilter).toContain('min-w-0 w-full flex-1');
    expect(pageHeader).toContain('min-w-0 max-w-full');
    expect(metricCard).toContain('operational-metric-card');
    expect(metricCard).toContain('operational-metric-card__label');
    expect(metricCard).toContain('operational-metric-card__value');
  });

  it('uses operational mobile layout on suppliers', () => {
    expect(suppliers).toContain('operational-page');
    expect(suppliers).toContain('operational-metric-grid operational-metric-grid--3');
    expect(suppliers).toContain('operational-filter-row');
    expect(suppliers).toContain('operational-search-shell');
    expect(suppliers).toContain('operational-filter-actions');
    expect(suppliers).toContain('OperationalMetricCard');
    expect(suppliers).not.toContain('max-w-xs flex-1');
    expect(suppliers).not.toContain('grid grid-cols-2 gap-3 lg:grid-cols-3');
  });

  it('uses operational mobile layout on customers and products', () => {
    expect(customers).toContain('operational-page');
    expect(customers).toContain('operational-metric-grid operational-metric-grid--4');
    expect(customers).toContain('operational-filter-row');
    expect(products).toContain('operational-page');
    expect(products).toContain('operational-metric-grid operational-metric-grid--4');
    expect(products).toContain('operational-search-shell');
  });

  it('keeps protected main content width bounded', () => {
    expect(layout).toContain('app-main-shell w-full min-w-0 max-w-full');
  });
});
