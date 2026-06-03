import { OPEN_SUPPORT_STATUSES, type SupportIssueRow } from './types';

export function filterSupportIssues(
  issues: SupportIssueRow[],
  options: { filter?: string; search?: string; now?: Date }
) {
  const search = options.search?.trim().toLowerCase() ?? '';
  const filter = options.filter ?? 'open';
  const now = options.now ?? new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  return issues.filter((issue) => {
    if (filter === 'open' && !OPEN_SUPPORT_STATUSES.includes(issue.status as (typeof OPEN_SUPPORT_STATUSES)[number])) {
      return false;
    }
    if (filter === 'critical' && issue.priority !== 'CRITICAL') return false;
    if (filter === 'high' && issue.priority !== 'HIGH') return false;
    if (filter === 'waiting' && issue.status !== 'WAITING_ON_CUSTOMER') return false;
    if (filter === 'resolved' && issue.status !== 'RESOLVED' && issue.status !== 'CLOSED') return false;
    if (filter === 'stale' && !issue.isStale) return false;
    if (filter === 'created_week' && new Date(issue.createdAt) < weekAgo) return false;
    if (filter !== 'all' && filter.startsWith('type:') && issue.issueType !== filter.slice(5)) return false;
    if (filter !== 'all' && filter.startsWith('agent:')) {
      const agent = filter.slice(6).toLowerCase();
      if (!(issue.assignedAgentName ?? '').toLowerCase().includes(agent)) return false;
    }

    if (!search) return true;
    return [
      issue.businessName,
      issue.ownerName,
      issue.ownerPhone,
      issue.title,
      issue.description ?? '',
    ].some((v) => v.toLowerCase().includes(search));
  });
}
