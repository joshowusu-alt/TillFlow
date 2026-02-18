import PageHeader from '@/components/PageHeader';
import SubmitButton from '@/components/SubmitButton';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createUserAction, updateUserAction, toggleUserActiveAction } from '@/app/actions/users';

export default async function UsersPage({
  searchParams
}: {
  searchParams: { error?: string; success?: string; edit?: string };
}) {
  const owner = await requireRole(['OWNER']);

  // Run both queries in parallel (users uses businessId directly)
  const [business, users] = await Promise.all([
    prisma.business.findUnique({
      where: { id: owner.businessId },
      select: { id: true }
    }),
    prisma.user.findMany({
      where: { businessId: owner.businessId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true
      }
    }),
  ]);
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  const editUser = searchParams.edit
    ? users.find((u) => u.id === searchParams.edit)
    : null;

  const errorMessages: Record<string, string> = {
    missing: 'Please fill in all required fields.',
    duplicate: 'A user with that email already exists.',
    password_short: 'Password must be at least 6 characters.',
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Users" subtitle="Manage cashiers, managers, and owner accounts." />

      {/* Error / Success banners */}
      {searchParams.error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {errorMessages[searchParams.error] || 'An error occurred.'}
        </div>
      )}
      {searchParams.success === 'created' && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          User created successfully.
        </div>
      )}
      {searchParams.success === 'updated' && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          User updated successfully.
        </div>
      )}

      {/* Add / Edit User form */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4">
          {editUser ? `Edit ${editUser.name}` : 'Add New User'}
        </h2>
        <form action={editUser ? updateUserAction : createUserAction} className="grid gap-4 sm:grid-cols-2">
          {editUser && <input type="hidden" name="userId" value={editUser.id} />}
          <div>
            <label className="label">Full Name *</label>
            <input
              className="input"
              name="name"
              required
              defaultValue={editUser?.name ?? ''}
              placeholder="e.g. Ama Mensah"
            />
          </div>
          <div>
            <label className="label">Email *</label>
            <input
              className="input"
              name="email"
              type="email"
              required
              defaultValue={editUser?.email ?? ''}
              placeholder="e.g. ama@store.com"
            />
          </div>
          <div>
            <label className="label">{editUser ? 'New Password (leave blank to keep)' : 'Password *'}</label>
            <input
              className="input"
              name={editUser ? 'newPassword' : 'password'}
              type="password"
              minLength={6}
              required={!editUser}
              placeholder="Min 6 characters"
            />
          </div>
          <div>
            <label className="label">
              {editUser ? 'Manager PIN (optional update)' : 'Manager PIN (optional)'}
            </label>
            <input
              className="input"
              name={editUser ? 'newApprovalPin' : 'approvalPin'}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              minLength={4}
              maxLength={8}
              placeholder="4-8 digits"
            />
            <div className="mt-1 text-xs text-black/50">
              Required for manager approvals like till close, voids and overrides.
            </div>
          </div>
          <div>
            <label className="label">Role *</label>
            <select className="input" name="role" defaultValue={editUser?.role ?? 'CASHIER'}>
              <option value="CASHIER">Cashier — POS & shifts only</option>
              <option value="MANAGER">Manager — Products, reports, settings</option>
              <option value="OWNER">Owner — Full access</option>
            </select>
          </div>
          {editUser && (
            <div className="flex items-center gap-2 sm:col-span-2">
              <input
                className="h-4 w-4"
                type="checkbox"
                name="active"
                defaultChecked={editUser.active}
              />
              <label className="text-sm">Active (uncheck to disable login)</label>
            </div>
          )}
          <div className="sm:col-span-2 flex gap-3">
            <SubmitButton className="btn-primary" loadingText={editUser ? 'Updating…' : 'Creating…'}>
              {editUser ? 'Update User' : 'Create User'}
            </SubmitButton>
            {editUser && (
              <a href="/users" className="btn-ghost">Cancel</a>
            )}
          </div>
        </form>
      </div>

      {/* Role guide */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold mb-2">Role Permissions</h3>
        <div className="grid gap-2 text-xs text-black/60 sm:grid-cols-3">
          <div className="rounded-lg bg-accentSoft p-3">
            <span className="font-semibold text-accent">Cashier</span>
            <p className="mt-1">POS, shifts, own sales. Cannot access products, reports, or settings.</p>
          </div>
          <div className="rounded-lg bg-amber-50 p-3">
            <span className="font-semibold text-amber-700">Manager</span>
            <p className="mt-1">Everything a cashier can do, plus products, inventory, purchases, reports, settings.</p>
          </div>
          <div className="rounded-lg bg-emerald-50 p-3">
            <span className="font-semibold text-emerald-700">Owner</span>
            <p className="mt-1">Full access including user management, backup/restore, and advanced accounting.</p>
          </div>
        </div>
      </div>

      {/* Users list */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4">Current Users ({users.length})</h2>
        <div className="overflow-x-auto">
          <table className="table w-full border-separate border-spacing-y-2">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="rounded-xl bg-white">
                  <td className="px-3 py-3 font-medium">{user.name}</td>
                  <td className="px-3 py-3 text-sm text-black/60">{user.email}</td>
                  <td className="px-3 py-3">
                    <span
                      className={`pill text-xs ${
                        user.role === 'OWNER'
                          ? 'bg-emerald-100 text-emerald-700'
                          : user.role === 'MANAGER'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-accentSoft text-accent'
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {user.active ? (
                      <span className="text-xs text-emerald-600 font-medium">Active</span>
                    ) : (
                      <span className="text-xs text-red-500 font-medium">Inactive</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <a
                        href={`/users?edit=${user.id}`}
                        className="text-xs text-accent hover:underline"
                      >
                        Edit
                      </a>
                      {user.id !== owner.id && (
                        <form action={toggleUserActiveAction} className="inline">
                          <input type="hidden" name="userId" value={user.id} />
                          <button
                            type="submit"
                            className={`text-xs ${
                              user.active ? 'text-red-500' : 'text-emerald-600'
                            } hover:underline`}
                          >
                            {user.active ? 'Deactivate' : 'Activate'}
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
