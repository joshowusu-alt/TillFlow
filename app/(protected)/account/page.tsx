import PageHeader from '@/components/PageHeader';
import SubmitButton from '@/components/SubmitButton';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import QRCode from 'qrcode';
import { buildTwoFactorOtpAuthUrl } from '@/lib/security/two-factor';
import {
  beginTwoFactorSetupAction,
  cancelTwoFactorSetupAction,
  confirmTwoFactorSetupAction,
  disableTwoFactorAction,
  updateMyAccountAction
} from '@/app/actions/account';

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; twofactor?: string }>;
}) {
  const [user, params] = await Promise.all([requireUser(), searchParams]);
  // twoFactorTempSecret is intentionally excluded from the general session user;
  // fetch it directly here as it's only needed on this specific page.
  const userSecrets = await prisma.user.findUnique({
    where: { id: user.id },
    select: { twoFactorTempSecret: true },
  });
  const twoFactorTempSecret = userSecrets?.twoFactorTempSecret ?? null;
  const twoFactorSetupUri = twoFactorTempSecret
    ? buildTwoFactorOtpAuthUrl(twoFactorTempSecret, user.email)
    : null;
  const twoFactorQrDataUrl = twoFactorSetupUri ? await QRCode.toDataURL(twoFactorSetupUri) : null;

  const errorMessages: Record<string, string> = {
    missing: 'Name and email are required.',
    need_password: 'Please enter your current password to save changes.',
    wrong_password: 'Current password is incorrect.',
    duplicate: 'That email is already in use by another account.',
    password_short: 'New password must be at least 6 characters.',
    '2fa_not_ready': 'Start 2FA setup first before confirming.',
    '2fa_invalid': 'Invalid authenticator code.',
  };

  return (
    <div className="space-y-6">
      <PageHeader title="My Account" subtitle="Update your name, email, or password." />

      {params.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {errorMessages[params.error] || 'An error occurred.'}
        </div>
      )}
      {params.success === 'updated' && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          Account updated successfully. Changes take effect on your next login.
        </div>
      )}
      {params.success === '2fa_enabled' && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          Two-factor authentication is now enabled for your account.
        </div>
      )}
      {params.success === '2fa_disabled' && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          Two-factor authentication has been disabled.
        </div>
      )}

      <div className="card p-6 max-w-lg">
        <form action={updateMyAccountAction} className="space-y-4">
          <div>
            <label className="label">Full Name</label>
            <input
              className="input"
              name="name"
              required
              defaultValue={user.name}
              placeholder="Your name"
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              name="email"
              type="email"
              required
              defaultValue={user.email}
              placeholder="your@email.com"
            />
          </div>

          <hr className="border-black/10" />

          <div>
            <label className="label">New Password</label>
            <input
              className="input"
              name="newPassword"
              type="password"
              placeholder="Leave blank to keep current password"
              minLength={6}
            />
            <div className="mt-1 text-xs text-black/50">
              Only fill this if you want to change your password. Min 6 characters.
            </div>
          </div>

          <hr className="border-black/10" />

          <div>
            <label className="label">Current Password *</label>
            <input
              className="input"
              name="currentPassword"
              type="password"
              required
              placeholder="Enter current password to confirm changes"
            />
            <div className="mt-1 text-xs text-black/50">
              Required to verify your identity before saving any changes.
            </div>
          </div>

          <SubmitButton className="btn-primary" loadingText="Saving…">Save Changes</SubmitButton>
        </form>
      </div>

      <div className="card p-4 max-w-lg">
        <div className="flex items-center gap-3 text-sm text-black/60">
          <div className="rounded-full bg-black/5 p-2">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <div className="font-semibold text-black/70">Role: {user.role}</div>
            <div>Your role can only be changed by the store owner.</div>
          </div>
        </div>
      </div>

      <div className="card p-6 max-w-lg space-y-4">
        <h2 className="text-lg font-semibold">Two-Factor Authentication (2FA)</h2>
        <p className="text-sm text-black/60">
          Add an authenticator app challenge to protect logins even if your password is exposed.
        </p>

        {!user.twoFactorEnabled && !twoFactorTempSecret ? (
          <form action={beginTwoFactorSetupAction} className="space-y-3">
            <div>
              <label className="label">Current Password</label>
              <input
                className="input"
                name="currentPassword"
                type="password"
                required
                placeholder="Enter current password to begin setup"
              />
            </div>
            <SubmitButton className="btn-primary" loadingText="Starting…">Start 2FA Setup</SubmitButton>
          </form>
        ) : null}

        {!user.twoFactorEnabled && twoFactorTempSecret && twoFactorSetupUri ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-black/10 bg-black/5 p-4">
              <div className="text-sm font-semibold">Step 1: Scan QR code</div>
              {twoFactorQrDataUrl ? (
                <img
                  src={twoFactorQrDataUrl}
                  alt="2FA QR code"
                  className="mt-3 h-44 w-44 rounded-lg border border-black/10 bg-white p-2"
                />
              ) : null}
              <div className="mt-3 text-xs text-black/60">
                If scanning fails, add this key manually:
              </div>
              <code className="mt-1 block break-all rounded-lg bg-white px-2 py-2 text-xs">
                {twoFactorTempSecret}
              </code>
            </div>

            <form action={confirmTwoFactorSetupAction} className="space-y-3">
              <div>
                <label className="label">Step 2: Enter 6-digit code</label>
                <input
                  className="input"
                  name="otp"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="123456"
                  required
                />
              </div>
              <div className="flex items-center gap-3">
                <SubmitButton className="btn-primary" loadingText="Enabling…">Enable 2FA</SubmitButton>
              </div>
            </form>

            <form action={cancelTwoFactorSetupAction}>
              <button className="btn-ghost" type="submit">Cancel setup</button>
            </form>
          </div>
        ) : null}

        {user.twoFactorEnabled ? (
          <form action={disableTwoFactorAction} className="space-y-3">
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">
              2FA is currently enabled.
            </div>
            <div>
              <label className="label">Current Password</label>
              <input
                className="input"
                name="currentPassword"
                type="password"
                required
                placeholder="Enter current password"
              />
            </div>
            <div>
              <label className="label">Authenticator Code</label>
              <input
                className="input"
                name="otp"
                inputMode="numeric"
                pattern="[0-9]*"
                required
                placeholder="123456"
              />
            </div>
            <SubmitButton className="btn-ghost" loadingText="Disabling…">Disable 2FA</SubmitButton>
          </form>
        ) : null}
      </div>
    </div>
  );
}
