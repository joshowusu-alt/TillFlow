import type { ReactNode } from 'react';

export type ResponsiveDataTableMode = 'cards' | 'dense-ledger' | 'desktop-only';

type BaseProps = {
  desktop: ReactNode;
  mobileClassName?: string;
  desktopClassName?: string;
};

type CardsModeProps = BaseProps & {
  /** Operational list — requires an adapted mobile card/list representation. */
  mode: 'cards';
  mobile: ReactNode;
};

type DenseLedgerModeProps = BaseProps & {
  /**
   * Approved dense ledger/report — controlled horizontal scrolling is allowed.
   * Prefer a mobile renderer when row identity and actions would otherwise be trapped.
   */
  mode: 'dense-ledger';
  mobile?: ReactNode;
};

type DesktopOnlyModeProps = BaseProps & {
  /**
   * Explicit desktop-only presentation. Must be intentional and approved —
   * do not use for Money/Stock operational lists.
   */
  mode: 'desktop-only';
  mobile?: never;
};

export type ResponsiveDataTableProps = CardsModeProps | DenseLedgerModeProps | DesktopOnlyModeProps;

/**
 * Shared responsive list contract.
 *
 * - `cards`: mobile card/list + desktop table (required for operational Money/Stock lists)
 * - `dense-ledger`: controlled overflow ledger; optional mobile renderer
 * - `desktop-only`: intentional desktop-only (must not silently trap operational workflows)
 */
export default function ResponsiveDataTable(props: ResponsiveDataTableProps) {
  const {
    desktop,
    mobile,
    mode,
    mobileClassName = 'space-y-3 lg:hidden',
    desktopClassName,
  } = props;

  if (mode === 'cards') {
    if (mobile == null && process.env.NODE_ENV !== 'production') {
      throw new Error('ResponsiveDataTable mode="cards" requires a mobile renderer.');
    }

    const resolvedDesktopClassName = desktopClassName ?? 'hidden lg:block';

    return (
      <>
        <div className={mobileClassName}>{mobile}</div>
        <div className={resolvedDesktopClassName}>{desktop}</div>
      </>
    );
  }

  if (mode === 'dense-ledger') {
    if (mobile != null) {
      const resolvedDesktopClassName = desktopClassName ?? 'hidden lg:block';
      return (
        <>
          <div className={mobileClassName}>{mobile}</div>
          <div className={resolvedDesktopClassName}>{desktop}</div>
        </>
      );
    }

    return (
      <div className={desktopClassName ?? 'responsive-table-shell overflow-x-auto'}>{desktop}</div>
    );
  }

  // desktop-only
  if (!desktopClassName) {
    return <>{desktop}</>;
  }

  return <div className={desktopClassName}>{desktop}</div>;
}
