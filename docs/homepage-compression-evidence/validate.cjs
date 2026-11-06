const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const base=process.argv[2]||'http://127.0.0.1:6210';
 const browser=await chromium.launch({headless:true});
 const results=[],controls=[];
 const routes=['/welcome','/demo','/demo/dashboard','/demo/try-sale','/demo/inventory','/demo/reports','/demo/customers','/demo/store','/register?plan=PRO&billing=ANNUAL','/login'];
 for(const width of [320,360,390,768,1440]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',serviceWorkers:'block'});
  // This audit never submits a form or permits a server mutation.
  await context.route('**/*',route=>{
    const request=route.request();
    if(!['GET','HEAD','OPTIONS'].includes(request.method()))return route.abort();
    const token=process.env.VERCEL_OIDC_TOKEN;
    return route.continue({headers:{...request.headers(),...(token&&new URL(request.url()).origin===new URL(base).origin?{'x-vercel-trusted-oidc-idp-token':token}:{})}});
  });
  const page=await context.newPage();
  for(const route of routes){
   const errors=[];const onError=e=>errors.push(e.message);page.on('pageerror',onError);
   const mp4Requests=[];const onRequest=r=>{if(r.url().includes('.mp4'))mp4Requests.push(r.url())};page.on('request',onRequest);
   const response=await page.goto(base+route,{waitUntil:'networkidle'});
   assert.equal(response.status(),200,route);
   await page.evaluate(()=>document.fonts.ready);
   const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
   assert.ok(geometry.scroll<=width,`${route} overflow ${width}`);
   await page.addScriptTag({path:require.resolve('axe-core')});
   const violations=await page.evaluate(async()=> (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}})).violations.map(v=>({id:v.id,impact:v.impact,targets:v.nodes.map(n=>n.target)})));
   results.push({route,width,status:response.status(),...geometry,errors,violations});
   if(route==='/welcome'){
    assert.equal(await page.locator('.welcome-page section').count(),6);
    for(const href of ['#stories','#product-proof','#pricing']){
     const nav=page.getByRole('navigation',{name:width<768?'Mobile navigation':'Primary',exact:true});
     await nav.locator(`a[href="${href}"]`).click();
     await page.waitForTimeout(100);
     const top=await page.locator(href).evaluate(e=>e.getBoundingClientRect().top);
     const headerBottom=await page.locator('header').evaluate(e=>e.getBoundingClientRect().bottom);
     assert.ok(top>=headerBottom-2,`${href} hidden by header at ${width}`);
    }
    const planLinks=()=>page.locator('#pricing a[href^="/register?"]').evaluateAll(es=>es.map(e=>e.getAttribute('href')));
    const monthly=await planLinks();assert.deepEqual(monthly,['/register?plan=STARTER&billing=MONTHLY','/register?plan=GROWTH&billing=MONTHLY','/register?plan=PRO&billing=MONTHLY']);
    await page.getByRole('button',{name:'Yearly',exact:true}).click();
    const annual=await planLinks();assert.ok(annual.every(h=>h.endsWith('billing=ANNUAL')));
    const yearlyPrices=await page.locator('[data-testid^="plan-price-"]').allTextContents();assert.deepEqual(yearlyPrices,['GH₵1,990','GH₵3,490','GH₵6,990']);
    await page.getByRole('button',{name:'Monthly',exact:true}).click();
    assert.deepEqual(await page.locator('[data-testid^="plan-price-"]').allTextContents(),['GH₵199','GH₵349','GH₵699']);
    assert.equal(await page.locator('video').getAttribute('preload'),'none');assert.equal(await page.locator('video').getAttribute('autoplay'),null);
    assert.ok(await page.locator('video track[kind="captions"]').count());
    assert.equal(await page.locator('details[open]').count(),0);
    assert.equal(mp4Requests.length,0,'video must not download before playback');
    assert.ok((await page.locator('#getting-started').textContent()).includes('Set up and prepare the selling device online first'));
    for(const name of ['Facebook','TikTok']){const a=page.getByRole('link',{name,exact:true});assert.equal(await a.count(),1);assert.equal(await a.getAttribute('target'),'_blank');assert.ok((await a.getAttribute('rel')).includes('noopener'));}
    assert.equal(await page.getByRole('link',{name:'TikTok',exact:true}).getAttribute('href'),'https://www.tiktok.com/@tillflowapp');
    assert.equal(await page.getByRole('link',{name:'Facebook',exact:true}).getAttribute('href'),'https://www.facebook.com/share/1F2NDE5Zp2/?mibextid=wwXIfr');
    await page.getByText('Watch the 28-second introduction',{exact:true}).focus();await page.keyboard.press('Enter');
    assert.ok(await page.locator('video').isVisible());
    await page.getByText('Compare what’s included',{exact:true}).click();
    assert.ok(await page.getByRole('table').isVisible());
    const expandedWidth=await page.evaluate(()=>document.documentElement.scrollWidth);assert.ok(expandedWidth<=width,'expanded overflow');
    const expandedViolations=await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}})).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})));
    const whatsapp=await page.locator('a[href^="https://wa.me/"]').evaluateAll(es=>es.map(e=>e.href));assert.ok(whatsapp.length>0);assert.ok(whatsapp.every(h=>h.startsWith('https://wa.me/233547016160?')));
    controls.push({width,monthly,annual,yearlyPrices,expandedWidth,expandedViolations,whatsapp});
   }
   if(route.startsWith('/register')){
     await page.getByLabel('Business Name',{exact:true}).fill('Homepage review not submitted');
     await page.getByLabel('Your Name',{exact:true}).fill('Browser review');
     await page.getByRole('button',{name:'Next — Account Details',exact:true}).click();
     await page.getByLabel('Email',{exact:true}).fill('homepage-review@example.invalid');
     await page.getByLabel('Password',{exact:true}).fill('Local-UI-check-2026!');
     await page.getByRole('button',{name:'Next — Choose Plan',exact:true}).click();
     assert.equal(await page.getByRole('button',{name:'Annual',exact:true}).getAttribute('aria-pressed'),'true');
     assert.equal(await page.getByRole('button',{name:/^Pro/}).getAttribute('aria-pressed'),'true');
   }
   page.off('pageerror',onError);page.off('request',onRequest);
  }
  await context.close();
 }
 const context=await browser.newContext();
await context.route('**/*',route=>{const request=route.request();if(!['GET','HEAD','OPTIONS'].includes(request.method()))return route.abort();const token=process.env.VERCEL_OIDC_TOKEN;return route.continue({headers:{...request.headers(),...(token&&new URL(request.url()).origin===new URL(base).origin?{'x-vercel-trusted-oidc-idp-token':token}:{})}});});
const page=await context.newPage();const protectedRoutes=[];
 for(const route of ['/pos','/onboarding','/products']){await page.goto(base+route,{waitUntil:'networkidle'});assert.equal(new URL(page.url()).origin,new URL(base).origin);assert.ok(new URL(page.url()).pathname.includes('/login'));protectedRoutes.push({route,url:page.url()});}
 await browser.close();
 fs.writeFileSync(__dirname+'/validation.json',JSON.stringify({base,results,controls,protectedRoutes},null,2));
 const inherited=JSON.parse(fs.readFileSync(__dirname+'/baseline-a11y.json','utf8'));
 const failures=results.filter(r=>r.errors.length||r.violations.some(v=>!inherited.some(b=>b.route===r.route&&b.width===r.width&&b.violations.some(x=>JSON.stringify(x)===JSON.stringify(v)))));
 const expanded=controls.filter(r=>r.expandedViolations.length);
 console.log(JSON.stringify({checks:results.length,newFailures:failures,expandedFailures:expanded,existingFindings:results.filter(r=>r.violations.length).map(r=>({route:r.route,width:r.width,violations:r.violations}))},null,2));assert.equal(failures.length+expanded.length,0);
})().catch(e=>{console.error(e);process.exit(1)});
