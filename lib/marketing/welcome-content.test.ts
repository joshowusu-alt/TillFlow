import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  BUSINESS_STORIES,
  CONTROL_POINTS,
  CONTROL_LANGUAGE,
  EARLY_NAMED_PROOF,
  MICRO_PRIMES,
  OWNER_MOMENTS,
  PRODUCT_PROOF_PANELS,
  WELCOME_CATEGORY_LINE,
  WELCOME_HEADLINE,
  WELCOME_SUBHEADLINE,
} from './welcome-content';

const readSource = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('welcome marketing content', () => {
  it('positions TillFlow as business control, not POS-first', () => {
    expect(WELCOME_CATEGORY_LINE.toLowerCase()).toContain('see what is happening');
    expect(WELCOME_CATEGORY_LINE.toLowerCase()).not.toContain('complete control');
    expect(WELCOME_HEADLINE.toLowerCase()).toContain('control');
    expect(WELCOME_HEADLINE.toLowerCase()).toContain('business');
    expect(WELCOME_HEADLINE.toLowerCase()).not.toContain('shop');
    expect(WELCOME_HEADLINE.toLowerCase()).not.toContain('sell fast');
  });

  it('opens the hero with recognition before product explanation', () => {
    expect(WELCOME_SUBHEADLINE.toLowerCase()).toContain("today's money");
    expect(WELCOME_SUBHEADLINE.toLowerCase()).toContain('till');
    expect(WELCOME_SUBHEADLINE.toLowerCase()).not.toMatch(/\bpos\b/);
    expect(WELCOME_SUBHEADLINE.toLowerCase()).not.toContain('inventory');
  });

  it('anchors control language on know before you count', () => {
    expect(CONTROL_LANGUAGE.knowBeforeYouCount).toBe('Know before you count.');
    expect(PRODUCT_PROOF_PANELS[2].title).toBe('Know before you count.');
    expect(CONTROL_POINTS.every((point) => !/\bknow\b/i.test(point))).toBe(true);
    expect(PRODUCT_PROOF_PANELS[3].title).toBe('See where your profit is coming from.');
  });

  it('uses four product proof panels with matching visuals and outcome titles', () => {
    expect(PRODUCT_PROOF_PANELS).toHaveLength(4);
    expect(PRODUCT_PROOF_PANELS[0].visual).toBe('pos');
    expect(PRODUCT_PROOF_PANELS[1].visual).toBe('stock-suppliers');
    expect(PRODUCT_PROOF_PANELS[2].visual).toBe('shift-close');
    expect(PRODUCT_PROOF_PANELS[3].visual).toBe('reports-analytics');
    expect(PRODUCT_PROOF_PANELS[0].title).toBe('Every sale starts correctly.');
    expect(PRODUCT_PROOF_PANELS[1].title).toBe('Never lose track of stock.');
    expect(PRODUCT_PROOF_PANELS[2].title).toBe('Know before you count.');
    expect(PRODUCT_PROOF_PANELS[3].title).toBe('See where your profit is coming from.');
  });

  it('does not use customers page screenshot for stock panel', () => {
    const serialized = JSON.stringify(PRODUCT_PROOF_PANELS);
    expect(serialized).not.toContain('people-relationships.png');
    expect(serialized).not.toContain('Customers & suppliers');
  });

  it('keeps recognition compressed to four owner moments and sparse micro-primes', () => {
    expect(OWNER_MOMENTS).toHaveLength(4);
    expect(OWNER_MOMENTS).toContain('The network drops.');
    expect(OWNER_MOMENTS).toContain('Closing time comes.');
    expect(Object.keys(MICRO_PRIMES)).toHaveLength(3);
  });

  it('includes early named EL-SHADDAI proof without inventing claims', () => {
    expect(EARLY_NAMED_PROOF.eyebrow).toContain('EL-SHADDAI Supermarket');
    expect(EARLY_NAMED_PROOF.line).toContain('1,000+ products');
    expect(EARLY_NAMED_PROOF.hook.toLowerCase()).toContain('cash expected');
    expect(EARLY_NAMED_PROOF.hook.toLowerCase()).toContain('network');
  });

  it('includes EL-SHADDAI, FENIBED and ASEDA business stories with transformation hooks', () => {
    expect(BUSINESS_STORIES).toHaveLength(3);
    expect(BUSINESS_STORIES.map((s) => s.business)).toEqual([
      'EL-SHADDAI Supermarket',
      'FENIBED Enterprise',
      'ASEDA Enterprise',
    ]);
    expect(BUSINESS_STORIES[0].person).toBe('Akosua Otchere');
    for (const story of BUSINESS_STORIES) {
      expect(story.hook.length).toBeGreaterThan(20);
      expect(story.before.length).toBeGreaterThan(20);
      expect(story.problem.length).toBeGreaterThan(20);
      expect(story.turningPoint.length).toBeGreaterThan(20);
      expect(story.lifeNow.length).toBeGreaterThan(20);
    }
    expect(BUSINESS_STORIES[2].problem).toContain('GH₵2,000');
    expect(BUSINESS_STORIES[2].problem).toContain('GH₵3,000');
  });
});

describe('welcome homepage structure', () => {
  it('renders business stories with before/problem/turning point/life now and leads with hook', () => {
    const trust = readSource('components/marketing/TrustProofSection.tsx');
    expect(trust).toContain('BUSINESS_STORIES');
    expect(trust).toContain('story.hook');
    expect(trust).toContain('Business transformations');
    expect(trust).toContain('aria-pressed={index === activeIndex}');
    expect(trust).toContain('Before');
    expect(trust).toContain('Problem');
    expect(trust).toContain('Turning point');
    expect(trust).toContain('Life now');
    expect(trust).not.toContain('Name withheld at their request');
    expect(trust).not.toContain('Testimonials');
  });

  it('uses contain-fit screenshots and coded stock/purchase visuals', () => {
    const proof = readSource('components/marketing/ProductProofSection.tsx');
    expect(proof).toContain('StockSuppliersPreview');
    expect(proof).toContain('PosCheckoutPreview');
    expect(proof).toContain('ReportsAnalyticsPreview');
  });

  it('follows compressed journey with early proof and one mid-funnel CTA after product proof', () => {
    const page = readSource('app/welcome/page.tsx');
    const earlyIdx = page.indexOf('<EarlyNamedProof');
    const hopeIdx = page.indexOf('<HopeStrip');
    const momentsIdx = page.indexOf('<OwnerMomentsStrip');
    const controlIdx = page.indexOf('<ControlSection');
    const proofIdx = page.indexOf('<ProductProofSection');
    const midIdx = page.indexOf('<MidFunnelBridge');
    const storiesIdx = page.indexOf('<TrustProofSection');
    const pricingIdx = page.indexOf('id="pricing"');
    expect(earlyIdx).toBeGreaterThan(-1);
    expect(hopeIdx).toBeGreaterThan(earlyIdx);
    expect(momentsIdx).toBeGreaterThan(hopeIdx);
    expect(controlIdx).toBeGreaterThan(momentsIdx);
    expect(proofIdx).toBeGreaterThan(controlIdx);
    expect(midIdx).toBeGreaterThan(proofIdx);
    expect(storiesIdx).toBeGreaterThan(midIdx);
    expect(pricingIdx).toBeGreaterThan(storiesIdx);
    expect(page).toContain('assertTillflowWhatsAppConfiguredForProduction');
    expect(page).toContain('PricingPrimaryCTA');
    expect(page).toContain('WELCOME_HEADLINE');
    expect(page).toContain('WELCOME_ANCHOR');
  });

  it('keeps public marketing demo naming neutral', () => {
    const metrics = readSource('lib/marketing/demo-metrics.ts');
    const commandCentre = readSource('components/marketing/visuals/CommandCentrePreview.tsx');
    const hero = readSource('components/marketing/visuals/HeroProductComposition.tsx');
    expect(metrics).toContain('TillFlow Demo Business');
    expect(metrics).not.toContain('Adom Retail Demo');
    expect(commandCentre).not.toContain('{DEMO_BUSINESS.name}');
    expect(commandCentre).toContain('TillFlow demo · example data');
    expect(hero).toContain('TillFlow demo · example data');
  });
});
