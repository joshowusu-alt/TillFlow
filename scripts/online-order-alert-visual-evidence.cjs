/* Real master/candidate layouts using a disposable CI database and simulated alert responses. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { mkdirSync, writeFileSync } = require('node:fs');
const bcrypt = require('bcryptjs');
const { chromium } = require('playwright');
const { openGuardedPrismaClient } = require('./lib/guarded-prisma.cjs');
const { login } = require('./report-owner-simplification-evidence.cjs');

const folder = 'tmp/online-order-alert-visual';
const widths = [[393,852],[768,1024],[1024,768],[1280,800],[1440,900]];

async function seed() {
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.match(process.env.DATABASE_URL || '', /^file:.*\/ci-online-order-alert-visual\.db$/);
  const { prisma } = await openGuardedPrismaClient();
  try {
    const fixtures = {};
    for (const enabled of [true,false]) {
      const email = `order-alert-${randomUUID()}@example.invalid`, password = randomUUID();
      const business = await prisma.business.create({data:{
        name: enabled ? 'Synthetic active online store' : 'Synthetic retail only',
        currency:'GHS',timezone:'Africa/Accra',plan:'PRO',selectedPlan:'PRO',planStatus:'ACTIVE',
        subscriptionStatus:'PAID_ACTIVE',firstPaymentAt:new Date('2026-01-01'),currentPeriodEndsAt:new Date('2030-01-01'),
        onboardingCompletedAt:new Date(),guidedSetup:false,storefrontEnabled:enabled,
        ...(enabled ? {storefrontSlug:`qa-${randomUUID()}`} : {}),
      }});
      const businessId = business.id;
      const store = await prisma.store.create({data:{businessId,name:'Synthetic main branch',isMainStore:true}});
      await prisma.user.create({data:{businessId,name:'Synthetic Owner',email,passwordHash:await bcrypt.hash(password,10),role:'OWNER'}});
      const organization = await prisma.organization.create({data:{businessId,name:'Synthetic business'}});
      await prisma.branch.create({data:{businessId,organizationId:organization.id,storeId:store.id,name:store.name,code:'QA'}});
      fixtures[enabled ? 'active' : 'inactive'] = {email,password};
    }
    return fixtures;
  } finally { await prisma.$disconnect(); }
}

async function main() {
  const fixtures = await seed();
  mkdirSync(folder,{recursive:true});
  const browser = await chromium.launch();
  const results = [];
  async function session(port, fixture, viewport, action) {
    const base = `http://127.0.0.1:${port}`;
    const context = await browser.newContext({viewport,serviceWorkers:'block'});
    let fail = false, requests = 0;
    await context.route('**/*', route => {
      const url = route.request().url();
      if (url === base+'/api/online-orders/attention') {
        requests++;
        return route.fulfill({status:fail?503:200,contentType:'application/json',body:JSON.stringify(fail?{}:{eligible:true,count:0,orders:[]})});
      }
      return url.startsWith(base+'/') || url.startsWith('data:') ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    try {
      await page.clock.install();
      await login(page,base,fixture);
      await page.goto(base+'/reports/business-movement');
      await page.getByRole('heading',{name:'Business movement',exact:true}).waitFor();
      await page.waitForLoadState('networkidle');
      const refresh = async () => {
        await Promise.all([
          page.waitForResponse(response=>response.url()===base+'/api/online-orders/attention'),
          page.evaluate(()=>window.dispatchEvent(new Event('focus'))),
        ]);
      };
      const tick = async () => {
        await Promise.all([
          page.waitForResponse(response=>response.url()===base+'/api/online-orders/attention'),
          page.clock.fastForward(15000),
        ]);
      };
      await action({page,requests:()=>requests,setFail:value=>{fail=value;},refresh,tick});
    } finally { await context.close(); }
  }
  try {
    for (const [width,height] of widths) {
      const viewport = {width,height};
      await session(6201,fixtures.active,viewport,async({page,setFail,refresh})=>{
        setFail(true); await refresh();
        const banner = page.getByRole('region',{name:'Online orders needing attention'});
        await banner.getByText('Online order alerts unavailable',{exact:true}).waitFor();
        await page.screenshot({path:`${folder}/before-${width}.png`,animations:'disabled'});
        results.push({width,side:'before',height:(await banner.boundingBox()).height,position:await banner.evaluate(e=>getComputedStyle(e).position)});
      });
      await session(6200,fixtures.active,viewport,async({page,setFail,refresh,tick})=>{
        const banner = page.locator('[data-online-order-notice="paused"]');
        setFail(true); await refresh();
        assert.equal(await banner.count(),0,'first failure must not flash');
        await tick();
        assert.equal(await banner.count(),0,'brief failure must not flash');
        await tick();
        await banner.waitFor();
        const geometry = await banner.evaluate(el=>{
          const box=el.getBoundingClientRect(), main=document.querySelector('main#main-content').getBoundingClientRect();
          return {height:box.height,position:getComputedStyle(el).position,bottom:box.bottom,mainTop:main.top,overflow:document.documentElement.scrollWidth>innerWidth};
        });
        assert.ok(geometry.height<=40,JSON.stringify(geometry));
        assert.equal(geometry.position,'static');
        assert.ok(geometry.bottom<=geometry.mainTop+1 && !geometry.overflow,JSON.stringify(geometry));
        assert.equal(await banner.getByRole('link',{name:/Order alerts paused.*Open orders/}).count(),1);
        assert.equal(await banner.getByRole('button',{name:'Enable sound'}).isVisible(),width>=1024);
        await page.screenshot({path:`${folder}/after-${width}.png`,animations:'disabled'});
        await page.evaluate(()=>window.scrollTo(0,Math.min(350,document.documentElement.scrollHeight-innerHeight)));
        const afterScroll = await banner.evaluate(el=>({top:el.getBoundingClientRect().top,scroll:scrollY}));
        assert.ok(afterScroll.scroll>0 && afterScroll.top<0,JSON.stringify(afterScroll));
        await page.screenshot({path:`${folder}/after-scrolled-${width}.png`,animations:'disabled'});
        setFail(false); await refresh();
        await banner.waitFor({state:'detached'});
        setFail(true); await refresh(); await tick(); await tick();
        await banner.waitFor();
        await banner.getByRole('button',{name:'Dismiss order alerts for this session'}).click();
        await banner.waitFor({state:'detached'});
        await page.reload(); await page.getByRole('heading',{name:'Business movement',exact:true}).waitFor();
        await tick(); await tick();
        assert.equal(await banner.count(),0,'dismissal must survive reload');
        results.push({width,side:'after',...geometry,scrolled:afterScroll.scroll});
        console.log(`PASS ${width}: 40px max, normal flow, brief failure ignored, sustained failure displayed, recovery and session dismissal`);
      });
    }
    await session(6200,fixtures.inactive,{width:393,height:852},async({page,requests,setFail})=>{
      setFail(true);
      await page.clock.fastForward(60000);
      await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
      assert.equal(requests(),0,'retail-only business must never poll');
      assert.equal(await page.locator('[data-online-order-notice]').count(),0);
      await page.screenshot({path:`${folder}/inactive-393.png`,animations:'disabled'});
      console.log('PASS inactive Pro business: zero requests, no notice');
    });
    writeFileSync(`${folder}/results.json`,JSON.stringify(results,null,2));
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
