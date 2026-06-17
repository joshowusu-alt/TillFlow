import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('customer profile quick actions', () => {
  it('links customer profiles to the existing record-payment flow', () => {
    const source = readFileSync(join(process.cwd(), 'app/(protected)/customers/[id]/page.tsx'), 'utf8');

    expect(source).toContain('Record payment');
    expect(source).toContain('/payments/customer-receipts?customerId=');
  });
});
