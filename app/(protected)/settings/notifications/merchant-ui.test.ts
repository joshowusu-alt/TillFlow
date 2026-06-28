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
    expect(source).toContain('0244123456 or 233244123456');
    expect(source).toContain('Preview the message and open it in WhatsApp');
  });
});

describe('WhatsApp follow-up section clarity', () => {
  it('section title says WhatsApp, not generic "Needs follow-up"', () => {
    const source = readMerchantFile('page.tsx');
    expect(source).toContain('WhatsApp needs follow-up');
  });

  it('helper text explicitly says WhatsApp and does not imply SMS failure', () => {
    const source = readMerchantFile('page.tsx');
    expect(source).toContain('These WhatsApp summaries');
    expect(source).toContain('They are not SMS failures');
  });

  it('follow-up query targets MessageLog with channel WHATSAPP', () => {
    const source = readMerchantFile('page.tsx');
    expect(source).toContain("channel: 'WHATSAPP'");
    expect(source).toContain('messageLog.count');
    expect(source).toContain('messageLog.findMany');
  });

  it('MessageLogActions still renders for WhatsApp follow-up rows', () => {
    const source = readMerchantFile('page.tsx');
    expect(source).toContain('MessageLogActions');
    expect(source).toContain('messageLogId={message.id}');
  });
});

describe('SMS daily summary status card', () => {
  it('SMS status card heading appears in page', () => {
    const source = readMerchantFile('page.tsx');
    expect(source).toContain('SMS daily summary status');
  });

  it('SMS status card uses MessageOutbox with OWNER_DAILY_SUMMARY_EVENT_TYPE', () => {
    const source = readMerchantFile('page.tsx');
    expect(source).toContain('OWNER_DAILY_SUMMARY_EVENT_TYPE');
    expect(source).toContain('messageOutbox.findFirst');
    expect(source).toContain('getBusinessDayBounds');
  });

  it('SENT state displays sent copy', () => {
    const source = readMerchantFile('page.tsx');
    expect(source).toContain("SMS summary was sent");
  });

  it('PENDING state displays queued copy', () => {
    const source = readMerchantFile('page.tsx');
    expect(source).toContain("SMS summary is queued");
  });

  it('FAILED state displays failed copy with lastError', () => {
    const source = readMerchantFile('page.tsx');
    expect(source).toContain("SMS summary failed to send");
    expect(source).toContain('lastError');
  });

  it('no-row state displays not-created-today copy', () => {
    const source = readMerchantFile('page.tsx');
    expect(source).toContain('No SMS summary created yet today');
    expect(source).toContain('This is normal before the scheduled send time');
  });

  it('disabled state displays not-enabled copy', () => {
    const source = readMerchantFile('page.tsx');
    expect(source).toContain('Daily summary is not enabled');
  });

  it('recipient phone is masked in SMS status card', () => {
    const source = readMerchantFile('page.tsx');
    // maskOwnerPhone must be called at least twice: once in SMS card, once in delivery history
    const occurrences = (source.match(/maskOwnerPhone\(/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('no hardcoded phone numbers appear in page source', () => {
    const source = readMerchantFile('page.tsx');
    // Ghana numbers would start with 233 or 024x; no literal phone digits should be hardcoded
    expect(source).not.toMatch(/\b(233|024|025|026|027|028|029)\d{7,9}\b/);
  });

  it('page does not reference $queryRawUnsafe or raw SQL in SMS status section', () => {
    const source = readMerchantFile('page.tsx');
    expect(source).not.toContain('$queryRawUnsafe');
    expect(source).not.toContain('$queryRaw');
  });
});
