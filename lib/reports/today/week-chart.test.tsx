import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
afterEach(cleanup);
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
    expect(visible).toContain('2026-10-20');
    expect(visible).toContain('Today');
    // A shared zero point: negative extends down, positive extends up.
    expect(visible).toContain('top:60%;height:40%');
    expect(visible).toContain('top:0%;height:60%');
  });

  it('lets a cashier select a zero-sales day and read its exact amount', () => {
    const { container } = render(<TodayWeekChart currency="GHS" days={[
      { key: '2026-10-20', label: 'Tue', salesPence: 689900 },
      { key: '2026-10-21', label: 'Wed', salesPence: 0 },
    ]} />);
    expect(container.querySelector('[aria-live]')?.textContent).toContain('GH₵6,899.00');
    fireEvent.click(screen.getByRole('button', { name: 'Today 2026-10-21: GH₵0.00' }));
    expect(container.querySelector('[aria-live]')?.textContent).toContain('Today so far');
    expect(container.querySelector('[aria-live]')?.textContent).toContain('GH₵0.00');
    expect(screen.getByRole('button', { name: 'Today 2026-10-21: GH₵0.00' }).getAttribute('aria-pressed')).toBe('true');
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
