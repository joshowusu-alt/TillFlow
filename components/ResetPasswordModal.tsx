'use client';

import { useState } from 'react';
import { resetUserPasswordAction } from '@/app/actions/users';
import SubmitButton from '@/components/SubmitButton';

export default function ResetPasswordModal({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
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
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={() => setOpen(false)}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
          <h3 className="text-lg font-semibold mb-1">Reset Password</h3>
          <p className="text-sm text-black/60 mb-4">
            Set a new password for <strong>{userName}</strong>. They will be logged out immediately.
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
            <div className="flex gap-3">
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
        </div>
      </div>
    </>
  );
}
