'use client';

import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

export default function SearchFilter({ placeholder = 'Search…' }: { placeholder?: string }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const [value, setValue] = useState(searchParams.get('q') ?? '');

  function handleChange(v: string) {
    setValue(v);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (v) {
        params.set('q', v);
      } else {
        params.delete('q');
      }
      params.delete('page');
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    }, 300);
  }

  return (
    <input
      className="input w-full"
      type="search"
      placeholder={placeholder}
      value={value}
      onChange={(e) => handleChange(e.target.value)}
    />
  );
}

