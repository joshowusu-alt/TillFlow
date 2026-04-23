import { prisma } from '@/lib/prisma';
import { requireBusiness } from '@/lib/auth';
import PageHeader from '@/components/PageHeader';
import Pagination from '@/components/Pagination';
import type { AuditAction } from '@/lib/audit';
import AdvancedModeNotice from '@/components/AdvancedModeNotice';
import { getFeatures } from '@/lib/features';

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
  CASH_DRAWER_ENTRY: 'Cash Drawer Entry',
  CASH_DRAWER_OPEN: 'Cash Drawer Opened',
  CASH_DRAWER_CLOSE: 'Cash Drawer Closed',
  STOCK_TRANSFER_REQUEST: 'Stock Transfer Requested',
  STOCK_TRANSFER_APPROVE: 'Stock Transfer Approved',
};

const ACTION_COLOURS: Record<string, string> = {
  LOGIN: 'bg-accentSoft text-accent',
  SALE_CREATE: 'bg-green-100 text-green-800',
  SALE_VOID: 'bg-red-100 text-red-800',
  SALE_RETURN: 'bg-orange-100 text-orange-800',
  PRODUCT_CREATE: 'bg-emerald-100 text-emerald-800',
  PRODUCT_UPDATE: 'bg-yellow-100 text-yellow-800',
  INVENTORY_ADJUST: 'bg-accentSoft text-accent',
  PURCHASE_CREATE: 'bg-cyan-100 text-cyan-800',
  PURCHASE_RETURN: 'bg-orange-100 text-orange-800',
  EXPENSE_CREATE: 'bg-pink-100 text-pink-800',
  USER_CREATE: 'bg-violet-100 text-violet-800',
  USER_UPDATE: 'bg-violet-100 text-violet-800',
  USER_DEACTIVATE: 'bg-red-100 text-red-800',
  SETTINGS_UPDATE: 'bg-gray-100 text-gray-800',
  PASSWORD_CHANGE: 'bg-amber-100 text-amber-800',
  SHIFT_OPEN: 'bg-accentSoft text-accent',
  SHIFT_CLOSE: 'bg-accentSoft text-accent',
  CASH_DRAWER_ENTRY: 'bg-amber-100 text-amber-800',
  CASH_DRAWER_OPEN: 'bg-amber-100 text-amber-800',
  CASH_DRAWER_CLOSE: 'bg-amber-100 text-amber-800',
  STOCK_TRANSFER_REQUEST: 'bg-accentSoft text-accent',
  STOCK_TRANSFER_APPROVE: 'bg-emerald-100 text-emerald-800',
};

export const dynamic = 'force-dynamic';

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

export default async function AuditLogPage({
  searchParams
}: {
  searchParams: { action?: string; user?: string; page?: string; pageSize?: string };
}) {
  const { user, business } = await requireBusiness(['OWNER']);
  const features = getFeatures((business as any).plan ?? (business.mode as any), (business as any).storeMode as any);
  if (!features.auditLog) {
    return (
      <AdvancedModeNotice
        title="Audit Log is available on Pro"
        description="Deep audit history and operator traceability are unlocked on businesses provisioned for Pro."
        featureName="Audit Log"
        minimumPlan="PRO"
      />
    );
  }

  const requestedPageSize = parseInt(searchParams.pageSize || '20', 10) || 20;
  const pageSize = PAGE_SIZE_OPTIONS.includes(requestedPageSize as 10 | 20 | 50) ? requestedPageSize : 20;
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

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function parseDetails(raw: unknown): Record<string, unknown> | null {
    if (!raw) return null;
    if (typeof raw === 'object') return raw as Record<string, unknown>;
    try { return JSON.parse(String(raw)); } catch { return null; }
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader title="Audit Log" subtitle={`${total.toLocaleString()} entries`} />

      {/* Filters */}
      <form method="GET" className="card grid gap-3 p-3.5 sm:grid-cols-2 sm:p-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] xl:items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Action</label>
          <select name="action" defaultValue={searchParams.action || ''} className="w-full rounded border px-3 py-2 text-sm">
            <option value="">All Actions</option>
            {Object.entries(ACTION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">User</label>
          <select name="user" defaultValue={searchParams.user || ''} className="w-full rounded border px-3 py-2 text-sm">
            <option value="">All Users</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="w-full rounded bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 xl:w-auto">
          Filter
        </button>
        {(searchParams.action || searchParams.user) && (
          <a href="/reports/audit-log" className="inline-flex items-center text-sm text-gray-500 underline xl:ml-2 xl:self-center">
            Clear
          </a>
        )}
      </form>

      {/* Table */}
      <div className="responsive-table-shell">
        <table className="min-w-[64rem] text-sm">
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

      {total > 0 ? (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          basePath="/reports/audit-log"
          pageSize={pageSize}
          pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
          searchParams={{
            action: searchParams.action,
            user: searchParams.user,
          }}
        />
      ) : null}
    </div>
  );
}
