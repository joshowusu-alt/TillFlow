import { existsSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import CompactRouteLoading from '@/components/CompactRouteLoading';
import PosBoardSkeleton from '@/app/(protected)/pos/PosBoardSkeleton';
import CommandCenterLoading from '@/app/(protected)/reports/command-center/loading';
import OwnerIntelligenceLoading from '@/app/(protected)/reports/owner/loading';
import { ROUTE_SKELETON_REGISTRY } from '@/lib/loading/route-skeleton-registry';

describe('Route skeleton component fixtures', () => {
  it('keeps deterministic skeletons in tests, not a Production /dev route', () => {
    expect(existsSync(join(process.cwd(), 'app/(protected)/dev/loading-harness/page.tsx'))).toBe(false);

    for (const entry of ROUTE_SKELETON_REGISTRY) {
      const { unmount } = renderFixture(entry.variant);
      if (entry.variant === 'pos') {
        expect(screen.getByRole('status', { name: 'Loading point of sale' })).toBeInTheDocument();
      } else if (entry.variant === 'command-center') {
        expect(screen.getByRole('status', { name: 'Loading command centre' })).toBeInTheDocument();
      } else if (entry.variant === 'owner') {
        expect(screen.getByRole('status', { name: 'Loading owner intelligence' })).toBeInTheDocument();
      } else {
        expect(document.querySelector(`[data-route-skeleton="${entry.variant}"]`)).not.toBeNull();
      }
      unmount();
    }
  });
});

function renderFixture(variant: (typeof ROUTE_SKELETON_REGISTRY)[number]['variant']) {
  if (variant === 'pos') return render(React.createElement(PosBoardSkeleton));
  if (variant === 'command-center') return render(React.createElement(CommandCenterLoading));
  if (variant === 'owner') return render(React.createElement(OwnerIntelligenceLoading));
  return render(React.createElement(CompactRouteLoading, { variant }));
}
