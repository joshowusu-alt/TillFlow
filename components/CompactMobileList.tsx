import type { ReactNode } from 'react';

type CompactMobileListProps = {
  children: ReactNode;
  className?: string;
  labelledBy?: string;
  'data-label-print-mobile-queue'?: string;
};

type CompactMobileListItemProps = {
  children: ReactNode;
  className?: string;
};

/**
 * High-volume mobile list with 44px minimum tap rows.
 * Prefer this over a raw DataCard stack on products/labels.
 */
export default function CompactMobileList({
  children,
  className = '',
  labelledBy,
  ...rest
}: CompactMobileListProps) {
  return (
    <ul
      className={`space-y-2 lg:hidden ${className}`.trim()}
      data-compact-mobile-list
      aria-labelledby={labelledBy}
      {...rest}
    >
      {children}
    </ul>
  );
}

export function CompactMobileListItem({ children, className = '' }: CompactMobileListItemProps) {
  return (
    <li className={`min-h-[44px] ${className}`.trim()} data-compact-mobile-row>
      {children}
    </li>
  );
}

export const COMPACT_TAP_TARGET_CLASS = 'min-h-[44px] min-w-[44px]';
