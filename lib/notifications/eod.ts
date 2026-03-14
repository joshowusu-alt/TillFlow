export const EOD_SUMMARY_JOB_NAME = 'EOD_WHATSAPP_SUMMARY';

export function shouldUseEodRunKey(triggeredBy: string | null | undefined) {
  return (triggeredBy ?? '').trim().toUpperCase() === 'CRON';
}

export function buildEodCronRunKey(businessId: string, date = new Date()) {
  const isoDate = date.toISOString().slice(0, 10);
  return `${EOD_SUMMARY_JOB_NAME}:${businessId}:${isoDate}`;
}
