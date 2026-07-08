import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PRODUCT_PROOF_PANELS, TRUST_PROOF, TRUST_PROOF_THEMES, WELCOME_HEADLINE } from './welcome-content';

const readSource = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('welcome marketing content', () => {
  it('uses four product proof panels with matching visuals', () => {
    expect(PRODUCT_PROOF_PANELS).toHaveLength(4);
    expect(PRODUCT_PROOF_PANELS[0].visual).toBe('pos');
    expect(PRODUCT_PROOF_PANELS[1].visual).toBe('stock-suppliers');
    expect(PRODUCT_PROOF_PANELS[2].visual).toBe('shift-close');
    expect(PRODUCT_PROOF_PANELS[3].visual).toBe('reports-analytics');
  });

  it('does not use customers page screenshot for stock panel', () => {
    const serialized = JSON.stringify(PRODUCT_PROOF_PANELS);
    expect(serialized).not.toContain('people-relationships.png');
    expect(serialized).not.toContain('Customers & suppliers');
  });

  it('attributes all trust themes to Akosua Otchere at EL-SHADDAI', () => {
    expect(TRUST_PROOF.person).toBe('Akosua Otchere');
    expect(TRUST_PROOF.business).toBe('EL-SHADDAI Supermarket');
    expect(TRUST_PROOF_THEMES).toHaveLength(3);
  });
});

describe('welcome homepage structure', () => {
  it('attributes every trust quote to Akosua Otchere', () => {
    const trust = readSource('components/marketing/TrustProofSection.tsx');
    expect(trust).toContain('TRUST_PROOF.person');
    expect(trust).toContain('TRUST_PROOF.business');
    expect(trust).not.toContain('Name withheld at their request');
  });

  it('uses contain-fit screenshots and coded stock/purchase visuals', () => {
    const proof = readSource('components/marketing/ProductProofSection.tsx');
    expect(proof).toContain('StockSuppliersPreview');
    expect(proof).toContain('PosCheckoutPreview');
    expect(proof).toContain('ReportsAnalyticsPreview');
  });

  it('keeps approved headline', () => {
    expect(WELCOME_HEADLINE).toBe('Sell fast. Track stock. Know your money.');
  });
});
