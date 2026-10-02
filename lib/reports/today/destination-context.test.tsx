import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ReportsContextNavClient } from '@/lib/reports/today/context-nav-client';
import {
  destinationOmitsStoreId,
  reportReturnPaths,
  returnPathFor,
  STAGE_3A_WITHHELD_HREFS,
} from '@/lib/reports/today/stage3a-nav';

let pathname = '/reports/money-received';
let search = 'storeId=store-1';

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(search),
}));

const root = process.cwd();

function count(markup: string, needle: string) {
  return markup.split(needle).length - 1;
}

function chrome() {
  return renderToStaticMarkup(<ReportsContextNavClient ownedStoreIds={['store-1']} />);
}

describe('Stage 3A destination context', () => {
  it('follows the live path, so Money Received never keeps the Sales Analytics title', () => {
    pathname = '/reports/analytics';
    search = 'storeId=store-1';
    const analytics = chrome();
    expect(analytics).toContain('Sales analytics');
    expect(analytics).toContain('Back to Activity');

    pathname = '/reports/money-received';
    const money = chrome();
    expect(money).toContain('>Activity<');
    expect(money).toContain('>Money received<');
    expect(money).not.toContain('Sales analytics');
    expect(count(money, 'aria-label="Reports location"')).toBe(1);
    expect(money).toContain('aria-label="Back to Activity, Reports"');
    expect(count(money, '>Back to Activity<')).toBe(0);
    expect(money).toContain('href="/reports?section=activity&amp;storeId=store-1"');
  });

  it('shows More-reports context for Income Statement and omits branch scope', () => {
    pathname = '/reports';
    search = '';
    expect(chrome()).toBe('');

    pathname = '/reports/income-statement';
    search = 'storeId=store-1';
    const markup = chrome();
    expect(count(markup, 'aria-label="Reports location"')).toBe(1);
    expect(markup).toContain('>Income statement<');
    expect(markup).toContain('>More reports<');
    expect(markup).toContain('aria-label="Back to More reports, Reports"');
    expect(count(markup, '>Back to More reports<')).toBe(0);
    expect(markup).toContain('href="/reports?section=more"');
    expect(markup).not.toContain('storeId=');
    expect(markup).not.toContain('Back to Activity');

    const page = readFileSync(join(root, 'app/(protected)/reports/income-statement/page.tsx'), 'utf8');
    expect(page).toContain("surfaceId: 'income_statement'");
    expect(page).not.toContain('storeId?');
    expect(page).not.toContain('aria-label="Reports location"');
    expect(page).not.toContain('Back to More reports');
  });

  it.each(reportReturnPaths())('$href uses its own title, one landmark, and the section return', (path) => {
    pathname = path.href;
    search = 'storeId=store-1';
    const markup = chrome();
    const section = path.section === 'activity' ? 'Activity' : 'More reports';
    expect(returnPathFor(path.href)).toMatchObject({ title: path.title, backLabel: path.backLabel, section: path.section });
    expect(count(markup, 'aria-label="Reports location"')).toBe(1);
    expect(count(markup, `>${path.title}<`)).toBe(1);
    expect(markup).toContain(`aria-label="${path.backLabel}, Reports"`);
    expect(count(markup, `>${path.backLabel}<`)).toBe(0);
    expect(markup).toContain(`>${section}<`);
    expect(markup).not.toContain('Back to Today');
    if (destinationOmitsStoreId(path.href)) {
      expect(markup).not.toContain('storeId=');
      expect(markup).toContain(`href="/reports?section=${path.section}"`);
    } else {
      expect(markup).toContain(`storeId=store-1`);
      expect(markup).toContain(`href="/reports?section=${path.section}&amp;storeId=store-1"`);
    }
    const page = readFileSync(join(root, `app/(protected)${path.href}/page.tsx`), 'utf8');
    expect(page).not.toContain('aria-label="Reports location"');
    expect(page).not.toContain(path.backLabel);
  });

  it('does not give the Activity directory a return to More reports', () => {
    pathname = '/reports';
    search = 'section=activity&storeId=store-1';
    const markup = chrome();
    expect(markup).not.toContain('Back to More reports');
    expect(markup).not.toContain('Reports location');
    const directory = readFileSync(join(root, 'app/(protected)/reports/page.tsx'), 'utf8');
    const sections = readFileSync(join(root, 'components/reports/ReportsSectionHead.tsx'), 'utf8');
    expect(directory).not.toContain('Back to More reports');
    expect(sections).not.toContain('Back to More reports');
  });

  it('leaves withheld direct routes on their existing Today return', () => {
    for (const href of STAGE_3A_WITHHELD_HREFS) {
      pathname = href;
      search = 'storeId=store-1';
      const markup = chrome();
      const path = returnPathFor(href);
      expect(path && 'withheld' in path && path.title.length > 0).toBe(true);
      expect(count(markup, 'aria-label="Reports location"')).toBe(1);
      expect(count(markup, '>Back to Today<')).toBe(1);
      expect(count(markup, '>Back to Activity<')).toBe(0);
      expect(count(markup, '>Back to More reports<')).toBe(0);
      expect(markup).toContain('storeId=store-1');
    }
  });
});
