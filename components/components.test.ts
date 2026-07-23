import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import AppLaunchLoading from '@/components/AppLaunchLoading';
import RootLaunchLoading, {
  ROOT_COLD_START_DETAIL,
  ROOT_COLD_START_MESSAGE,
} from '@/components/RootLaunchLoading';
import { resolveDownloadFilename } from '@/components/DownloadLink';
import ResponsiveModal from '@/components/ResponsiveModal';

// Simple component tests without full Next.js context
describe('NetworkStatus Component Logic', () => {
    it('should show correct status text based on state', () => {
        const getStatusText = (online: boolean, syncing: boolean, pendingCount: number) => {
            if (syncing) return 'Syncing...';
            if (!online) return 'Offline';
            if (pendingCount > 0) return `${pendingCount} pending`;
            return 'Online';
        };

        expect(getStatusText(true, false, 0)).toBe('Online');
        expect(getStatusText(false, false, 0)).toBe('Offline');
        expect(getStatusText(true, true, 0)).toBe('Syncing...');
        expect(getStatusText(true, false, 5)).toBe('5 pending');
    });

    it('should determine visibility correctly', () => {
        const shouldShow = (online: boolean, pendingCount: number, syncing: boolean) => {
            return !online || pendingCount > 0 || syncing;
        };

        expect(shouldShow(true, 0, false)).toBe(false); // Hidden when online, no pending, not syncing
        expect(shouldShow(false, 0, false)).toBe(true); // Show when offline
        expect(shouldShow(true, 3, false)).toBe(true); // Show when has pending
        expect(shouldShow(true, 0, true)).toBe(true); // Show when syncing
    });
});

describe('InstallPrompt Component Logic', () => {
    it('should not show when already installed', () => {
        const shouldShow = (isInstalled: boolean, showPrompt: boolean, deferredPrompt: boolean) => {
            return !isInstalled && showPrompt && deferredPrompt;
        };

        expect(shouldShow(true, true, true)).toBe(false);
        expect(shouldShow(false, true, true)).toBe(true);
        expect(shouldShow(false, false, true)).toBe(false);
        expect(shouldShow(false, true, false)).toBe(false);
    });

    it('should respect 24-hour dismissal period', () => {
        const shouldRespectDismissal = (dismissedTime: number | null) => {
            if (!dismissedTime) return false;
            const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
            return dismissedTime > dayAgo;
        };

        const now = Date.now();
        const twelveHoursAgo = now - 12 * 60 * 60 * 1000;
        const twoDaysAgo = now - 48 * 60 * 60 * 1000;

        expect(shouldRespectDismissal(twelveHoursAgo)).toBe(true); // Don't show
        expect(shouldRespectDismissal(twoDaysAgo)).toBe(false); // OK to show
        expect(shouldRespectDismissal(null)).toBe(false); // Never dismissed
    });
});

describe('ResponsiveModal', () => {
    it('locks body scroll while open and closes on Escape', () => {
        const onClose = vi.fn();

        const { unmount } = render(
            React.createElement(
                ResponsiveModal,
                {
                    open: true,
                    onClose,
                    ariaLabel: 'Test modal',
                } as unknown as React.ComponentProps<typeof ResponsiveModal>,
                React.createElement('div', null, 'Modal content')
            )
        );

        expect(document.body.style.overflow).toBe('hidden');
        expect(document.documentElement.style.overflow).toBe('hidden');
        expect(screen.getByRole('dialog', { name: 'Test modal' })).toBeInTheDocument();

        fireEvent.keyDown(window, { key: 'Escape' });

        expect(onClose).toHaveBeenCalledTimes(1);

        unmount();

        expect(document.body.style.overflow).toBe('');
        expect(document.documentElement.style.overflow).toBe('');
    });
});

describe('RootLaunchLoading', () => {
    it('renders branded cold-start copy on the first paint', () => {
        render(React.createElement(RootLaunchLoading));

        expect(screen.getByText(ROOT_COLD_START_MESSAGE)).toBeInTheDocument();
        expect(screen.getByText(ROOT_COLD_START_DETAIL)).toBeInTheDocument();
        expect(screen.queryByText('Loading section...')).not.toBeInTheDocument();
    });

    it('keeps personalised launch copy when a safe business name is cached', async () => {
        window.localStorage.setItem('tillflow:lastBusinessName', 'EL-SHADDAI');
        render(React.createElement(RootLaunchLoading));
        expect(await screen.findByText('Opening EL-SHADDAI...')).toBeInTheDocument();
        expect(screen.queryByText(ROOT_COLD_START_MESSAGE)).not.toBeInTheDocument();
    });
});

describe('AppLaunchLoading', () => {
    beforeEach(() => {
        window.localStorage.clear();
        window.sessionStorage.clear();
    });

    it('uses neutral internal copy by default even when a last business name exists', async () => {
        window.localStorage.setItem('tillflow:lastBusinessName', 'EL-SHADDAI SUPERMARKET');

        render(React.createElement(AppLaunchLoading));

        expect(screen.getByText('Loading section...')).toBeInTheDocument();
        expect(screen.getByText('Please wait while TillFlow gets this section ready.')).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.queryByText('Opening EL-SHADDAI SUPERMARKET...')).not.toBeInTheDocument();
            expect(screen.queryByText("Getting today's sales, stock, and cash ready.")).not.toBeInTheDocument();
        });
    });

    it('uses business launch copy while the launch session is active', async () => {
        window.localStorage.setItem('tillflow:lastBusinessName', 'EL-SHADDAI SUPERMARKET');
        window.sessionStorage.setItem('tillflow:launching', '1');
        window.sessionStorage.removeItem('tillflow:launchSplashSeen');

        render(React.createElement(AppLaunchLoading, { mode: 'launch', shell: 'launch' }));

        expect(await screen.findByText('Opening EL-SHADDAI SUPERMARKET...')).toBeInTheDocument();
        expect(screen.getByText("Getting today's sales, stock, and cash ready.")).toBeInTheDocument();
        expect(screen.queryByText('Loading section...')).not.toBeInTheDocument();
        expect(screen.queryByText('Please wait while TillFlow gets this section ready.')).not.toBeInTheDocument();
    });

    it('suppresses repeated launch copy after the launch splash has been seen', async () => {
        window.localStorage.setItem('tillflow:lastBusinessName', 'EL-SHADDAI SUPERMARKET');
        window.sessionStorage.setItem('tillflow:launching', '1');
        window.sessionStorage.setItem('tillflow:launchSplashSeen', '1');

        render(React.createElement(AppLaunchLoading, { mode: 'launch', shell: 'launch' }));

        await waitFor(() => {
            expect(screen.getByText('Loading section...')).toBeInTheDocument();
            expect(screen.queryByText('Opening EL-SHADDAI SUPERMARKET...')).not.toBeInTheDocument();
            expect(screen.queryByText("Getting today's sales, stock, and cash ready.")).not.toBeInTheDocument();
        });
    });
});

describe('DownloadLink helpers', () => {
    it('prefers UTF-8 content-disposition filenames', () => {
        expect(
            resolveDownloadFilename(
                `attachment; filename*=UTF-8''risk-summary%20march.csv`,
                '/exports/risk-summary'
            )
        ).toBe('risk-summary march.csv');
    });

    it('falls back to plain content-disposition filenames', () => {
        expect(
            resolveDownloadFilename(
                'attachment; filename="cash-drawer-summary.pdf"',
                '/exports/eod-pdf'
            )
        ).toBe('cash-drawer-summary.pdf');
    });

    it('uses the path segment when no header filename exists', () => {
        expect(resolveDownloadFilename(null, '/exports/products')).toBe('products');
    });
});

describe('Analytics Data Processing', () => {
    it('should calculate growth percentage correctly', () => {
        const calcGrowth = (current: number, previous: number) => {
            if (previous === 0) return 0;
            return ((current - previous) / previous) * 100;
        };

        expect(calcGrowth(1200, 1000)).toBeCloseTo(20);
        expect(calcGrowth(800, 1000)).toBeCloseTo(-20);
        expect(calcGrowth(1000, 1000)).toBeCloseTo(0);
        expect(calcGrowth(100, 0)).toBe(0);
    });

    it('should calculate profit margin correctly', () => {
        const calcMargin = (revenue: number, cost: number) => {
            if (revenue === 0) return 0;
            return ((revenue - cost) / revenue) * 100;
        };

        expect(calcMargin(1000, 700)).toBeCloseTo(30);
        expect(calcMargin(1000, 500)).toBeCloseTo(50);
        expect(calcMargin(0, 0)).toBe(0);
    });

    it('should format peak hour correctly', () => {
        const formatPeakHour = (hour: number) => {
            return `${hour.toString().padStart(2, '0')}:00`;
        };

        expect(formatPeakHour(9)).toBe('09:00');
        expect(formatPeakHour(14)).toBe('14:00');
        expect(formatPeakHour(0)).toBe('00:00');
    });
});
