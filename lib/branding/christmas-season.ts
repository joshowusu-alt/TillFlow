const accraDate = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Accra',
  month: 'numeric',
  day: 'numeric',
});

export function isChristmasSeason(now: Date): boolean {
  const parts = accraDate.formatToParts(now);
  const month = Number(parts.find(part => part.type === 'month')?.value);
  const day = Number(parts.find(part => part.type === 'day')?.value);
  return month === 12 || (month === 1 && day <= 6);
}
