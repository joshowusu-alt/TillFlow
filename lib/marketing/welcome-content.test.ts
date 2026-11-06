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

  it('publishes only confirmed customer facts and discloses complimentary access', () => {
    expect(EARLY_NAMED_PROOF.eyebrow).toContain('EL-SHADDAI Supermarket');
    expect(EARLY_NAMED_PROOF.hook).toContain('complimentary Pro');
    expect(JSON.stringify(BUSINESS_STORIES)).not.toMatch(/FENIBED|ASEDA|Akosua|1,000/);
    expect(BUSINESS_STORIES).toHaveLength(1);
  });

});

describe('welcome homepage structure', () => {
  it('discloses the customer relationship without attributed testimony', () => {
    const trust = readSource('components/marketing/TrustProofSection.tsx');
    expect(trust).toContain('complimentary Pro access');
    expect(trust).not.toMatch(/FENIBED|ASEDA|Akosua|setInterval/);
  });

  it('uses contain-fit screenshots and coded stock/purchase visuals', () => {
    const proof = readSource('components/marketing/ProductProofSection.tsx');
    expect(proof).toContain('StockSuppliersPreview');
    expect(proof).toContain('PosCheckoutPreview');
    expect(proof).toContain('ReportsAnalyticsPreview');
  });

  it('keeps one proof block and a direct hero, demo, pricing journey', () => {
    const page = readSource('app/welcome/page.tsx');
    expect(page.indexOf('<TrustProofSection')).toBeLessThan(page.indexOf('<HomepageDemo'));
    expect(page.indexOf('<HomepageDemo')).toBeLessThan(page.indexOf('id="pricing"'));
    expect(page).not.toMatch(/<EarlyNamedProof|<HopeStrip|<OwnerMomentsStrip|<ControlSection|<MidFunnelBridge|<RetailCampaignSection|<ProductProofSection/);
    expect(page).toContain('assertTillflowWhatsAppConfiguredForProduction');
    expect(page).toContain('PricingPrimaryCTA');
    expect(page).toContain('WELCOME_HEADLINE');
    expect(page).toContain('WELCOME_ANCHOR');
  });

  it('uses relaxed mobile hero typography without changing desktop sizes', () => {
    const page = readSource('app/welcome/page.tsx');
    expect(page).toContain('text-[2.2rem]');
    expect(page).toContain('leading-[1.08]');
    expect(page).toContain('sm:text-5xl');
    expect(page).toContain('lg:text-6xl');
    expect(page).not.toContain('text-[2.55rem]');
    expect(page).not.toContain('leading-[0.98]');
    expect(page).toContain('text-ink/60');
    expect(page).toMatch(/href="\/login"[\s\S]*?min-h-11/);
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
