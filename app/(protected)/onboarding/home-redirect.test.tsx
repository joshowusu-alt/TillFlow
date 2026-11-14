import { expect, it, vi } from 'vitest';

const shell = vi.hoisted(() => vi.fn());
vi.mock('@/lib/owner-home/critical-shell', () => ({ getOwnerHomeCriticalShell: shell }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(path); } }));
vi.mock('@/app/actions/onboarding', () => ({}));
vi.mock('@/components/owner-home/OwnerHomeCompletedStream', () => ({ default: () => null }));
vi.mock('./OnboardingClient', () => ({ default: () => null }));

import OwnerReadinessContent from './OwnerReadinessContent';

it('sends completed businesses to Home and incomplete businesses to setup', async () => {
  shell.mockResolvedValue({ needsFullReadiness: false, onboardingCompletedAt: new Date(), saleCount: 1 });
  await expect(OwnerReadinessContent({ destination: 'onboarding' })).rejects.toThrow('/home');
  await expect(OwnerReadinessContent({ destination: 'home' })).resolves.toBeTruthy();
  shell.mockResolvedValue({ needsFullReadiness: true, saleCount: 0 });
  await expect(OwnerReadinessContent({ destination: 'home' })).rejects.toThrow('/onboarding');
});
