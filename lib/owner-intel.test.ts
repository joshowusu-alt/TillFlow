import { describe, expect, it } from 'vitest';
import { rankPriorityActions } from './owner-intel';
import type { BusinessAlert } from './reports/alerts';

// Re-create the BusinessAlert type locally for test data
function makeAlert(
  id: string,
  severity: 'HIGH' | 'MEDIUM' | 'LOW',
  title: string
): BusinessAlert {
  return {
    id,
    severity,
    title,
    explanation: `Explanation for ${title}`,
    cta: { label: 'Fix it', href: `/fix/${id}` },
  };
}

describe('rankPriorityActions', () => {
  it('returns empty array when no alerts', () => {
    expect(rankPriorityActions([])).toEqual([]);
  });

  it('maps HIGH → critical, MEDIUM → warn, LOW → info', () => {
    const alerts = [
      makeAlert('A', 'LOW', 'Low alert'),
      makeAlert('B', 'MEDIUM', 'Medium alert'),
      makeAlert('C', 'HIGH', 'High alert'),
    ];
    const result = rankPriorityActions(alerts);
    expect(result[0].severity).toBe('critical');
    expect(result[1].severity).toBe('warn');
    expect(result[2].severity).toBe('info');
  });

  it('sorts critical before warn before info', () => {
    const alerts = [
      makeAlert('X', 'LOW', 'Info'),
      makeAlert('Y', 'HIGH', 'Critical'),
      makeAlert('Z', 'MEDIUM', 'Warning'),
    ];
    const result = rankPriorityActions(alerts);
    expect(result.map((r) => r.severity)).toEqual(['critical', 'warn', 'info']);
  });

  it('limits to 5 actions', () => {
    const alerts = Array.from({ length: 10 }, (_, i) =>
      makeAlert(`alert-${i}`, i % 3 === 0 ? 'HIGH' : i % 3 === 1 ? 'MEDIUM' : 'LOW', `Alert ${i}`)
    );
    const result = rankPriorityActions(alerts);
    expect(result.length).toBe(5);
  });

  it('provides a known recommendation for STOCKOUT_IMMINENT', () => {
    const alerts = [makeAlert('STOCKOUT_IMMINENT', 'HIGH', 'Products near stockout')];
    const result = rankPriorityActions(alerts);
    expect(result[0].recommendation).toContain('purchase order');
  });

  it('falls back to CTA label for unknown alert ids', () => {
    const alerts = [makeAlert('UNKNOWN_ALERT_XYZ', 'MEDIUM', 'Some custom alert')];
    const result = rankPriorityActions(alerts);
    expect(result[0].recommendation).toBe('Fix it');
  });

  it('preserves hr field mapping', () => {
    const alerts = [makeAlert('MARGIN_FALLING', 'HIGH', 'Margin falling')];
    const result = rankPriorityActions(alerts);
    expect(result[0].id).toBe('MARGIN_FALLING');
    expect(result[0].href).toBe('/fix/MARGIN_FALLING');
    expect(result[0].title).toBe('Margin falling');
  });

  it('multiple HIGH alerts all appear as critical before MEDIUM', () => {
    const alerts = [
      makeAlert('A', 'HIGH', 'High 1'),
      makeAlert('B', 'HIGH', 'High 2'),
      makeAlert('C', 'MEDIUM', 'Medium 1'),
    ];
    const result = rankPriorityActions(alerts);
    expect(result[0].severity).toBe('critical');
    expect(result[1].severity).toBe('critical');
    expect(result[2].severity).toBe('warn');
  });
});
