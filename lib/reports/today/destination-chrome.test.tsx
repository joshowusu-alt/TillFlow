import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined }),
}));
import { ReportsReturnPath } from '@/components/reports/ReportsContextNav';
import ReportsDestinationHead from '@/components/reports/ReportsDestinationHead';
import { returnPathFor } from '@/lib/reports/today/stage3a-nav';

const root = process.cwd();

function count(markup: string, needle: string) {
  return markup.split(needle).length - 1;
}

const covered = [
  {
    pathname: '/reports/dashboard',
    title: 'Trading',
    back: 'Back to Activity',
    storeId: 'store-1',
    page: 'app/(protected)/reports/dashboard/page.tsx',
    usesHead: true,
  },
  {
    pathname: '/reports/analytics',
    title: 'Sales analytics',
    back: 'Back to Activity',
    storeId: 'store-1',
    page: 'app/(protected)/reports/analytics/page.tsx',
    usesHead: true,
  },
  {
    pathname: '/reports/business-movement',
    title: 'Business movement',
    back: 'Back to Activity',
    storeId: 'store-1',
    page: 'app/(protected)/reports/business-movement/page.tsx',
    usesHead: true,
  },
  {
    pathname: '/reports/income-statement',
    title: 'Income statement',
    back: 'Back to More reports',
    storeId: null,
    page: 'app/(protected)/reports/income-statement/page.tsx',
    usesHead: false,
  },
  {
    pathname: '/reports/weekly-digest',
    title: 'Weekly digest',
    back: 'Back to Today',
    storeId: 'store-1',
    page: 'app/(protected)/reports/weekly-digest/page.tsx',
    usesHead: false,
  },
] as const;

describe('Stage 3A destination chrome', () => {
  it('keeps the direct weekly digest return on the shared chrome only', () => {
    const path = returnPathFor('/reports/weekly-digest');
    expect(path && 'withheld' in path).toBe(true);
    const markup = renderToStaticMarkup(<ReportsReturnPath path={path!} storeId="store-1" />);
    expect(count(markup, 'aria-label="Reports location"')).toBe(1);
    expect(count(markup, '>Back to Today<')).toBe(1);
    expect(markup).toContain('storeId=store-1');
    const page = readFileSync(join(root, 'app/(protected)/reports/weekly-digest/page.tsx'), 'utf8');
    expect(page).not.toContain('Back to Today');
    expect(page).not.toContain('Reports location');
  });

  it.each(covered)('$pathname has one breadcrumb landmark and one return link', (route) => {
    const path = returnPathFor(route.pathname);
    expect(path).not.toBeNull();
    const markup = renderToStaticMarkup(
      <>
        <ReportsReturnPath path={path!} storeId={route.storeId} />
        {route.usesHead ? <ReportsDestinationHead title={route.title} scopeLabel="Accra" /> : null}
      </>,
    );
    expect(count(markup, 'aria-label="Reports location"')).toBe(1);
    expect(count(markup, `>${route.back}<`)).toBe(1);
    if (route.usesHead) expect(count(markup, '<h1')).toBe(1);
    if (route.storeId) expect(markup).toContain(`storeId=${route.storeId}`);
    if (route.pathname === '/reports/income-statement') expect(markup).not.toContain('storeId=');
    const page = readFileSync(join(root, route.page), 'utf8');
    expect(count(page, route.back)).toBe(0);
    expect(count(page, 'aria-label="Reports location"')).toBe(0);
  });
});
