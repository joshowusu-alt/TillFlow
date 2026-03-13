'use client';

import { useEffect } from 'react';
import { ACTIVE_BUSINESS_COOKIE } from '@/lib/business-scope';
import { setActiveOfflineScope } from '@/lib/offline/storage';

type ProtectedBusinessScopeProps = {
  businessId: string;
  storeId?: string | null;
};

export default function ProtectedBusinessScope({ businessId, storeId }: ProtectedBusinessScopeProps) {
  useEffect(() => {
    const encodedBusinessId = encodeURIComponent(businessId);
    const currentCookie = document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${ACTIVE_BUSINESS_COOKIE}=`));

    if (currentCookie !== `${ACTIVE_BUSINESS_COOKIE}=${encodedBusinessId}`) {
      document.cookie = `${ACTIVE_BUSINESS_COOKIE}=${encodedBusinessId}; path=/; max-age=31536000; samesite=lax`;
    }

    if (storeId) {
      void setActiveOfflineScope({ businessId, storeId });
    }
  }, [businessId, storeId]);

  return null;
}
