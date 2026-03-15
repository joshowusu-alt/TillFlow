'use client';

import { useState } from 'react';
import { resetUserPasswordAction } from '@/app/actions/users';
import SubmitButton from '@/components/SubmitButton';
import ResponsiveModal from '@/components/ResponsiveModal';

export default function ResetPasswordModal({
  userId,
  userName,
  isSelf = false,
}: {
  userId: string;
  userName: string;
  isSelf?: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-amber-600 hover:underline"
      >
        Reset PW
      </button>
    );
  }

  return (
    <ResponsiveModal
      open={open}
      onClose={() => setOpen(false)}
      ariaLabel="Reset password"
      maxWidthClassName="max-w-sm"
      panelClassName="p-6"
    >
      <h3 className="mb-1 text-lg font-semibold">Reset Password</h3>
      <p className="mb-4 text-sm text-black/60">
        {isSelf
          ? 'Set a new password for your account. You will be logged out and need to sign in again.'
          : <>Set a new password for <strong>{userName}</strong>. They will be logged out immediately.</>}
      </p>
      <form action={resetUserPasswordAction} className="space-y-4">
        <input type="hidden" name="userId" value={userId} />
        <div>
          <label className="label">New Password</label>
          <input
            name="newPassword"
            type="password"
            className="input"
            minLength={6}
            required
            placeholder="Min 6 characters"
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <SubmitButton className="btn-primary flex-1" loadingText="Resetting…">
            Reset Password
          </SubmitButton>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="btn-ghost flex-1"
          >
            Cancel
          </button>
        </div>
      </form>
    </ResponsiveModal>
  );
}
