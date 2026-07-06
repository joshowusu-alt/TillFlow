import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  BUSINESS_TYPES,
  PRODUCT_PROOF,
  WELCOME_HEADLINE,
  WELCOME_SUBHEADLINE,
} from './welcome-content';

const readSource = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('welcome marketing content', () => {
  it('uses approved headline and subheadline', () => {
    expect(WELCOME_HEADLINE).toBe('Sell fast. Track stock. Know your money.');
    expect(WELCOME_SUBHEADLINE).toContain('Ghanaian retail');
    expect(WELCOME_SUBHEADLINE).toContain('MoMo');
  });

  it('lists business types including warehouses', () => {
    expect(BUSINESS_TYPES).toContain('Warehouses');
    expect(BUSINESS_TYPES.length).toBeGreaterThanOrEqual(7);
  });

  it('uses real product screenshot paths', () => {
    for (const item of PRODUCT_PROOF) {
      expect(item.image.startsWith('/marketing/')).toBe(true);
    }
  });
});

describe('welcome homepage structure', () => {
  it('prioritises WhatsApp CTA and product proof sections', () => {
    const page = readSource('app/welcome/page.tsx');
    expect(page).toContain('WhatsAppDemoButton');
    expect(page).toContain('See the counter, the stockroom and the owner view.');
    expect(page).toContain('Built for Ghanaian retail reality.');
    expect(page).toContain('Clean for cashiers. Controlled for managers. Clear for owners.');
    expect(page).not.toContain("Today's Overview");
  });
});
