import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const notificationsDir = join(process.cwd(), 'app/(protected)/settings/notifications');

const forbiddenStrings = [
  'CRON_SECRET',
  '/api/cron/eod-summary',
  'ARKESEL_WHATSAPP_TOKEN',
  'ARKESEL_WHATSAPP_TEMPLATE_ID',
  'META_WHATSAPP_ACCESS_TOKEN',
  'Delivery Diagnostics',
  'Vercel Cron',
  'Scheduler Run History',
  'WhatsApp Daily Summary',
  'manual review fallback',
  'Meta credentials',
  'Webhook delivery updates',
];

const merchantFiles = [
  'page.tsx',
  'NotificationsSettingsForm.tsx',
  'SendTestSummaryButton.tsx',
  'MessageLogActions.tsx',
];

function readMerchantFile(name: string) {
  return readFileSync(join(notificationsDir, name), 'utf8');
}

describe('merchant notifications UI leakage guard', () => {
  for (const fileName of merchantFiles) {
    it(`${fileName} does not expose developer diagnostics`, () => {
      const source = readMerchantFile(fileName);

      for (const forbidden of forbiddenStrings) {
        expect(source).not.toContain(forbidden);
      }
    });
  }

  it('page source includes Daily Owner Summary wording', () => {
    const source = readMerchantFile('page.tsx');
    expect(source).toContain('Daily Owner Summary');
    expect(source).toContain('scheduled delivery channel');
  });

  it('form source includes owner-friendly WhatsApp preview copy', () => {
    const source = readMerchantFile('NotificationsSettingsForm.tsx');
    expect(source).toContain('Daily Owner Summary');
    expect(source).toContain('Owner phone number');
    expect(source).toContain('Preview the message and open it in WhatsApp');
  });
});
