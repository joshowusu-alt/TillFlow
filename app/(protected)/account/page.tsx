import PageHeader from '@/components/PageHeader';
import { requireUser } from '@/lib/auth';
import { updateMyAccountAction } from '@/app/actions/account';

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const [user, params] = await Promise.all([requireUser(), searchParams]);

  const errorMessages: Record<string, string> = {
    missing: 'Name and email are required.',
    need_password: 'Please enter your current password to save changes.',
    wrong_password: 'Current password is incorrect.',
    duplicate: 'That email is already in use by another account.',
    password_short: 'New password must be at least 6 characters.',
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

          <button className="btn-primary">Save Changes</button>
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
    </div>
  );
}
