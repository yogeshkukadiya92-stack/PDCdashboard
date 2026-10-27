import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = process.env.QA_BASE_URL;
if (!base) throw new Error('Run using the isolated browser runner.');
const browser = await chromium.launch({headless:true,channel:process.env.PDC_BROWSER_CHANNEL || 'chrome'});
try {
 const page = await browser.newPage({viewport:{width:1280,height:900}});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base);
 await page.locator('#loginEmail').fill('qa-admin@example.com');
 await page.locator('#loginPassword').fill('QaTest12345');
 await page.locator('#loginForm button[type=submit]').click();
 await page.locator('body.is-authenticated').waitFor();
 await page.evaluate(async()=>{
  const today=toDateValue(new Date());
  const fixtures=[
   {id:'audit-no-phone',name:'Audit No Phone',phone:'',lifecycle:'active'},
   {id:'audit-family-a',name:'Audit Family A',phone:'9990001111',lifecycle:'old'},
   {id:'audit-family-b',name:'Audit Family B',phone:'9990001111',lifecycle:'active'},
   {id:'audit-multiple',name:'Audit Multiple Meetings',phone:'9990002222',lifecycle:'active',planMonths:2},
  ].map(c=>normalizeClient({...c,planMonths:c.planMonths || 1,startDate:today,endDate:planEndDate(today,2),meetingDate:today,status:'Active',nutritionist:'Dr Luv Patel',serviceAmount:4000,receivedAmount:0}));
  const multiple=fixtures.find(c=>c.id==='audit-multiple');
  multiple.meetings[0].date=today.slice(0,8)+'01';
  multiple.meetings[1].date=today.slice(0,8)+'02';
  await api('/api/clients',{method:'PUT',body:JSON.stringify({clients:fixtures,deleted:[]})});
  await window.crmRefresh();
 });
 await page.getByRole('link',{name:'Clients',exact:true}).click();
 const row=page.locator('#clientTable tr').filter({hasText:'Audit No Phone'});
 await row.getByRole('button',{name:'Edit client',exact:true}).click();
 await page.locator('#notes').fill('Edited without inventing a phone number');
 await page.locator('#saveClientButton').click();
 await page.waitForFunction(()=>document.querySelector('#saveProof').textContent.includes('Audit No Phone'));
 await page.reload();
 await page.getByRole('link',{name:'Reminders',exact:true}).click();
 await page.locator('#reminderList').getByText('Audit No Phone',{exact:false}).waitFor();
 await page.locator('#clientBucketList').getByText('Audit No Phone',{exact:false}).waitFor();
 await page.evaluate(async()=>{
  const state=await api('/api/state');
  const c=state.clients.find(c=>c.id==='audit-no-phone');
  c.meetings.forEach(m=>m.status='Done');
  await api('/api/clients',{method:'PUT',body:JSON.stringify({clients:[c],deleted:[]})});
  await window.crmRefresh();
 });
 assert.equal(await page.locator('#reminderList').getByText('Audit No Phone',{exact:false}).count(),0);
 await page.getByRole('link',{name:'Overview',exact:true}).click();
 await page.locator('#overviewNutritionist').selectOption('Dr Luv Patel');
 const monthCount=await page.evaluate(()=>clientsForNutritionist('Dr Luv Patel').reduce((total,c)=>total+meetingsThisMonthFor(c).length,0));
 assert.equal(Number(await page.locator('#nutritionistMonthMeetings').textContent()),monthCount);
 assert.equal(await page.evaluate(()=>{
  const original=clients;
  try {
   const today=toDateValue(new Date());
   const later=new Date();later.setDate(later.getDate()+12);
   const yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);
   const make=c=>normalizeClient({planMonths:1,startDate:today,endDate:toDateValue(later),meetingDate:today,serviceAmount:0,receivedAmount:0,lifecycle:'active',...c});
   clients=[make({id:'range',name:'Renewal after 12 days',status:'Active',meetings:[{id:'done',date:today,status:'Done'}]}),make({id:'interested',name:'Interested today',status:'Interested',followUpDate:today}),make({id:'overdue',name:'Interested yesterday',status:'Interested',followUpDate:toDateValue(yesterday)})];
   renderMetrics();
   return document.querySelector('#dueSoonCount').textContent;
  } finally {clients=original;render();}
 }),'1','Due Soon includes each client once within the next 7 days');
 await page.locator('.nutritionist-client-card').filter({hasText:'Audit No Phone'}).getByRole('button',{name:'WhatsApp',exact:true}).click();
 await page.getByText('Add a mobile number to this client before opening WhatsApp.',{exact:true}).waitFor();
 // A partial/stale Sheet response must preserve other records, including a shared family phone.
 const sheet=await page.evaluate(async()=>{
  const state=await api('/api/state');
  const c=state.clients.find(c=>c.id==='audit-family-a');
  return {...c,revision:0,notes:'Updated by mocked Sheet'};
 });
 await page.route('https://script.google.com/**',route=>route.fulfill({json:{clients:[sheet]}}));
 await page.evaluate(()=>localStorage.setItem('pdc-dashboard-sheet-web-app-url','https://script.google.com/macros/s/qa/exec'));
 await page.locator('#loadSheetButton').click();
 await page.getByText(/Loaded .* clients from Google Sheet/).waitFor();
 const state=await page.evaluate(()=>api('/api/state'));
 assert.ok(state.clients.some(c=>c.id==='audit-family-b'));
 assert.ok(state.clients.some(c=>c.id==='audit-no-phone' && c.notes.includes('Edited without')));
 assert.equal(state.clients.find(c=>c.id==='audit-family-a').notes,'Updated by mocked Sheet');
 const expectedPending=state.clients.reduce((sum,c)=>sum+Math.max(c.serviceAmount-c.receivedAmount,0),0);
 assert.equal(await page.locator('#pendingAmount').textContent(),await page.evaluate(v=>formatCurrency(v),expectedPending));
 await page.unroute('https://script.google.com/**');
 await page.route('https://script.google.com/**',route=>route.abort());
 await page.locator('#syncAllButton').click();
 await page.getByText(/clients could not be sent. Please retry Sync All/).waitFor();
 assert.equal(await page.locator('#syncStatus').textContent(),'Sync failed');
 await page.evaluate(()=>localStorage.removeItem('pdc-dashboard-sheet-web-app-url'));
 await page.getByRole('link',{name:'Reminders',exact:true}).click();
 const bucket=page.locator('#clientBucketList .client-bucket-item').filter({hasText:'Audit Family B'});
 await bucket.getByRole('button',{name:'Move to Old',exact:true}).click();
 await bucket.getByRole('button',{name:'Move to Active',exact:true}).waitFor();
 await bucket.getByRole('button',{name:'Move to Active',exact:true}).click();
 await bucket.getByRole('button',{name:'Move to Old',exact:true}).waitFor();
 // Rapid repeated form submission creates a single record.
 await page.getByRole('button',{name:'New Client',exact:true}).click();
 await page.locator('#clientName').fill('Audit Single Submit');
 await page.locator('#phone').fill('9898000011');
 await page.locator('#serviceAmount').fill('1000');
 await page.locator('#receivedAmount').fill('1500');
 await page.locator('#saveClientButton').click();
 await page.getByText('Save blocked: received amount cannot exceed service amount.',{exact:true}).waitFor();
 await page.locator('#receivedAmount').fill('0');
 await page.evaluate(()=>{
  const form=document.querySelector('#clientForm');
  form.requestSubmit();
  form.requestSubmit();
 });
 await page.waitForFunction(()=>document.querySelector('#saveProof').textContent.includes('Audit Single Submit'));
 const saved=await page.evaluate(()=>api('/api/state'));
 assert.equal(saved.clients.filter(c=>c.name==='Audit Single Submit').length,1);
 const createdRow=page.locator('#clientTable tr').filter({hasText:'Audit Single Submit'});
 await createdRow.getByRole('button',{name:'Edit client',exact:true}).click();
 page.once('dialog',dialog=>dialog.accept());
 await createdRow.getByRole('button',{name:'Delete client',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#clientId').value==='');
 await page.reload();
 assert.equal(await page.locator('#clientTable tr').filter({hasText:'Audit Single Submit'}).count(),0);
 await page.locator('#searchInput').fill('No such client audit');
 await page.getByText('No clients found. Add your first PDC client from the entry form.',{exact:true}).waitFor();
 await page.locator('#searchInput').fill('');
 assert.ok(await page.locator('#clientTable tr').count()>1);
 assert.deepEqual(errors,[]);
 console.log('PASS: no-phone client edit, reminder alerts/completed exclusion, missing-phone WhatsApp, partial Sheet/shared phones/revisions, debt totals, sync failure, duplicate submit, delete persistence/form reset and empty search recovery.');
} finally {await browser.close();}
