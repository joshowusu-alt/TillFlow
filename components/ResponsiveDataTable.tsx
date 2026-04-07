import type { ReactNode } from 'react';

export default function ResponsiveDataTable({
  desktop,
  mobile,
  mode = 'table',
  mobileClassName = 'space-y-3 lg:hidden',
  desktopClassName,
}: {
  desktop: ReactNode;
  mobile?: ReactNode;
  mode?: 'table' | 'cards';
  mobileClassName?: string;
  desktopClassName?: string;
}) {
  if (mode === 'cards' && mobile) {
    const resolvedDesktopClassName = desktopClassName ?? 'hidden lg:block';

    return (
      <>
        <div className={mobileClassName}>{mobile}</div>
        <div className={resolvedDesktopClassName}>{desktop}</div>
      </>
    );
  }

  if (!desktopClassName) {
    return <>{desktop}</>;
  }

  return (
    <div className={desktopClassName}>{desktop}</div>
  );
}
