import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canMutateSupport, type ControlStaffRole } from '@/lib/control-auth';
import {
  SupportPermissionError,
  addSupportIssueNoteMutation,
  createSupportIssueMutation,
  updateSupportIssueMutation,
  type SupportDb,
  type SupportTx,
} from '@/lib/support-mutations';

const staff = { id: 'staff-admin', email: 'admin@example.test', role: 'CONTROL_ADMIN' };

type HarnessOptions = { failOn?: 'audit' | 'issue' | 'note' };

function createHarness(options: HarnessOptions = {}) {
  let issues = new Map<string, Record<string, unknown>>();
  let notes: Array<Record<string, unknown>> = [];
  let audits: Array<Record<string, unknown>> = [];
  let profiles = new Map<string, { businessId: string; openSupportIssueCount: number; supportStatus: string }>();
  const businesses = new Map([
    ['biz-1', { name: 'Trial Shop', phone: '0240000000', users: [{ name: 'Owner', email: 'owner@example.test' }] }],
  ]);
  let issueSeq = 0;
  let auditSeq = 0;
  let controlNoteCreates = 0;
  let billingNoteWrites = 0;

  function snapshot() {
    return {
      issues: new Map([...issues.entries()].map(([key, value]) => [key, { ...value }])),
      notes: notes.map((note) => ({ ...note })),
      audits: audits.map((audit) => ({ ...audit })),
      profiles: new Map([...profiles.entries()].map(([key, value]) => [key, { ...value }])),
    };
  }

  function restore(s: ReturnType<typeof snapshot>) {
    issues = s.issues;
    notes = s.notes;
    audits = s.audits;
    profiles = s.profiles;
  }

  const tx: SupportTx = {
    controlSupportIssue: {
      create: async ({ data }) => {
        if (options.failOn === 'issue') throw new Error('forced support mutation failure');
        issueSeq += 1;
        const row = { id: `issue-${issueSeq}`, ...data };
        issues.set(row.id as string, row);
        return { id: row.id as string, businessId: String(data.businessId), title: String(data.title) };
      },
      update: async ({ where, data }) => {
        const existing = issues.get(where.id);
        if (!existing) return { id: where.id, businessId: 'biz-1', title: 'missing' };
        const next = { ...existing, ...data };
        issues.set(where.id, next);
        return { id: where.id, businessId: String(next.businessId), title: String(next.title) };
      },
      findUnique: async ({ where }) => issues.get(where.id) ?? null,
      findMany: async ({ where }) => {
        return [...issues.values()]
          .filter((issue) => issue.businessId === where.businessId)
          .filter((issue) => Array.isArray(where.status.in) ? where.status.in.includes(String(issue.status)) : true)
          .map((issue) => ({
            priority: String(issue.priority),
            lastUpdatedAt: (issue.lastUpdatedAt as Date) ?? new Date(),
            createdAt: (issue.createdAt as Date) ?? new Date(),
          }));
      },
    },
    controlSupportIssueNote: {
      create: async ({ data }) => {
        if (options.failOn === 'note') throw new Error('forced support mutation failure');
        notes.push(data);
        return { id: `note-${notes.length}` };
      },
    },
    controlAuditLog: {
      create: async ({ data }) => {
        if (options.failOn === 'audit') throw new Error('forced audit failure');
        if (data.idempotencyKey && audits.some((row) => row.idempotencyKey === data.idempotencyKey)) {
          const err = new Error('Unique constraint failed');
          (err as { code?: string }).code = 'P2002';
          throw err;
        }
        auditSeq += 1;
        const row = { id: `audit-${auditSeq}`, ...data };
        audits.push(row);
        return { id: row.id as string };
      },
      findUnique: async ({ where }) => {
        const row = audits.find((entry) => entry.idempotencyKey === where.idempotencyKey);
        if (!row) return null;
        return { id: String(row.id), metadata: typeof row.metadata === 'string' ? row.metadata : JSON.stringify(row.metadata ?? null) };
      },
    },
    controlBusinessProfile: {
      findUnique: async ({ where }) => profiles.get(where.businessId) ?? null,
      upsert: async ({ where, create, update }) => {
        const existing = profiles.get(where.businessId);
        if (!existing) {
          profiles.set(where.businessId, create);
          return create;
        }
        const next = { ...existing, ...update };
        profiles.set(where.businessId, next);
        return next;
      },
    },
    business: {
      findUnique: async ({ where }) => businesses.get(where.id) ?? null,
    },
  };

  const db: SupportDb = {
    $transaction: async (fn) => {
      const s = snapshot();
      try {
        return await fn(tx);
      } catch (error) {
        restore(s);
        throw error;
      }
    },
  };

  return {
    db,
    get issues() { return issues; },
    get notes() { return notes; },
    get audits() { return audits; },
    get profiles() { return profiles; },
    get controlNoteCreates() { return controlNoteCreates; },
    get billingNoteWrites() { return billingNoteWrites; },
    seedProfile(businessId: string, supportStatus: string) {
      profiles.set(businessId, { businessId, openSupportIssueCount: 0, supportStatus });
    },
  };
}

describe('support permission matrix', () => {
  const roles: ControlStaffRole[] = ['CONTROL_ADMIN', 'ACCOUNT_MANAGER', 'COLLECTIONS_AGENT', 'SUPPORT_AGENT'];

  it('allows CONTROL_ADMIN, ACCOUNT_MANAGER, and SUPPORT_AGENT', () => {
    expect(canMutateSupport('CONTROL_ADMIN')).toBe(true);
    expect(canMutateSupport('ACCOUNT_MANAGER')).toBe(true);
    expect(canMutateSupport('SUPPORT_AGENT')).toBe(true);
  });

  it('denies COLLECTIONS_AGENT even though that role can write collections notes', () => {
    expect(canMutateSupport('COLLECTIONS_AGENT')).toBe(false);
  });

  it.each(roles)('direct mutation helper does not bypass the matrix for %s', async (role) => {
    const harness = createHarness();
    const run = () => createSupportIssueMutation(harness.db, {
      staff: { ...staff, role },
      staffRole: role,
      businessId: 'biz-1',
      title: 'POS freeze',
      issueType: 'POS_ISSUE',
      priority: 'HIGH',
      description: 'secret internal note',
      source: 'CONTROL',
      relatedRoute: null,
      nextAction: null,
      assignedStaffId: null,
      assignedAgentName: null,
      ownerName: null,
      ownerPhone: null,
      idempotencyKey: `key-${role}`,
    });

    if (canMutateSupport(role)) {
      await expect(run()).resolves.toMatchObject({ outcome: 'applied' });
    } else {
      await expect(run()).rejects.toBeInstanceOf(SupportPermissionError);
      expect(harness.issues.size).toBe(0);
      expect(harness.audits).toHaveLength(0);
    }
  });
});

describe('support mutation atomic audit', () => {
  it('writes the issue and audit together', async () => {
    const harness = createHarness();
    const result = await createSupportIssueMutation(harness.db, {
      staff,
      staffRole: 'CONTROL_ADMIN',
      businessId: 'biz-1',
      title: 'Login help',
      issueType: 'LOGIN',
      priority: 'NORMAL',
      description: 'internal only',
      source: 'CONTROL',
      relatedRoute: null,
      nextAction: null,
      assignedStaffId: null,
      assignedAgentName: null,
      ownerName: null,
      ownerPhone: null,
      idempotencyKey: 'create-1',
    });

    expect(result.outcome).toBe('applied');
    expect(harness.issues.size).toBe(1);
    expect(harness.audits).toHaveLength(1);
    expect(JSON.stringify(harness.audits[0])).not.toMatch(/internal only/);
    expect(harness.audits[0].metadata).not.toContain('owner@example.test');
    expect(harness.controlNoteCreates).toBe(0);
    expect(harness.billingNoteWrites).toBe(0);
  });

  it('rolls back the support mutation when audit fails', async () => {
    const harness = createHarness({ failOn: 'audit' });
    await expect(createSupportIssueMutation(harness.db, {
      staff,
      staffRole: 'ACCOUNT_MANAGER',
      businessId: 'biz-1',
      title: 'Stock issue',
      issueType: 'STOCK_ISSUE',
      priority: 'HIGH',
      description: null,
      source: 'CONTROL',
      relatedRoute: null,
      nextAction: null,
      assignedStaffId: null,
      assignedAgentName: null,
      ownerName: null,
      ownerPhone: null,
      idempotencyKey: 'create-audit-fail',
    })).rejects.toThrow('forced audit failure');

    expect(harness.issues.size).toBe(0);
    expect(harness.audits).toHaveLength(0);
  });

  it('creates no audit row when the support mutation fails', async () => {
    const harness = createHarness({ failOn: 'issue' });
    await expect(createSupportIssueMutation(harness.db, {
      staff,
      staffRole: 'SUPPORT_AGENT',
      businessId: 'biz-1',
      title: 'Report issue',
      issueType: 'REPORT_ISSUE',
      priority: 'LOW',
      description: null,
      source: 'CONTROL',
      relatedRoute: null,
      nextAction: null,
      assignedStaffId: null,
      assignedAgentName: null,
      ownerName: null,
      ownerPhone: null,
      idempotencyKey: 'create-issue-fail',
    })).rejects.toThrow('forced support mutation failure');

    expect(harness.issues.size).toBe(0);
    expect(harness.audits).toHaveLength(0);
  });

  it('does not duplicate the business effect on retry', async () => {
    const harness = createHarness();
    const payload = {
      staff,
      staffRole: 'CONTROL_ADMIN' as const,
      businessId: 'biz-1',
      title: 'Duplicate click',
      issueType: 'OTHER' as const,
      priority: 'NORMAL',
      description: null,
      source: 'CONTROL',
      relatedRoute: null,
      nextAction: null,
      assignedStaffId: null,
      assignedAgentName: null,
      ownerName: null,
      ownerPhone: null,
      idempotencyKey: 'same-key',
    };

    const first = await createSupportIssueMutation(harness.db, payload);
    const second = await createSupportIssueMutation(harness.db, payload);
    expect(first.outcome).toBe('applied');
    expect(second.outcome).toBe('idempotent');
    expect(second.issueId).toBe(first.issueId);
    expect(harness.issues.size).toBe(1);
    expect(harness.audits).toHaveLength(1);
  });

  it('does not overwrite UNREVIEWED during sync', async () => {
    const harness = createHarness();
    harness.seedProfile('biz-1', 'UNREVIEWED');
    await createSupportIssueMutation(harness.db, {
      staff,
      staffRole: 'SUPPORT_AGENT',
      businessId: 'biz-1',
      title: 'Keep unreviewed',
      issueType: 'BUG',
      priority: 'CRITICAL',
      description: null,
      source: 'CONTROL',
      relatedRoute: null,
      nextAction: null,
      assignedStaffId: null,
      assignedAgentName: null,
      ownerName: null,
      ownerPhone: null,
      idempotencyKey: 'unreviewed-1',
    });
    expect(harness.profiles.get('biz-1')?.supportStatus).toBe('UNREVIEWED');
    expect(harness.profiles.get('biz-1')?.openSupportIssueCount).toBe(1);
  });

  it('keeps support notes out of audit metadata and billing notes', async () => {
    const harness = createHarness();
    const created = await createSupportIssueMutation(harness.db, {
      staff,
      staffRole: 'ACCOUNT_MANAGER',
      businessId: 'biz-1',
      title: 'Need help',
      issueType: 'TRAINING_NEEDED',
      priority: 'NORMAL',
      description: null,
      source: 'CONTROL',
      relatedRoute: null,
      nextAction: null,
      assignedStaffId: null,
      assignedAgentName: null,
      ownerName: null,
      ownerPhone: null,
      idempotencyKey: 'note-parent',
    });

    await addSupportIssueNoteMutation(harness.db, {
      staff,
      staffRole: 'ACCOUNT_MANAGER',
      issueId: created.issueId,
      note: 'Do not copy this into merchant billing',
      idempotencyKey: 'note-1',
    });

    expect(harness.notes).toHaveLength(1);
    expect(JSON.stringify(harness.audits)).not.toContain('Do not copy this into merchant billing');
    expect(harness.controlNoteCreates).toBe(0);
    expect(harness.billingNoteWrites).toBe(0);
  });

  it('rolls back a note when audit fails', async () => {
    const harness = createHarness();
    const created = await createSupportIssueMutation(harness.db, {
      staff,
      staffRole: 'CONTROL_ADMIN',
      businessId: 'biz-1',
      title: 'Note rollback',
      issueType: 'OTHER',
      priority: 'NORMAL',
      description: null,
      source: 'CONTROL',
      relatedRoute: null,
      nextAction: null,
      assignedStaffId: null,
      assignedAgentName: null,
      ownerName: null,
      ownerPhone: null,
      idempotencyKey: 'note-parent-2',
    });

    const failing = createHarness({ failOn: 'audit' });
    failing.issues.set(created.issueId, { id: created.issueId, businessId: 'biz-1', title: 'Note rollback' });
    await expect(addSupportIssueNoteMutation(failing.db, {
      staff,
      staffRole: 'CONTROL_ADMIN',
      issueId: created.issueId,
      note: 'will rollback',
      idempotencyKey: 'note-fail',
    })).rejects.toThrow('forced audit failure');
    expect(failing.notes).toHaveLength(0);
    expect(failing.audits).toHaveLength(0);
  });

  it('updates status and assignment atomically', async () => {
    const harness = createHarness();
    const created = await createSupportIssueMutation(harness.db, {
      staff,
      staffRole: 'SUPPORT_AGENT',
      businessId: 'biz-1',
      title: 'Assign me',
      issueType: 'OTHER',
      priority: 'NORMAL',
      description: null,
      source: 'CONTROL',
      relatedRoute: null,
      nextAction: null,
      assignedStaffId: null,
      assignedAgentName: null,
      ownerName: null,
      ownerPhone: null,
      idempotencyKey: 'update-parent',
    });

    await updateSupportIssueMutation(harness.db, {
      staff,
      staffRole: 'SUPPORT_AGENT',
      issueId: created.issueId,
      status: 'IN_PROGRESS',
      assignedAgentName: 'Ada',
      idempotencyKey: 'update-1',
    });

    expect(harness.issues.get(created.issueId)?.status).toBe('IN_PROGRESS');
    expect(harness.audits).toHaveLength(2);
  });
});

describe('support source contracts', () => {
  it('requires transactional audit and explicit support permission in the server action', () => {
    const src = readFileSync(join(process.cwd(), 'app/actions/control-support.ts'), 'utf8');
    expect(src).toContain('canMutateSupport');
    expect(src).toContain('createSupportIssueMutation');
    expect(src).not.toMatch(/await recordAudit\(/);
    expect(src).not.toContain('billingNotes');
    expect(src).not.toContain('controlNote.create');
  });
});
