'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function OrderLookupClient({
  slug,
  initialPhone = '',
}: {
  slug: string;
  initialPhone?: string;
}) {
  const router = useRouter();
  const [phone, setPhone] = useState(initialPhone);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = phone.trim();
    router.push(value ? `/shop/${slug}/orders?phone=${encodeURIComponent(value)}` : `/shop/${slug}/orders`);
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <label htmlFor="order-phone" className="text-[11px] font-semibold uppercase tracking-[0.22em] text-black/45">
            Phone number
          </label>
          <input
            id="order-phone"
            type="tel"
            inputMode="tel"
            placeholder="e.g. 024 123 4567"
            className="input mt-2"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary mt-auto justify-center sm:min-w-[180px]">
          Find my orders
        </button>
      </div>
    </form>
  );
}
