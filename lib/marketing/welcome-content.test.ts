import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  FEATURE_LIST,
  OUTCOME_CARDS,
  PRODUCT_PROOF_POINTS,
  ROLE_CARDS,
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

  it('uses three strong outcome cards', () => {
    expect(OUTCOME_CARDS).toHaveLength(3);
    expect(OUTCOME_CARDS.map((card) => card.title)).toEqual([
      'Sell at the counter',
      'Control stock and suppliers',
      'Close with confidence',
    ]);
  });

  it('keeps product proof and feature coverage compact', () => {
    expect(PRODUCT_PROOF_POINTS).toHaveLength(3);
    expect(FEATURE_LIST).toContain('Cash drawer and shifts');
    expect(FEATURE_LIST).toHaveLength(10);
  });

  it('uses compact role confidence copy', () => {
    expect(ROLE_CARDS).toEqual([
      { role: 'Cashier', desc: 'Sell and see own sales' },
      { role: 'Manager', desc: 'Stock, purchases and reports' },
      { role: 'Owner', desc: 'Money, staff and control' },
    ]);
  });
});

describe('welcome homepage structure', () => {
  it('prioritises WhatsApp CTA and shorter premium product proof', () => {
    const page = readSource('app/welcome/page.tsx');
    expect(page).toContain('WhatsAppDemoButton');
    expect(page).toContain('HeroProductComposition');
    expect(page).toContain('Everything between the first sale and the closing count.');
    expect(page).toContain('Built for Ghanaian retail reality.');
    expect(page).toContain('See TillFlow on your own counter.');
    expect(page).not.toContain('HOW_IT_WORKS');
    expect(page).not.toContain('FEATURE_GRID');
    expect(page).not.toContain("Today's Overview");
  });

  it('avoids self-praise and keeps honest example labelling', () => {
    const page = readSource('app/welcome/page.tsx');
    expect(page).not.toContain('Premium POS');
    expect(page).not.toContain('screenshot dump');
    expect(page).toContain('Product illustration with example data');
    expect(page).toContain('Running live in Ghanaian retail');
  });

  it('uses TillFlow brand tokens instead of off-brand greens and blacks', () => {
    const page = readSource('app/welcome/page.tsx');
    const cta = readSource('components/marketing/WelcomeCTA.tsx');
    expect(page).toContain('bg-accent');
    expect(page).toContain('bg-paper');
    expect(page).toContain('text-ink');
    expect(page).not.toMatch(/bg-emerald|text-emerald|bg-slate-950|bg-slate-900/);
    expect(cta).toContain('bg-accent');
    expect(cta).not.toContain('bg-emerald');
  });
});
