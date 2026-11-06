/** Browser regression suite against an isolated, non-writing copy of the real UI. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const port = process.env.UI_TEST_PORT || '3192';
const base = `http://127.0.0.1:${port}`;
const output = process.env.UI_TEST_OUTPUT || '/tmp/tish-mobile-results';
await mkdir(output, {recursive:true});
const server = spawn(process.execPath, ['scripts/mobile-ui-fixture.mjs'], {cwd:root,env:{...process.env,UI_TEST_PORT:port},stdio:['ignore','pipe','pipe']});
let logs=''; server.stdout.on('data',d=>logs+=d); server.stderr.on('data',d=>logs+=d);
let browser;
const results=[];
try {
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Fixture startup timeout: '+logs)),60000);server.stdout.on('data',()=>{if(logs.includes('Ready in')){clearTimeout(timer);resolve()}});server.on('exit',code=>{clearTimeout(timer);reject(new Error('Fixture exited '+code+': '+logs))})});
  browser = await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']}: {})});
  const axeSource=await readFile(process.env.AXE_SOURCE || fileURLToPath(import.meta.resolve('axe-core/axe.min.js')),'utf8');
  const context = await browser.newContext({hasTouch:true,isMobile:true,serviceWorkers:'block'});
  const page = await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const routes=['/','/businesses','/businesses/fixture-0','/businesses/fixture-0?tab=overview','/businesses/fixture-0?tab=billing','/businesses/fixture-0?tab=notes','/collections','/subscriptions','/revenue','/command/scale','/command/scale?businessId=fixture-0','/command/digest','/command/support','/command/referrals','/command/templates','/command/guides','/playbooks','/staff','/errors'];
  const viewports=[[320,740],[360,800],[375,812],[390,844],[430,932],[390,360],[768,1024],[844,390],[1024,768],[1440,900]];
  for (const [width,height] of viewports) {
    await page.setViewportSize({width,height});
    for(const route of routes){
      const response=await page.goto(base+route); assert.equal(response.status(),200,route);
      await page.locator('main h1').waitFor();
      if(route.includes('businessId=fixture-0'))await page.getByRole('dialog').waitFor();
      const overflow = await page.evaluate(()=>{const main=document.querySelector('main');const modal=document.querySelector('dialog');return {document:document.documentElement.scrollWidth>innerWidth+1,main:main.scrollWidth>main.clientWidth+1,modal:modal?modal.scrollWidth>modal.clientWidth+1:false}});
      if(overflow.document||overflow.main){await page.screenshot({path:`${output}/failure.png`,fullPage:true});console.log(await page.locator('main *').evaluateAll(els=>els.filter(el=>el.getClientRects().length&&el.getBoundingClientRect().right>innerWidth).map(el=>({tag:el.tagName,cls:el.className,text:el.textContent.slice(0,90),right:el.getBoundingClientRect().right})).slice(-20)))}
      assert.deepEqual(overflow,{document:false,main:false,modal:false},`${width} ${route} overflow`);
      if(width<768){
        const smallInputs=await page.locator('main input:not([type=checkbox]):not([type=hidden]),main select,main textarea').evaluateAll(els=>els.filter(el=>el.getClientRects().length&&parseFloat(getComputedStyle(el).fontSize)<16).length);
        assert.equal(smallInputs,0,`${width} ${route}: input zoom risk`);
      }
      if(width===390&&height===844&&axeSource){await page.addScriptTag({content:axeSource});const violations=await page.evaluate(async()=>{const r=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}});return r.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary})).slice(0,4)}))});assert.deepEqual(violations,[],route+' accessibility')}
      results.push({width,height,route,status:'passed'});
      if(width===390&&height===844&&route.includes('businessId=fixture-0'))await page.screenshot({path:`${output}/390-growth-panel.png`});
      if([320,390,1440].includes(width)&&height!==360&&['/','/businesses','/businesses/fixture-0'].includes(route))await page.screenshot({path:`${output}/${width}-${route==='/'?'overview':route==='/businesses'?'businesses':'account'}.png`,fullPage:true});
    }
  }
  await page.setViewportSize({width:390,height:844});
  await page.goto(base+'/command/scale');await page.getByText('More portfolio metrics',{exact:true}).click();await page.getByText('Expected MRR',{exact:true}).waitFor({state:'visible'});await page.getByText('More portfolio metrics',{exact:true}).click();await page.getByRole('button',{name:'View details',exact:true}).first().click();await page.getByRole('dialog').waitFor();await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.getByRole('button',{name:'View details',exact:true}).first().evaluate(el=>el===document.activeElement),true);
  await page.goto(base+'/command/support');await page.getByText('More support metrics',{exact:true}).click();await page.getByText('Avg open age',{exact:true}).waitFor({state:'visible'});await page.getByText('More support metrics',{exact:true}).click();
  await page.goto(base+'/businesses');
  assert.equal(await page.locator('#billing-setup').getAttribute('open'),null);
  await page.locator('#billing-setup summary').click();await page.getByRole('button',{name:'Save billing setup',exact:true}).waitFor({state:'visible'});
  await page.locator('#billing-setup summary').click();
  await page.locator('input[data-roster-id="businesses"]:visible').first().check();
  await page.setViewportSize({width:1200,height:800});assert.equal(await page.locator('input[data-roster-id="businesses"]:visible').first().isChecked(),true);await page.setViewportSize({width:390,height:844});
  await page.getByRole('region',{name:'Selected businesses'}).waitFor({state:'visible'});
  await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await page.getByRole('region',{name:'Selected businesses'}).count(),0);
  await page.getByRole('button',{name:'Open navigation'}).click();
  const dialog=page.getByRole('dialog',{name:'Navigation'});await dialog.waitFor();assert.equal(await page.locator('main').evaluate(el=>!!el.closest('[inert]')),true);
  await page.getByRole('link',{name:'Sign out',exact:true}).last().focus();await page.keyboard.press('Tab');assert.equal(await page.getByRole('button',{name:'Close menu',exact:true}).evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Escape');assert.equal(await dialog.count(),0);assert.equal(await page.getByRole('button',{name:'Open navigation'}).evaluate(el=>el===document.activeElement),true);
  await page.getByRole('button',{name:'Open navigation'}).click();await dialog.getByRole('link',{name:/Businesses/}).click();await dialog.waitFor({state:'detached'});
  await page.getByRole('button',{name:'Open navigation'}).click();await page.setViewportSize({width:1200,height:800});await dialog.waitFor({state:'detached'});assert.equal(await page.locator('main').evaluate(el=>!!el.closest('[inert]')),false);
  await page.setViewportSize({width:390,height:844});
  const search=page.getByRole('combobox',{name:'Search businesses'}).filter({visible:true});
  await search.fill('Accra');await page.getByRole('listbox',{name:'Business matches'}).waitFor();await search.press('Enter');await page.waitForURL('**/businesses/fixture-0');
  await page.getByRole('navigation',{name:'Account sections'}).getByRole('link',{name:'Notes',exact:true}).click();await page.waitForURL('**?tab=notes');
  await search.fill('No-such-company');await page.getByRole('status').filter({hasText:'No match'}).waitFor();
  await page.route('**/api/search?**',r=>r.fulfill({status:503,body:'unavailable'}));await search.fill('Failed query');await page.getByRole('status').filter({hasText:'Search is unavailable'}).waitFor();await page.unroute('**/api/search?**');await search.fill('');
  await context.addCookies([{name:'fixture-role',value:'SUPPORT_AGENT',url:base}]);await page.reload();await page.getByRole('button',{name:'Open navigation'}).click();assert.equal(await page.getByRole('dialog').getByRole('link',{name:'Error Log',exact:true}).count(),0);
  assert.deepEqual(errors,[],'Browser runtime errors');
  await writeFile(`${output}/report.json`,JSON.stringify({viewports:viewports.length,pages:routes.length,geometryChecks:results.length,interactions:['growth metrics disclosure','support metrics disclosure','growth modal Escape/focus restoration','same-route menu close','bulk selection on resize','billing disclosure','bulk selection/cancel','menu focus trap','Escape/focus restoration','desktop resize','search API/results/navigation','no results','search failure','account tabs','role-sensitive navigation'],accessibility:'WCAG 2 A/AA and 2.1 AA: no serious or critical automated violations on every tested phone view',runtimeErrors:errors,results},null,2));
  console.log(`PASS: ${results.length} page/viewport checks and interaction flows; no browser runtime errors. Screenshots: ${output}`);
} catch(error){console.error(error);console.error(logs.slice(-7000));process.exitCode=1}
finally{await browser?.close();server.kill('SIGTERM')}
