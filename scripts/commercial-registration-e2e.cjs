/** Persisted registration and first-product onboarding. Disposable loopback SQLite only. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { openGuardedPrismaClient } = require('./lib/guarded-prisma.cjs');
const base = process.env.BASE_URL || 'http://127.0.0.1:6200';
const url = new URL(base);
assert.ok(['localhost','127.0.0.1'].includes(url.hostname), 'Refusing non-loopback app');
assert.match(process.env.DATABASE_URL || '', /^file:\.\/(ci-pos-safety|release-176-isolated)\.db$/, 'Refusing non-disposable database');
let prisma;
async function main() {
  ({ prisma } = await openGuardedPrismaClient({ url: process.env.DATABASE_URL }));
  const browser = await chromium.launch({headless:true});
  try {
    const context = await browser.newContext({viewport:{width:390,height:844}});
    const p = await context.newPage();
    const email = `commercial-qa-${Date.now()}@example.invalid`;
    await p.goto(`${base}/register?plan=PRO&billing=ANNUAL`);
    await p.getByLabel('Business Name').fill('Fictional Commercial QA Shop');
    await p.getByLabel('Your Name').fill('Fictional QA Owner');
    await p.getByRole('button',{name:/Next.*Account Details/}).click();
    await p.getByLabel('Email',{exact:true}).fill(email);
    await p.getByLabel('Password',{exact:true}).fill('FictionalQA-12345');
    await p.getByRole('button',{name:/Next.*Choose Plan/}).click();
    const selected = await p.locator('button[aria-pressed=true]').allTextContents();
    assert.ok(selected.some(x=>x.startsWith('Pro')) && selected.some(x=>x.startsWith('Annual')));
    await p.getByRole('button',{name:/Next.*Currency/}).click();
    await p.getByRole('button',{name:'Create My Business'}).click();
    await p.waitForURL(/\/getting-started/, {timeout:60000});
    const owner = await prisma.user.findUniqueOrThrow({where:{email},include:{business:true}});
    assert.equal(owner.business.selectedPlan,'PRO');
    assert.equal(owner.business.billingInterval,'ANNUAL');
    assert.equal(owner.business.billingAmount,699000);
    assert.equal(owner.business.currency,'GHS');
    assert.equal(await prisma.store.count({where:{businessId:owner.businessId}}),1);
    assert.ok(await prisma.till.count({where:{store:{businessId:owner.businessId}}}));
    assert.ok(await prisma.account.count({where:{businessId:owner.businessId}}));
    await p.getByRole('link',{name:'Add Products',exact:true}).click();
    await p.locator('[data-testid="product-create-details"] > summary').click();
    await p.locator('#create-product-name').fill('Fictional QA Rice');
    await p.locator('#create-product-sellingPriceBasePence').fill('39.00');
    await p.locator('#create-product-defaultCostBasePence').fill('25.00');
    const form = p.locator('form').filter({has:p.locator('#create-product-name')});
    await form.getByRole('button',{name:/Save|Create|Add product/i}).last().click();
    await p.getByTestId('product-created-banner').waitFor({timeout:30000});
    const product = await prisma.product.findFirstOrThrow({where:{businessId:owner.businessId,name:'Fictional QA Rice'}});
    assert.equal(product.sellingPriceBasePence,3900);
    assert.equal(product.defaultCostBasePence,2500);
    await p.goto(`${base}/onboarding`);
    assert.equal((await p.locator('body').innerText()).includes('Application error'),false);
    await context.close();
    const result={registration:true,planPersisted:'PRO',intervalPersisted:'ANNUAL',billingAmountPence:699000,store:true,till:true,chartOfAccounts:true,firstProduct:true,onboarding:true,isolatedDatabase:process.env.DATABASE_URL};
    fs.mkdirSync('tmp/commercial-release',{recursive:true});
    fs.writeFileSync('tmp/commercial-release/registration.json',JSON.stringify(result,null,2));
    console.log(JSON.stringify(result));
  } finally {await browser.close();await prisma.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
