import { describe, expect, it } from 'vitest';
import { filterSupportIssues } from '../filters';
import type { SupportIssueRow } from '../types';

function row(overrides: Partial<SupportIssueRow> = {}): SupportIssueRow {
  const now = new Date().toISOString();
  return {
    id: 'i1',
    businessId: 'b1',
    businessName: 'Shop A',
    ownerName: 'Ama',
    ownerPhone: '+233200000000',
    issueType: 'POS_ISSUE',
    priority: 'HIGH',
    status: 'OPEN',
    title: 'POS frozen',
    description: 'Cannot checkout',
    source: 'WHATSAPP',
    relatedRoute: '/pos',
    nextAction: 'Call owner',
    assignedAgentName: 'Kofi',
    assignedStaffId: null,
    createdAt: now,
    lastUpdatedAt: now,
    isStale: false,
    openAgeHours: 0,
    slaLabel: null,
    ...overrides,
  };
}

describe('filterSupportIssues', () => {
  const issues = [
    row({ id: 'i1', priority: 'CRITICAL', status: 'OPEN' }),
    row({ id: 'i2', businessId: 'b2', businessName: 'Shop B', priority: 'NORMAL', status: 'RESOLVED' }),
    row({ id: 'i3', status: 'WAITING_ON_CUSTOMER', priority: 'HIGH' }),
  ];

  it('filters critical open issues', () => {
    const out = filterSupportIssues(issues, { filter: 'critical' });
    expect(out.map((i) => i.id)).toEqual(['i1']);
  });

  it('searches business name and title', () => {
    const out = filterSupportIssues(issues, { filter: 'all', search: 'shop b' });
    expect(out.map((i) => i.id)).toEqual(['i2']);
  });

  it('filters waiting on customer', () => {
    const out = filterSupportIssues(issues, { filter: 'waiting' });
    expect(out.map((i) => i.id)).toEqual(['i3']);
  });
});
