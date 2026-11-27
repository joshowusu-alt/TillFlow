/** Display-only names; filters continue using the original account names. */
export function ownerAccountLabel(label: string) {
  if (label==='Operating Expenses') return 'Running costs';
  if (label==='Inventory Loss & Shrinkage') return 'Stock lost or written off';
  if (label==='Inventory Gain & Surplus') return 'Stock found in counts';
  return label;
}

export function humanJournalDescription(description: string) {
  const human=description.replace(/\b(?:c[a-z0-9]{20,}|[0-9a-f]{24,}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\b/gi,'').trim();
  return human.replace(/\s{2,}/g,' ');
}
