'use client';

import { useEffect } from 'react';
import { clearLaunchBusinessIdentity } from '@/lib/launch/business-identity';

/**
 * Clears launch personalisation on auth-entry surfaces (login, etc.).
 * Covers logout, expired sessions, and any redirect that lands on login
 * without depending on a single sign-out button.
 */
export default function ClearLaunchIdentityOnAuthEntry() {
  useEffect(() => {
    clearLaunchBusinessIdentity();
  }, []);

  return null;
}
