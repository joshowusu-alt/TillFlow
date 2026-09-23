const INTERNAL_CONTROL_BILLING_HEADINGS = [
  'control note added',
  'control subscription updated',
  'control payment recorded',
  'control review completed',
  'bulk tg review completed',
  'business returned to review queue',
];

const INTERNAL_OPERATOR_FACT_LABELS = [
  'added by',
  'updated by',
  'recorded by',
  'reviewed by',
  'reopened by',
];

export function isInternalControlBillingHistoryEntry(title: string | null | undefined, facts?: Array<{ label: string }>, notes?: string[]): boolean {
  const normalizedTitle = String(title ?? '').trim().toLowerCase();
  if (INTERNAL_CONTROL_BILLING_HEADINGS.some((heading) => normalizedTitle.includes(heading))) {
    return true;
  }
  const labels = (facts ?? []).map((fact) => fact.label.trim().toLowerCase());
  if (labels.some((label) => INTERNAL_OPERATOR_FACT_LABELS.includes(label))) {
    return true;
  }
  const body = (notes ?? []).join(' ').toLowerCase();
  return INTERNAL_CONTROL_BILLING_HEADINGS.some((heading) => body.includes(heading));
}

export type BillingHistoryEntry = {
  id: string;
  title: string;
  occurredAt: string | null;
  facts: Array<{ label: string; value: string }>;
  notes: string[];
};

export function parseBillingHistory(notes: string | null | undefined): BillingHistoryEntry[] {
  if (!notes?.trim()) return [];

  return notes
    .trim()
    .split(/\n\s*\n/)
    .map((chunk, index) => {
      const lines = chunk.split('\n').map((line) => line.trim()).filter(Boolean);
      const [header = '', ...rest] = lines;
      const match = header.match(/^\[(.+?)\]\s+(.*)$/);
      const facts: Array<{ label: string; value: string }> = [];
      const freeform: string[] = [];

      for (const line of rest) {
        const separatorIndex = line.indexOf(':');
        if (separatorIndex > 0) {
          facts.push({
            label: line.slice(0, separatorIndex).trim(),
            value: line.slice(separatorIndex + 1).trim(),
          });
        } else {
          freeform.push(line);
        }
      }

      return {
        id: `${match?.[1] ?? header}-${index}`,
        title: match?.[2] ?? header,
        occurredAt: match?.[1] ?? null,
        facts,
        notes: freeform,
      };
    })
    .reverse()
    .filter((entry) => !isInternalControlBillingHistoryEntry(entry.title, entry.facts, entry.notes));
}
