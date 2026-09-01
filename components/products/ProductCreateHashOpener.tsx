'use client';

import { useEffect } from 'react';

export const PRODUCT_CREATE_HASH_ID = 'product-create';
const STICKY_OFFSET_PX = 88;

/**
 * `/products#product-create` must open the Add product <details> and reveal
 * the form. Native hash only scrolls to the summary, which stays visible while
 * the form stays closed — that is the owner “No products yet” trap.
 */
export function applyProductCreateHash(root: ParentNode = document): boolean {
  if (typeof window === 'undefined') return false;
  const hash = window.location.hash.replace(/^#/, '');
  if (hash !== PRODUCT_CREATE_HASH_ID) return false;

  const summary = root.querySelector<HTMLElement>(`#${PRODUCT_CREATE_HASH_ID}`);
  const details = summary?.closest('details');
  if (!summary || !details) return false;

  details.open = true;
  const nameInput = details.querySelector<HTMLInputElement>('form input[name="name"]');
  details.style.scrollMarginTop = `${STICKY_OFFSET_PX}px`;
  if (nameInput) nameInput.style.scrollMarginTop = `${STICKY_OFFSET_PX}px`;

  window.requestAnimationFrame(() => {
    const target = nameInput ?? details;
    if (typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    nameInput?.focus({ preventScroll: true });
  });
  return true;
}

export default function ProductCreateHashOpener() {
  useEffect(() => {
    const onHashChange = () => {
      applyProductCreateHash();
    };
    applyProductCreateHash();
    const retry = window.setTimeout(onHashChange, 120);
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.clearTimeout(retry);
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  return null;
}
