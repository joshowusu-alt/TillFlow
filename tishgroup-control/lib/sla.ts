import type { ManagedBusiness } from '@/lib/control-data';

export type SlaFlag = {
  label: string;
  tone: 'amber' | 'red';
  reason: 'UNREVIEWED_AGEING' | 'NO_CONTACT';
};

const UNREVIEWED_AMBER_DAYS = 7;
const UNREVIEWED_RED_DAYS = 14;
const NO_CONTACT_AMBER_DAYS = 14;
const NO_CONTACT_RED_DAYS = 30;
const RISKY_STATES = new Set(['DUE_SOON', 'GRACE', 'STARTER_FALLBACK', 'READ_ONLY']);

function daysBetween(now: Date, value: string | null | undefined) {
  if (!value) return null;
  const target = new Date(value.length >= 10 ? value.slice(0, 10) : value);
  if (Number.isNaN(target.getTime())) return null;
  const diff = Math.floor((now.getTime() - target.getTime()) / 86_400_000);
  return diff < 0 ? 0 : diff;
}

/**
 * Returns the SLA flags the operator should see on a business row. Each
 * flag is short and tone-coded so it composes well as a chip stack.
 *
 * Empty array means the account is on time. We bias toward fewer flags —
 * one strong amber/red is more useful than five mild ones.
 */
export function getSlaFlags(business: ManagedBusiness, now: Date = new Date()): SlaFlag[] {
  const flags: SlaFlag[] = [];

  if (business.needsReview) {
    const days = daysBetween(now, business.signedUpAt);
    if (days !== null) {
      if (days >= UNREVIEWED_RED_DAYS) {
        flags.push({ label: `Unreviewed ${days}d`, tone: 'red', reason: 'UNREVIEWED_AGEING' });
      } else if (days >= UNREVIEWED_AMBER_DAYS) {
        flags.push({ label: `Unreviewed ${days}d`, tone: 'amber', reason: 'UNREVIEWED_AGEING' });
      }
    }
  }

  if (RISKY_STATES.has(business.state)) {
    const days = daysBetween(now, business.lastActivityAt);
    if (days !== null) {
      if (days >= NO_CONTACT_RED_DAYS) {
        flags.push({ label: `Silent ${days}d`, tone: 'red', reason: 'NO_CONTACT' });
      } else if (days >= NO_CONTACT_AMBER_DAYS) {
        flags.push({ label: `Silent ${days}d`, tone: 'amber', reason: 'NO_CONTACT' });
      }
    }
  }

  return flags;
}

export function getPortfolioSlaCounts(businesses: ManagedBusiness[], now: Date = new Date()) {
  let amber = 0;
  let red = 0;
  for (const business of businesses) {
    for (const flag of getSlaFlags(business, now)) {
      if (flag.tone === 'red') red += 1;
      else amber += 1;
    }
  }
  return { amber, red, total: amber + red };
}
