import type { ControlDigestData, DigestActionRow } from './types';

function formatCedi(amount: number) {
  return `GHS ${amount.toLocaleString('en-GH', { maximumFractionDigits: 0 })}`;
}

function topActions(rows: DigestActionRow[], limit = 3) {
  return rows.slice(0, limit).map((r) => `• ${r.businessName}: ${r.reason} — ${r.nextAction}`);
}

/** Build focus bullets with label-first text so counts never look like list numbers. */
function buildFocusItems(counts: ControlDigestData['counts'], weekly: ControlDigestData['weekly']) {
  const items: string[] = [];

  if (counts.trialsEndingToday > 0) {
    items.push(`Trials ending today: ${counts.trialsEndingToday}`);
  }
  const stuckBeforeSale = counts.stuckSetup + counts.trialStartedNoSale;
  if (stuckBeforeSale > 0) {
    items.push(`Stuck before first sale: ${stuckBeforeSale}`);
  }
  if (counts.openCriticalSupport > 0) {
    items.push(`Critical support open: ${counts.openCriticalSupport}`);
  }
  if (counts.expectedCollectionsThisWeek > 0) {
    items.push(`Expected collections this week: ${formatCedi(counts.expectedCollectionsThisWeek)}`);
  }
  if (items.length === 0) {
    items.push(`Healthy businesses: ${counts.healthy} · New this week: ${weekly.onboardedThisWeek}`);
  }

  return items;
}

export function formatWhatsAppDigest(data: Pick<ControlDigestData, 'dateLabel' | 'counts' | 'priorities' | 'weekly'>): string {
  const { counts, priorities, weekly, dateLabel } = data;
  const focus = buildFocusItems(counts, weekly);

  const lines = [
    `TillFlow Daily Digest — ${dateLabel}`,
    '',
    "Today's focus:",
    ...focus.map((line, index) => `${index + 1}. ${line}`),
    '',
    'Top actions:',
    ...topActions(priorities),
    '',
    'Open /command/digest for full details.',
  ];

  return lines.join('\n');
}

export function validateFocusNumbering(text: string) {
  const focusBlock = text.split("Today's focus:")[1]?.split('Top actions:')[0] ?? '';
  const numbers = [...focusBlock.matchAll(/^(\d+)\.\s/gm)].map((match) => Number(match[1]));
  for (let i = 0; i < numbers.length; i += 1) {
    if (numbers[i] !== i + 1) return false;
  }
  return numbers.length > 0;
}
