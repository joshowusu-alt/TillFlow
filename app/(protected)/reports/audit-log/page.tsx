import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import PageHeader from '@/components/PageHeader';
import type { AuditAction } from '@/lib/audit';

const ACTION_LABELS: Record<string, string> = {
  LOGIN: 'Login',
  LOGOUT: 'Logout',
  SALE_CREATE: 'Sale Created',
  SALE_VOID: 'Sale Voided',
  SALE_RETURN: 'Sale Return',
  PRODUCT_CREATE: 'Product Created',
  PRODUCT_UPDATE: 'Product Updated',
  PRODUCT_DELETE: 'Product Deleted',
  INVENTORY_ADJUST: 'Stock Adjustment',
  PURCHASE_CREATE: 'Purchase Created',
  PURCHASE_RETURN: 'Purchase Return',
  EXPENSE_CREATE: 'Expense Created',
  EXPENSE_UPDATE: 'Expense Updated',
  USER_CREATE: 'User Created',
  USER_UPDATE: 'User Updated',
  USER_DEACTIVATE: 'User Deactivated',
  SETTINGS_UPDATE: 'Settings Changed',
  PASSWORD_CHANGE: 'Password Changed',
  PRICE_CHANGE: 'Price Changed',
  DISCOUNT_APPLIED: 'Discount Applied',
  SHIFT_OPEN: 'Shift Opened',
  SHIFT_CLOSE: 'Shift Closed',
};

const ACTION_COLOURS: Record<string, string> = {
  LOGIN: 'bg-blue-100 text-blue-800',
  SALE_CREATE: 'bg-green-100 text-green-800',
  SALE_VOID: 'bg-red-100 text-red-800',
  SALE_RETURN: 'bg-orange-100 text-orange-800',
  PRODUCT_CREATE: 'bg-emerald-100 text-emerald-800',
  PRODUCT_UPDATE: 'bg-yellow-100 text-yellow-800',
  INVENTORY_ADJUST: 'bg-indigo-100 text-indigo-800',
  PURCHASE_CREATE: 'bg-cyan-100 text-cyan-800',
  PURCHASE_RETURN: 'bg-orange-100 text-orange-800',
  EXPENSE_CREATE: 'bg-pink-100 text-pink-800',
  USER_CREATE: 'bg-violet-100 text-violet-800',
  USER_UPDATE: 'bg-violet-100 text-violet-800',
  USER_DEACTIVATE: 'bg-red-100 text-red-800',
  SETTINGS_UPDATE: 'bg-gray-100 text-gray-800',
  PASSWORD_CHANGE: 'bg-amber-100 text-amber-800',
  SHIFT_OPEN: 'bg-teal-100 text-teal-800',
  SHIFT_CLOSE: 'bg-teal-100 text-teal-800',
};

export const dynamic = 'force-dynamic';

export default async function AuditLogPage({
  searchParams
}: {
  searchParams: { action?: string; user?: string; page?: string };
}) {
  await requireRole(['OWNER']);

  const business = await prisma.business.findFirst();
  if (!business) return <div>Business not found</div>;

  const pageSize = 50;
  const currentPage = Math.max(1, parseInt(searchParams.page || '1', 10) || 1);
  const skip = (currentPage - 1) * pageSize;

  const where: Record<string, unknown> = { businessId: business.id };
  if (searchParams.action) where.action = searchParams.action;
  if (searchParams.user) where.userId = searchParams.user;

  const [logs, total, users] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: pageSize,
      skip,
    }),
    prisma.auditLog.count({ where }),
    prisma.user.findMany({
      where: { businessId: business.id },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  const totalPages = Math.ceil(total / pageSize);

  function parseDetails(raw: unknown): Record<string, unknown> | null {
    if (!raw) return null;
    if (typeof raw === 'object') return raw as Record<string, unknown>;
    try { return JSON.parse(String(raw)); } catch { return null; }
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader title="Audit Log" subtitle={`${total.toLocaleString()} entries`} />

      {/* Filters */}
      <form method="GET" className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Action</label>
          <select name="action" defaultValue={searchParams.action || ''} className="border rounded px-3 py-2 text-sm">
            <option value="">All Actions</option>
            {Object.entries(ACTION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">User</label>
          <select name="user" defaultValue={searchParams.user || ''} className="border rounded px-3 py-2 text-sm">
            <option value="">All Users</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="bg-black text-white px-4 py-2 rounded text-sm font-medium hover:bg-gray-800 transition">
          Filter
        </button>
        {(searchParams.action || searchParams.user) && (
          <a href="/reports/audit-log" className="text-sm text-gray-500 underline ml-2 self-center">
            Clear
          </a>
        )}
      </form>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-gray-500 uppercase">
              <th className="py-2 pr-4">Time</th>
              <th className="py-2 pr-4">User</th>
              <th className="py-2 pr-4">Role</th>
              <th className="py-2 pr-4">Action</th>
              <th className="py-2 pr-4">Entity</th>
              <th className="py-2 pr-4">Details</th>
              <th className="py-2 pr-4">IP</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => {
              const details = parseDetails(log.details);
              return (
                <tr key={log.id} className="border-b hover:bg-gray-50">
                  <td className="py-2 pr-4 whitespace-nowrap text-gray-600">
                    {new Date(log.createdAt).toLocaleString('en-GB', {
                      day: '2-digit', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit', second: '2-digit'
                    })}
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap font-medium">{log.userName}</td>
                  <td className="py-2 pr-4 whitespace-nowrap text-xs text-gray-500">{log.userRole}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_COLOURS[log.action] || 'bg-gray-100 text-gray-700'}`}>
                      {ACTION_LABELS[log.action] || log.action}
                    </span>
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap text-gray-600">
                    {log.entity}{log.entityId ? ` #${log.entityId.slice(0, 8)}` : ''}
                  </td>
                  <td className="py-2 pr-4 max-w-xs truncate text-xs text-gray-500" title={details ? JSON.stringify(details) : ''}>
                    {details
                      ? Object.entries(details).map(([k, v]) => `${k}: ${v}`).join(', ')
                      : '—'}
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap text-xs text-gray-400">{log.ipAddress || '—'}</td>
                </tr>
              );
            })}
            {logs.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-gray-400">
                  No audit entries found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 pt-2">
          {currentPage > 1 && (
            <a
              href={`/reports/audit-log?page=${currentPage - 1}${searchParams.action ? `&action=${searchParams.action}` : ''}${searchParams.user ? `&user=${searchParams.user}` : ''}`}
              className="px-3 py-1 border rounded text-sm hover:bg-gray-50"
            >
              ← Prev
            </a>
          )}
          <span className="px-3 py-1 text-sm text-gray-500">
            Page {currentPage} of {totalPages}
          </span>
          {currentPage < totalPages && (
            <a
              href={`/reports/audit-log?page=${currentPage + 1}${searchParams.action ? `&action=${searchParams.action}` : ''}${searchParams.user ? `&user=${searchParams.user}` : ''}`}
              className="px-3 py-1 border rounded text-sm hover:bg-gray-50"
            >
              Next →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
