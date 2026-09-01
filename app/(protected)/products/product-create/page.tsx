'use client';

import { useEffect } from 'react';
import { PRODUCT_CREATE_HREF } from '@/lib/products/product-create-href';

/**
 * Safety net for the owner defect: onboarding next/link client navigation
 * can land on /products/product-create, which the [id] route treated as a
 * missing catalogue item instead of opening Add product.
 */
export default function ProductCreateAliasPage() {
  useEffect(() => {
    window.location.replace(PRODUCT_CREATE_HREF);
  }, []);

  return <div className="card p-6">Opening Add product…</div>;
}
