'use client';

import { useEffect } from 'react';
import { syncLaunchBusinessIdentity } from '@/lib/launch/business-identity';

export default function BusinessNameSaver({
  name,
  businessId,
}: {
  name: string;
  businessId: string;
}) {
  useEffect(() => {
    syncLaunchBusinessIdentity(name, businessId);
  }, [name, businessId]);

  return null;
}
