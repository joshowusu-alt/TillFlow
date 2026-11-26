'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode, MouseEvent, KeyboardEvent } from 'react';

export default function PurchaseRow({ href, table = false, children, className }: { href: string; table?: boolean; children: ReactNode; className?: string }) {
  const router = useRouter();
  const activate = (event: MouseEvent | KeyboardEvent) => {
    if ((event.target as HTMLElement).closest('a,button,input,select,textarea,summary,form,details')) return;
    router.push(href);
  };
  const props = { className: `cursor-pointer ${className ?? ''}`, tabIndex: 0, onClick: activate, onKeyDown: (event: KeyboardEvent) => { if (event.key === 'Enter') activate(event); } };
  return table ? <tr {...props}>{children}</tr> : <div {...props}>{children}</div>;
}
