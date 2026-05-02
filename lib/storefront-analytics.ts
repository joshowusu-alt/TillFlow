'use client';

const MAX_EVENTS = 200;
const STORAGE_KEY = 'tillflow_analytics';

export type AnalyticsEvent = {
  event: 'view_store' | 'view_product' | 'add_to_cart' | 'remove_from_cart' | 'checkout_start' | 'order_placed' | 'search';
  slug: string;
  productId?: string;
  productName?: string;
  value?: number; // amount in pence
  query?: string;
  ts: number; // unix ms
};

export function trackEvent(e: Omit<AnalyticsEvent, 'ts'>) {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const events: AnalyticsEvent[] = raw ? JSON.parse(raw) : [];
    events.push({ ...e, ts: Date.now() });
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch {}
  if (process.env.NODE_ENV === 'development') {
    console.debug('[TillFlow Analytics]', e.event, e);
  }
}

export function getAnalyticsEvents(slug?: string): AnalyticsEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const events: AnalyticsEvent[] = raw ? JSON.parse(raw) : [];
    return slug ? events.filter((ev) => ev.slug === slug) : events;
  } catch {
    return [];
  }
}

export function clearAnalyticsEvents() {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}
