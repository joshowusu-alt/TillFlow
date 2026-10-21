import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import TodayWeekChart from '@/components/reports/today/TodayWeekChart';

describe('Today daily sales chart', () => {
  it('shows exact signed amounts and dates without opening the daily table', () => {
    const markup = renderToStaticMarkup(<TodayWeekChart currency="GHS" days={[
      { key: '2026-10-20', label: 'Tue', salesPence: -20000 },
      { key: '2026-10-21', label: 'Wed', salesPence: 30000 },
    ]} />);
    const visible = markup.slice(0, markup.indexOf('<details'));
    expect(visible).toContain('−GH₵200.00');
    expect(visible).toContain('GH₵300.00');
    expect(visible).toContain('20/10');
    expect(visible).toContain('Today');
    // A shared zero point: negative extends left, positive extends right.
    expect(visible).toContain('left:0%;width:40%');
    expect(visible).toContain('left:40%;width:60%');
  });

  it('names a genuinely empty week without rendering meaningless bars', () => {
    const markup = renderToStaticMarkup(<TodayWeekChart currency="GHS" days={[
      { key: '2026-10-21', label: 'Wed', salesPence: 0 },
    ]} />);
    expect(markup).toContain('No sales in the last seven dates.');
    expect(markup).not.toContain('data-week-chart');
    expect(markup).not.toContain('NaN');
  });
});
