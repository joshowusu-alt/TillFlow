const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
 const base = process.argv[2] || 'https://www.tillflow.app';
 const label = process.argv[3] || 'before';
 const dir = __dirname;
 const browser = await chromium.launch({headless:true});
 const results = [];
 for (const width of [320,360,390,768,1440]) {
  const context = await browser.newContext({viewport:{width,height:900}, reducedMotion:'reduce', serviceWorkers:'block'});
  await context.route('**/*',route=>{
    const request=route.request();
    if(!['GET','HEAD','OPTIONS'].includes(request.method()))return route.abort();
    const token=process.env.VERCEL_OIDC_TOKEN;
    return route.continue({headers:{...request.headers(),...(token&&new URL(request.url()).origin===new URL(base).origin?{'x-vercel-trusted-oidc-idp-token':token}:{})}});
  });
  const page = await context.newPage();
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/welcome',{waitUntil:'networkidle'});
  await page.evaluate(()=>document.fonts.ready);
  for(let y=0;y<await page.evaluate(()=>document.documentElement.scrollHeight);y+=700) {await page.evaluate(y=>scrollTo(0,y),y); await page.waitForTimeout(30);}
  await page.evaluate(()=>scrollTo(0,0));
  const data=await page.evaluate(()=>({height:document.documentElement.scrollHeight, width:document.documentElement.scrollWidth, sections:[...document.querySelectorAll('.welcome-page section')].map(e=>({id:e.id,label:e.getAttribute('aria-label'),heading:e.querySelector('h1,h2,h3')?.textContent,top:Math.round(e.getBoundingClientRect().top+scrollY),height:Math.round(e.getBoundingClientRect().height),text:e.innerText})), links:[...document.querySelectorAll('a')].map(a=>({text:a.innerText,href:a.getAttribute('href')}))}));
  await page.screenshot({path:path.join(dir,`${label}-${width}.png`),fullPage:true});
  if(width===390||width===1440) for(let i=0;i<data.sections.length;i++) await page.locator('.welcome-page section').nth(i).screenshot({path:path.join(dir,`${label}-${width}-section-${i+1}.png`)});
  results.push({viewport:width,...data,errors});
  await context.close();
 }
 fs.writeFileSync(path.join(dir,`${label}.json`),JSON.stringify(results,null,2));
 console.log(results.map(r=>({width:r.viewport,height:r.height,sections:r.sections.length,overflow:r.width>r.viewport,errors:r.errors})));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
