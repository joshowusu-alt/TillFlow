import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, fireEvent } from '@testing-library/react';
import OnlineOrderAttentionBanner from './OnlineOrderAttentionBanner';

const empty = { eligible: true, count: 0, orders: [] };
const outstanding = { eligible: true, count: 1, orders: [{ id: 'order1', orderNumber: 'WEB-123' }] };
const ok = (result: unknown) => ({ ok: true, json: async () => result });
const fetcher = vi.fn();
const flush = async () => { await act(async () => { await Promise.resolve(); }); };
const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const focus = async () => { fireEvent(window, new Event('focus')); await flush(); };
const banner = () => screen.queryByRole('region', { name: 'Order alerts paused' });

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  Reflect.set(navigator, 'onLine', true);
  fetcher.mockReset();
  fetcher.mockResolvedValue(ok(empty));
  vi.stubGlobal('fetch', fetcher);
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  Reflect.set(navigator, 'onLine', true);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('does not render or poll when the business or role is ineligible', async () => {
  render(<OnlineOrderAttentionBanner scopeKey="biz:main" eligible={false} />);
  await advance(60_000);
  await focus();
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
});

it('ignores a brief failed poll and clears its failure history on recovery', async () => {
  render(<OnlineOrderAttentionBanner scopeKey="biz:main" eligible />);
  await flush();
  fetcher.mockRejectedValue(new Error('offline'));
  await focus();
  await advance(15_000);
  expect(banner()).not.toBeInTheDocument();
  fetcher.mockResolvedValue(ok(empty));
  await focus();
  fetcher.mockRejectedValue(new Error('offline'));
  await advance(15_000);
  expect(banner()).not.toBeInTheDocument();
});

it('shows a paused notice only after sustained failure, then hides immediately on a successful refresh', async () => {
  fetcher.mockRejectedValue(new Error('offline'));
  render(<OnlineOrderAttentionBanner scopeKey="biz:main" eligible />);
  await flush();
  expect(banner()).not.toBeInTheDocument();
  await advance(15_000);
  expect(banner()).not.toBeInTheDocument();
  await advance(15_000);
  expect(banner()).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Order alerts paused.*Open orders/ })).toHaveAttribute('href', '/online-orders');
  fetcher.mockResolvedValue(ok(empty));
  await focus();
  expect(banner()).not.toBeInTheDocument();
});

it('does not turn background tab time into a sustained outage', async () => {
  fetcher.mockRejectedValue(new Error('offline'));
  render(<OnlineOrderAttentionBanner scopeKey="biz:main" eligible />);
  await flush();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  fireEvent(document, new Event('visibilitychange'));
  await advance(90_000);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  fetcher.mockResolvedValue(ok(empty));
  fireEvent(document, new Event('visibilitychange'));
  await flush();
  expect(banner()).not.toBeInTheDocument();
});

it('dismisses only the outage for the scoped browser session, not genuine outstanding orders', async () => {
  fetcher.mockRejectedValue(new Error('offline'));
  const first = render(<OnlineOrderAttentionBanner scopeKey="biz:main" eligible />);
  await flush();
  await advance(30_000);
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss order alerts for this session' }));
  expect(banner()).not.toBeInTheDocument();
  first.unmount();
  render(<OnlineOrderAttentionBanner scopeKey="biz:main" eligible />);
  await flush();
  await advance(30_000);
  expect(banner()).not.toBeInTheDocument();
  fetcher.mockResolvedValue(ok(outstanding));
  await focus();
  expect(screen.getByText('1 online order outstanding')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'WEB-123' })).toHaveAttribute('href', '/online-orders?order=order1#order-order1');
});

it('stops requests if the server reports that the storefront is no longer eligible', async () => {
  fetcher.mockResolvedValue(ok({ eligible: false, count: 0, orders: [] }));
  render(<OnlineOrderAttentionBanner scopeKey="biz:main" eligible />);
  await flush();
  await advance(60_000);
  await focus();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('region')).not.toBeInTheDocument();
});

it('detects a sustained offline period without making requests while offline', async () => {
  Reflect.set(navigator, 'onLine', false);
  render(<OnlineOrderAttentionBanner scopeKey="biz:main" eligible />);
  await advance(15_000);
  expect(banner()).not.toBeInTheDocument();
  await advance(15_000);
  expect(banner()).toBeInTheDocument();
  expect(fetcher).not.toHaveBeenCalled();
  Reflect.set(navigator, 'onLine', true);
  fireEvent(window, new Event('online'));
  await flush();
  expect(banner()).not.toBeInTheDocument();
});
