import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
test("operations: assignments, leader isolation, targets, delivery, renewal, commission, intake and Excel", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pdc-ops-"));
  const child = spawn(process.execPath, ["server.js"], {
    env: {
      ...process.env,
      PORT: "0",
      DATA_DIR: dir,
      ADMIN_EMAIL: "admin@test.com",
      ADMIN_PASSWORD: "12345",
      OPENAI_API_KEY: "",
      WHATSAPP_TOKEN: "",
    },
    stdio: ["ignore", "pipe", "inherit"],
  });
  try {
    const port = await new Promise((resolve, reject) => {
      child.stdout.on("data", (d) => {
        const m = String(d).match(/port (\d+)/);
        if (m) resolve(m[1]);
      });
      child.once("exit", reject);
    });
    async function req(p, method = "GET", b, cookie = "", headers = {}) {
      const r = await fetch(`http://127.0.0.1:${port}${p}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie,
          ...headers,
        },
        body: b === undefined ? undefined : JSON.stringify(b),
      });
      return {
        status: r.status,
        b: await r.json(),
        cookie: r.headers.get("set-cookie")?.split(";")[0],
      };
    }
    const login = async (email) =>
      (await req("/api/auth/login", "POST", { email, password: "12345" }))
        .cookie;
    const admin = await login("admin@test.com");
    async function user(name, role) {
      const r = await req(
        "/api/users",
        "POST",
        { name, email: name + "@test.com", role, password: "12345" },
        admin,
      );
      assert.equal(r.status, 201);
      return r.b;
    }
    const leader = await user("leader", "teamleader"),
      otherLeader = await user("otherleader", "teamleader"),
      one = await user("one", "salesperson"),
      two = await user("two", "salesperson");
    const lc = await login(leader.email),
      oc = await login(otherLeader.email),
      sc = await login(one.email);
    const post = async (a, b, c = admin) =>
      req("/api/operations/" + a, "POST", b, c);
    assert.equal(
      (
        await post("profile", {
          id: one.id,
          leaderId: leader.id,
          serviceIds: ["pdc"],
          capacity: 1,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await post("profile", {
          id: two.id,
          leaderId: otherLeader.id,
          serviceIds: [],
          capacity: 0,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await post("settings", {
          assignment: "workload",
          escalationHours: 1,
          renewalDays: 30,
          commissionRate: 10,
        })
      ).status,
      200,
    );
    const lead = async (name, phone, extra = {}) => {
      const r = await req(
        "/api/leads",
        "POST",
        { name, phone, serviceId: "pdc", source: "Excel", ...extra },
        admin,
      );
      assert.equal(r.status, 201, JSON.stringify(r.b));
      return r.b;
    };
    const l1 = await lead("Customer One", "9898989801", {
        assignedTo: one.id,
        priority: "Hot",
        followUpAt: "2020-01-01T00:00:00Z",
      }),
      l2 = await lead("Customer Two", "9898989802");
    assert.equal(l2.assignedTo, two.id);
    const ls = (await req("/api/state", "GET", undefined, lc)).b;
    assert.deepEqual(
      ls.leads.map((l) => l.id),
      [l1.id],
    );
    assert.ok(!ls.users.some((u) => u.id === two.id));
    assert.equal(
      (await req("/api/leads/" + l2.id, "PATCH", { notes: "forbidden" }, lc))
        .status,
      403,
    );
    assert.equal(
      (await req("/api/leads/" + l1.id, "PATCH", { assignedTo: two.id }, lc))
        .status,
      403,
    );
    assert.equal(
      (await post("settings", { assignment: "manual" }, lc)).status,
      403,
    );
    assert.equal(
      (
        await post(
          "target",
          {
            salespersonId: two.id,
            month: "2026-10",
            monthlyCalls: 10,
            monthlySales: 1,
            monthlyRevenue: 100,
            dailyCalls: 2,
          },
          lc,
        )
      ).status,
      400,
    );
    const month = new Date()
      .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
      .slice(0, 7);
    assert.equal(
      (
        await post(
          "target",
          {
            salespersonId: one.id,
            month,
            monthlyCalls: 10,
            monthlySales: 1,
            monthlyRevenue: 1000,
            dailyCalls: 2,
          },
          lc,
        )
      ).status,
      200,
    );
    const call = await req(
      `/api/leads/${l1.id}/calls`,
      "POST",
      {
        outcome: "Connected",
        notes: "Needs counselling",
        durationSeconds: 65,
        stage: "Interested",
      },
      sc,
    );
    assert.equal(call.status, 201);
    assert.equal(
      (
        await post(
          "call-insight",
          {
            callId: call.b.id,
            recordingUrl: "javascript:alert(1)",
            consent: true,
          },
          sc,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await post(
          "call-insight",
          {
            callId: call.b.id,
            transcript: "Customer asks for nutrition help.",
            consent: true,
          },
          sc,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await post(
          "call-insight",
          {
            callId: call.b.id,
            transcript: "test",
            consent: true,
            generate: true,
          },
          sc,
        )
      ).status,
      400,
    );
    const plan = {
      plan: "PDC",
      months: 1,
      amount: 1000,
      received: 400,
      paymentMode: "UPI",
      startDate: "2026-01-01",
      nutritionist: "Dr Luv Patel",
      confirmed: true,
    };
    const sale = await req(`/api/leads/${l1.id}/sale`, "POST", plan, admin);
    assert.equal(sale.status, 201, JSON.stringify(sale.b));
    let d = (await req("/api/operations?month=" + month, "GET", undefined, lc))
      .b;
    assert.equal(d.targets[0].callsActual, 1);
    assert.equal(d.targets[0].salesActual, 1);
    assert.equal(d.commissions[0].earned, 40);
    assert.equal(d.deliveries.length, 1);
    assert.equal(d.renewals.length, 1);
    assert.equal(
      (await req("/api/operations", "GET", undefined, oc)).b.commissions.length,
      0,
    );
    assert.equal(
      (await req("/api/analytics", "GET", undefined, oc)).b.calls.length,
      0,
    );
    let delivery = d.deliveries[0];
    assert.equal(
      (
        await post(
          "delivery",
          {
            saleId: sale.b.id,
            status: "In progress",
            ownerId: leader.id,
            tasks: [{ text: "Onboard", done: true }],
            notes: "Done",
            expectedUpdatedAt: delivery.updatedAt,
          },
          lc,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await post(
          "delivery",
          {
            saleId: sale.b.id,
            status: "Completed",
            tasks: [],
            expectedUpdatedAt: delivery.updatedAt,
          },
          lc,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await post(
          "renewal",
          {
            saleId: sale.b.id,
            status: "Contacted",
            nextDate: "2026-12-01",
            notes: "Call scheduled",
          },
          sc,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await post("commission-paid", {
          saleId: sale.b.id,
          amount: 41,
          reference: "test",
          requestId: "pay1",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await post("commission-paid", {
          saleId: sale.b.id,
          amount: 20,
          reference: "test",
          requestId: "pay1",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await post("commission-paid", {
          saleId: sale.b.id,
          amount: 20,
          reference: "test",
          requestId: "pay1",
        })
      ).status,
      200,
    );
    assert.equal(
      (await req("/api/operations", "GET", undefined, admin)).b.commissions[0]
        .balance,
      20,
    );
    const t = (
      await post("template", {
        name: "Welcome",
        content: "Hi {{name}}, about {{service}}",
      })
    ).b;
    const draft = await post(
      "message",
      { leadId: l1.id, templateId: t.id, consent: true },
      sc,
    );
    assert.equal(draft.status, 200);
    assert.equal(draft.b.status, "Draft opened");
    assert.match(draft.b.url, /wa.me\/919898989801/);
    assert.equal(
      (
        await post(
          "message",
          { leadId: l1.id, templateId: t.id, consent: true, send: true },
          sc,
        )
      ).status,
      400,
    );
    const token = (await post("intake-token", {})).b.token;
    const incoming = {
      externalId: "excel-123",
      name: "Intake Customer",
      phone: "9898989803",
      serviceId: "pdc",
      source: "Website",
    };
    assert.equal(
      (await req("/api/intake/leads", "POST", incoming)).status,
      401,
    );
    const intake = await req("/api/intake/leads", "POST", incoming, "", {
      Authorization: "Bearer " + token,
    });
    assert.equal(intake.status, 201);
    const dup = await req("/api/intake/leads", "POST", incoming, "", {
      Authorization: "Bearer " + token,
    });
    assert.equal(dup.b.leadId, intake.b.leadId);
    assert.equal(dup.b.duplicate, true);
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Leads");
    sheet.addRows([
      ["Full Name", "Mobile"],
      ["Excel Customer", "9898989804"],
    ]);
    const file = Buffer.from(await wb.xlsx.writeBuffer()).toString("base64");
    const preview = await post("excel-preview", { file });
    assert.equal(preview.status, 200, JSON.stringify(preview.b));
    assert.deepEqual(preview.b.rows, [["Excel Customer", "9898989804"]]);
    const imported = await req(
      "/api/leads/import",
      "POST",
      {
        leads: [
          { name: "Existing", phone: l2.phone, serviceId: "pdc" },
          { name: "New Excel", phone: "9898989804", serviceId: "pdc" },
        ],
        skipDuplicates: true,
      },
      admin,
    );
    assert.equal(imported.b.count, 1);
    assert.equal(imported.b.skipped, 1);
    assert.equal(
      (await post("excel-preview", { file: "invalid" })).status,
      400,
    );
    const backup = (await req("/api/backup", "GET", undefined, admin)).b;
    assert.ok(backup.operations.targets.length);
    assert.ok(!backup.operations.secrets);
  } finally {
    const ended = new Promise((r) => child.once("exit", r));
    child.kill();
    await ended;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('provider adapters handle WhatsApp retries and AI summaries without live transmissions', async () => {
 const {createGrowth}=await import('../growth.js');const records=new Map();const put=(kind,v)=>records.set(kind+':'+v.id,structuredClone(v));const record=(kind,id)=>records.get(kind+':'+id);const rows=kind=>[...records].filter(([k])=>k.startsWith(kind+':')).map(([,v])=>v);
 const u={id:'s1',name:'Seller',role:'salesperson'};const lead={id:'l1',name:'Customer',phone:'9998887776',service:'Counselling',assignedTo:'s1'};
 put('messageTemplates',{id:'t1',content:'Hello {{name}}',providerName:'hello_world',language:'en_US'});put('calls',{id:'c1',leadId:'l1'});
 let b,result,requests=0;const oldFetch=globalThis.fetch;const oldEnv={...process.env};
 const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
 const growth=createGrowth({db:{prepare:()=>({all:()=>[u]})},put,record,rows,transaction:fn=>fn(),audit:()=>{},fail,body:async()=>b,admin:()=>{},leadAccess:()=>lead,createLead:()=>{},activity:()=>{}});
 try{
 process.env.WHATSAPP_TOKEN='test-only';process.env.WHATSAPP_PHONE_ID='123';process.env.OPENAI_API_KEY='test-only';
 globalThis.fetch=async(url,options)=>{requests++;const payload=JSON.parse(options.body);if(String(url).includes('graph.facebook.com')){assert.equal(payload.template.name,'hello_world');return {ok:true,json:async()=>({messages:[{id:'provider1'}]})};}assert.equal(payload.messages[1].content,'Customer wants evening calls.');return {ok:true,json:async()=>({choices:[{message:{content:'Needs evening follow-up.'}}]})};};
 b={leadId:'l1',templateId:'t1',consent:true,send:true,requestId:'msg-1'};const run=action=>growth.route({method:'POST'},new URL('http://test/api/operations/'+action),u,r=>{result=r;});
 await run('message');assert.equal(result.status,'Accepted by provider');await run('message');assert.equal(requests,1);
 b={callId:'c1',consent:true,transcript:'Customer wants evening calls.',generate:true};await run('call-insight');assert.equal(record('calls','c1').summary,'Needs evening follow-up.');
 b={callId:'c1',consent:true,transcript:'Different transcript'};await run('call-insight');assert.equal(record('calls','c1').summary,'');
 globalThis.fetch=async()=>{requests++;throw new Error('Simulated timeout');};b={leadId:'l1',templateId:'t1',consent:true,send:true,requestId:'msg-2'};await assert.rejects(run('message'),/Simulated timeout/);const count=requests;await run('message');assert.equal(requests,count);assert.match(result.status,/verify provider/);
 }finally{globalThis.fetch=oldFetch;for(const key of ['WHATSAPP_TOKEN','WHATSAPP_PHONE_ID','OPENAI_API_KEY']){if(oldEnv[key]===undefined)delete process.env[key];else process.env[key]=oldEnv[key];}}
});
