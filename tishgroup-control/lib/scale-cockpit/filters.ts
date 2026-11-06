import type { ScaleBusinessRecord } from './types';
import { matchesScaleFilter, formatBusinessType } from './labels';

export function filterScaleBusinesses(
  businesses: ScaleBusinessRecord[],
  options: { filter?: string; search?: string; agent?: string; now?: Date }
) {
  const now = options.now ?? new Date();
  const search = options.search?.trim().toLowerCase() ?? '';
  const filter = options.filter ?? 'all';
  const agent = options.agent?.trim().toLowerCase() ?? '';

  return businesses.filter((record) => {
    if (filter !== 'all' && !matchesScaleFilter(record, filter, now)) return false;
    if (agent && !record.assignedAgent.toLowerCase().includes(agent)) return false;
    if (!search) return true;
    return [
      record.businessName,
      record.ownerName,
      record.ownerPhone,
      record.location ?? '',
      record.referralSource ?? '',
      record.referredByName ?? '',
      record.referredByPhone ?? '',
      record.referralNotes ?? '',
      record.assignedAgent,
      formatBusinessType(record.businessType),
    ].some((value) => value.toLowerCase().includes(search));
  });
}

export function paginateScaleBusinesses<T>(items: T[], page: number, pageSize: number) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: safePage,
    pageSize,
    total,
    totalPages,
    startIndex: total === 0 ? 0 : start + 1,
    endIndex: Math.min(start + pageSize, total),
  };
}
