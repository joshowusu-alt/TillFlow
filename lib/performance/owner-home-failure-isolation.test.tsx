import React from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import {
  HomeAttentionUnavailable,
  HomeImproveRecordsUnavailable,
  HomePerformanceUnavailable,
  HomeStatusUnavailable,
} from '@/components/owner-home/section-errors';
import { getHomeForceFailSections, assertHomeLoaderAllowed } from '@/lib/owner-home/force-fail';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('Owner Home deferred-loader failure isolation', () => {
  afterEach(() => {
    delete process.env.HOME_FORCE_FAIL;
  });

  it('wires error boundaries and try/catch unavailable states for each deferred section', () => {
    const stream = read('components/owner-home/OwnerHomeCompletedStream.tsx');
    expect(stream).toContain('HomeSectionErrorBoundary');
    expect(stream).toContain('HomePerformanceUnavailable');
    expect(stream).toContain('HomeAttentionUnavailable');
    expect(stream).toContain('HomeImproveRecordsUnavailable');
    expect(stream).toContain('HomeExtrasUnavailable');

    expect(read('components/owner-home/HomePerformanceSlot.tsx')).toContain('HomePerformanceUnavailable');
    expect(read('components/owner-home/HomeAttentionSlot.tsx')).toContain('HomeAttentionUnavailable');
    expect(read('components/owner-home/HomeImproveRecordsSlot.tsx')).toContain(
      'HomeImproveRecordsUnavailable',
    );
    expect(read('components/owner-home/HomeExtrasSlot.tsx')).toContain('HomeExtrasUnavailable');
    expect(read('components/owner-home/HomeStatusPillSlot.tsx')).toContain('Promise.allSettled');
    expect(read('components/owner-home/HomeStatusPillSlot.tsx')).toContain('HomeStatusUnavailable');
  });

  it('KPI failure UI never shows verified zero money or transaction counts', () => {
    render(<HomePerformanceUnavailable />);
    expect(screen.getByRole('alert')).toHaveTextContent(/Could not load today's figures/i);
    expect(screen.queryByText(/GH₵0/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/i })).toBeInTheDocument();
  });

  it('attention failure UI never claims no urgent issues or till all-clear', () => {
    render(<HomeAttentionUnavailable />);
    expect(screen.getByRole('alert')).toHaveTextContent(/Attention items could not be loaded/i);
    expect(screen.queryByText(/No urgent issues/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Do not assume the till is clear/i)).toBeInTheDocument();
  });

  it('IYR failure UI never shows records all-clear', () => {
    render(<HomeImproveRecordsUnavailable />);
    expect(screen.getByRole('alert')).toHaveTextContent(/Record improvements could not be loaded/i);
    expect(screen.queryByText(/good shape/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/all clear/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Selling is unaffected/i)).toBeInTheDocument();
  });

  it('status unavailable is neutral', () => {
    render(<HomeStatusUnavailable />);
    expect(screen.getByRole('status')).toHaveTextContent(/Status unavailable/i);
    expect(screen.queryByText(/No urgent issues/i)).not.toBeInTheDocument();
  });

  it('critical shell keeps Open POS outside deferred error boundaries', () => {
    const stream = read('components/owner-home/OwnerHomeCompletedStream.tsx');
    expect(stream).toContain('order-1 lg:col-start-1 lg:row-start-1');
    expect(stream).toContain('HomeActionCard');
    expect(stream).toContain('section="attention"');
    // Attention error boundary is in order-2 rail; Open POS card is in order-1 without that boundary.
    const order1 = stream.indexOf('order-1 lg:col-start-1 lg:row-start-1');
    const attentionBoundary = stream.indexOf('section="attention"');
    const openPosAction = stream.indexOf("label: 'Open POS'");
    expect(openPosAction).toBeGreaterThan(-1);
    expect(order1).toBeGreaterThan(-1);
    expect(attentionBoundary).toBeGreaterThan(order1);
  });

  it('HOME_FORCE_FAIL parses sections and throws only for listed loaders', () => {
    expect(getHomeForceFailSections().size).toBe(0);
    process.env.HOME_FORCE_FAIL = 'performance,iyr';
    expect([...getHomeForceFailSections()].sort()).toEqual(['iyr', 'performance']);
    expect(() => assertHomeLoaderAllowed('performance')).toThrow(/HOME_FORCE_FAIL:performance/);
    expect(() => assertHomeLoaderAllowed('attention')).not.toThrow();
  });

  it('HOME_FORCE_FAIL is ignored in production without allow flag', () => {
    const prevFail = process.env.HOME_FORCE_FAIL;
    const prevAllow = process.env.HOME_FORCE_FAIL_ALLOW_PROD;
    const prevDesc = Object.getOwnPropertyDescriptor(process.env, 'NODE_ENV');
    try {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        configurable: true,
        writable: true,
        enumerable: true,
      });
      process.env.HOME_FORCE_FAIL = 'performance';
      delete process.env.HOME_FORCE_FAIL_ALLOW_PROD;
      expect(getHomeForceFailSections().size).toBe(0);
      expect(() => assertHomeLoaderAllowed('performance')).not.toThrow();
    } finally {
      if (prevDesc) Object.defineProperty(process.env, 'NODE_ENV', prevDesc);
      if (prevFail === undefined) delete process.env.HOME_FORCE_FAIL;
      else process.env.HOME_FORCE_FAIL = prevFail;
      if (prevAllow === undefined) delete process.env.HOME_FORCE_FAIL_ALLOW_PROD;
      else process.env.HOME_FORCE_FAIL_ALLOW_PROD = prevAllow;
    }
  });
});
