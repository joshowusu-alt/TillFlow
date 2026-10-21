import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { buildMix, SalesMixChart, TrendLine, PeriodComparisonChart } from './ReportVisuals';

describe('report chart truthfulness', () => {
  it('keeps every amount when grouping a long tail', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ name: `Category ${i}`, value: i * 100 }));
    const mix = buildMix(rows)!;
    expect(mix).toHaveLength(6);
    expect(mix.at(-1)?.name).toBe('Other');
    expect(mix.reduce((sum, row) => sum + row.value, 0)).toBe(rows.reduce((sum, row) => sum + row.value, 0));
    expect(rows[0].name).toBe('Category 0');
  });
  it('does not turn signed data into a misleading pie', () => {
    render(<SalesMixChart title="Category mix" currency="GHS" rows={[{ name: 'Returns', value: -100 }]} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText(/negative values/)).toBeTruthy();
  });
  it('shows no wedge or trend when all amounts are zero', () => {
    const { container } = render(<><SalesMixChart title="Mix" currency="GHS" rows={[{ name: 'Empty', value: 0 }]} /><TrendLine title="Trend" currency="GHS" labels={['Monday']} values={[0]} /></>);
    expect(container.querySelector('svg')).toBeNull();
  });
  it('keeps exact signed trend values available without hovering', () => {
    render(<TrendLine title="Profit" currency="GHS" labels={['Monday', 'Tuesday']} values={[-1200, 2400]} />);
    expect(screen.getAllByText(/-.*12.00/)[0]).toBeTruthy();
    expect(screen.getAllByText(/24.00/)[0]).toBeTruthy();
    expect(screen.getByText('Profit — exact daily figures')).toBeTruthy();
  });
  it('compares separate periods without combining their values', () => {
    render(<PeriodComparisonChart currency="GHS" currentLabel="This month" previousLabel="Earlier month" rows={[{ name: 'Sales', current: 10000, previous: 7000 }]} />);
    expect(screen.getAllByText(/100.00/)[0]).toBeTruthy();
    expect(screen.getByText(/70.00/)).toBeTruthy();
    expect(screen.getByText(/must not be added together/)).toBeTruthy();
  });
});
