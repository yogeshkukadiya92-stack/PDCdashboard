import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const base = process.env.QA_BASE_URL;
if (!base) throw new Error('Run using the isolated browser runner.');
const browser = await chromium.launch({headless:true,channel:process.env.PDC_BROWSER_CHANNEL || 'chrome'});
const page = await browser.newPage();
const errors = [], ledger = [];
page.on('pageerror', error => errors.push(error.message));
try {
 await page.goto(base);
 await page.locator('#loginEmail').fill('qa-admin@example.com');
 await page.locator('#loginPassword').fill('QaTest12345');
 await page.locator('#loginForm button[type=submit]').click();
 await page.locator('body.is-authenticated').waitFor();
 const links = await page.locator('.nav-links a').evaluateAll(els=>els.map(el=>({name:el.textContent.trim(),href:el.getAttribute('href')})));
 for (const width of [1440, 820, 390, 320]) {
  await page.setViewportSize({width,height:900});
  for (const link of links) {
   await page.locator(`.nav-links a[href="${link.href}"]`).click();
   await page.locator(`${link.href}.active`).waitFor();
   await page.evaluate(() => document.getAnimations().forEach(animation => animation.finish()));
   const state = await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth, offenders:[...document.querySelectorAll('body *')].filter(el=>{const r=el.getBoundingClientRect();return r.width && r.right>innerWidth+1 && getComputedStyle(el).position!=='fixed' && !el.closest('.table-wrap,.crm-table-wrap');}).slice(0,8).map(el=>`${el.tagName}.${el.className}#${el.id}`)}));
   ledger.push({width,view:link.name,...state});
   if (state.overflow>1) console.log('OVERFLOW',width,link.name,JSON.stringify(state));
   if (width===390 || width===1440) await page.screenshot({path:path.join(process.env.QA_OUTPUT_DIR,`audit-${width}-${link.href.slice(6)}.png`),fullPage:true});
  }
 }
 for (const width of [1440,390]) {
  await page.setViewportSize({width,height:900});
  await page.getByRole('link',{name:/^Operations/,exact:false}).click();
  const tabs=await page.locator('[data-ops="tab"]').evaluateAll(els=>els.map(el=>({id:el.dataset.id,name:el.textContent.trim()})));
  for (const tab of tabs) {
   await page.locator(`[data-ops="tab"][data-id="${tab.id}"]`).click();
   await page.locator(`[data-ops="tab"][data-id="${tab.id}"][aria-pressed=true]`).waitFor();
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
   ledger.push({width,view:`Operations / ${tab.name}`,overflow});
  }
 }
 await page.setViewportSize({width:1280,height:600});
 const team=page.getByRole('link',{name:'Team',exact:true});
 await team.click();
 await page.locator('#view-team.active').waitFor();
 assert.ok(await team.evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0 && r.bottom<=innerHeight;}),'Sidebar items must be reachable on short laptop screens');
 ledger.push({width:1280,height:600,view:'Short-screen sidebar / Team',overflow:0});
 await fs.writeFile(path.join(process.env.QA_OUTPUT_DIR,'audit-ledger.json'),JSON.stringify({ledger,errors},null,2));
 assert.deepEqual(errors,[]);
 assert.ok(ledger.every(row=>row.overflow<=1),'All views must fit the viewport');
 console.log(`PASS: ${ledger.length} desktop/tablet/mobile route checks; no page errors or page overflow.`);
} finally {await browser.close();}
