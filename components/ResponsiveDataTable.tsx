import type { ReactNode } from 'react';

export default function ResponsiveDataTable({
  mobile,
  desktop,
  mobileClassName = 'space-y-3 lg:hidden',
  desktopClassName = 'hidden lg:block',
}: {
  mobile: ReactNode;
  desktop: ReactNode;
  mobileClassName?: string;
  desktopClassName?: string;
}) {
  return (
    <>
      <div className={mobileClassName}>{mobile}</div>
      <div className={desktopClassName}>{desktop}</div>
    </>
  );
}
