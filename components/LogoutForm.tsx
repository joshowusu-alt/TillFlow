'use client';

import type { FormHTMLAttributes, ReactNode } from 'react';
import { logout } from '@/app/actions/auth';
import { clearLaunchBusinessIdentity } from '@/lib/launch/business-identity';

type LogoutFormProps = Omit<FormHTMLAttributes<HTMLFormElement>, 'action' | 'onSubmit'> & {
  children: ReactNode;
};

/**
 * Signs out via the server action and clears launch personalisation immediately
 * on the client so shared-device splash cannot retain the previous business name.
 */
export default function LogoutForm({ children, ...props }: LogoutFormProps) {
  return (
    <form
      {...props}
      action={logout}
      onSubmit={() => {
        clearLaunchBusinessIdentity();
      }}
    >
      {children}
    </form>
  );
}
