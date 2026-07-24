/**
 * Failure isolation for Home Improve-Your-Records slot.
 * Recommendation failures must surface unavailable UI, not fabricated zeros.
 */
import { describe, expect, it, vi } from 'vitest';
import React from 'react';

vi.mock('@/components/owner-home/section-errors', () => ({
  HomeImproveRecordsUnavailable: () =>
    React.createElement(
      'section',
      { role: 'alert' },
      'Record improvements could not be loaded. Selling is unaffected.'
    ),
}));

describe('HomeImproveRecordsSlot failure isolation', () => {
  it('returns unavailable UI when the improve promise rejects', async () => {
    const { default: HomeImproveRecordsSlot } = await import(
      '@/components/owner-home/HomeImproveRecordsSlot'
    );
    const element = await HomeImproveRecordsSlot({
      improvePromise: Promise.reject(new Error('catalogue query timed out')),
    });
    expect(React.isValidElement(element)).toBe(true);
    // Mocked unavailable marker — not a fabricated zero-count recommendation.
    expect(element.type).toBeTypeOf('function');
    const { renderToStaticMarkup } = await import('react-dom/server');
    const markup = renderToStaticMarkup(element);
    expect(markup).toMatch(/could not be loaded/i);
    expect(markup).not.toMatch(/0 active products older than/);
  }, 15_000);
});
