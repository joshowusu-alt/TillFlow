import PageHeader from '@/components/PageHeader';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export default async function UsersPage() {
  await requireRole(['OWNER']);
  const business = await prisma.business.findFirst();
  if (!business) return <div className="card p-6">Seed data missing.</div>;

  const users = await prisma.user.findMany({ where: { businessId: business.id } });

  return (
    <div className="space-y-6">
      <PageHeader title="Users" subtitle="Cashier and manager access." />
      <div className="card p-6">
        <table className="table w-full border-separate border-spacing-y-2">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="rounded-xl bg-white">
                <td className="px-3 py-3">{user.name}</td>
                <td className="px-3 py-3">{user.email}</td>
                <td className="px-3 py-3">
                  <span className="pill bg-black/5 text-black/60">{user.role}</span>
                </td>
                <td className="px-3 py-3 text-sm text-black/60">
                  {user.active ? 'Active' : 'Inactive'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
