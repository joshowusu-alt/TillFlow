import { describe, expect, it } from 'vitest';
import { ADOM_RETAIL_DEMO_NAME, ADOM_RETAIL_DEMO_SLUG, DEMO_PERIOD_DAYS } from './constants';

describe('demo sandbox constants', () => {
  it('uses safe public identifiers', () => {
    expect(ADOM_RETAIL_DEMO_NAME).toBe('Adom Retail Demo');
    expect(ADOM_RETAIL_DEMO_SLUG).toBe('adom-retail-demo');
    expect(DEMO_PERIOD_DAYS).toBeGreaterThanOrEqual(14);
    expect(DEMO_PERIOD_DAYS).toBeLessThanOrEqual(30);
  });
});
