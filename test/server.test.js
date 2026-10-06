import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { salesReport } from "../crm-domain.js";
const dir = mkdtempSync(path.join(tmpdir(), "pdc-crm-"));
const port = 18473,
  base = `http://127.0.0.1:${port}`;
let server;
const credentials = {
  email: "admin@example.com",
  password: "TestPassword!123",
};
async function request(url, method = "GET", body, cookie = "") {
  const res = await fetch(base + url, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: res.status,
    data: await res.json(),
    cookie: res.headers.get("set-cookie")?.split(";")[0],
  };
}
async function startServer() {
  server = spawn(process.execPath, ["server.js"], {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dir,
      ADMIN_EMAIL: credentials.email,
      ADMIN_PASSWORD: credentials.password,
    },
  });
  await new Promise((resolve, reject) => {
    server.stdout.on("data", resolve);
    server.on("exit", (code) => reject(new Error(`Server exit ${code}`)));
    server.stderr.on("data", (s) => {
      if (String(s).includes("Error:")) reject(new Error(String(s)));
    });
  });
}
before(startServer);
after(() => {
  server?.kill();
  rmSync(dir, { recursive: true, force: true });
});
test("CRM workflow, permissions, duplicates and transactional conversion", async () => {
  assert.equal((await request("/api/state")).status, 401);
  const admin = (await request("/api/auth/login", "POST", credentials)).cookie;
  assert.ok(admin);
  const seller = (
    await request(
      "/api/users",
      "POST",
      {
        name: "Sales One",
        email: "sales@example.com",
        password: "SalesPassword!123",
        role: "salesperson",
      },
      admin,
    )
  ).data;
  const seller2 = (
    await request(
      "/api/users",
      "POST",
      {
        name: "Sales Two",
        email: "sales2@example.com",
        password: "SalesPassword!123",
        role: "salesperson",
      },
      admin,
    )
  ).data;
  const sc = (
    await request("/api/auth/login", "POST", {
      email: seller.email,
      password: "SalesPassword!123",
    })
  ).cookie;
  const sc2 = (
    await request("/api/auth/login", "POST", {
      email: seller2.email,
      password: "SalesPassword!123",
    })
  ).cookie;
  const lead = (
    await request(
      "/api/leads",
      "POST",
      { name: "Buyer", phone: "9876543210", assignedTo: seller.id },
      admin,
    )
  ).data;
  assert.ok(lead.id);
  assert.equal(
    (
      await request(
        "/api/leads",
        "POST",
        { name: "Duplicate", phone: "+91 9876543210" },
        admin,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await request(
        `/api/leads/${lead.id}/calls`,
        "POST",
        { outcome: "Connected", notes: "Interested" },
        sc2,
      )
    ).status,
    403,
  );
  assert.equal(
    (await request("/api/clients", "PUT", { clients: [], deleted: [] }, sc))
      .status,
    403,
  );
  assert.equal(
    (
      await request(
        `/api/leads/${lead.id}/calls`,
        "POST",
        {
          outcome: "Connected",
          notes: "Interested in plan",
          stage: "Interested",
          followUpAt: "2026-10-07T06:00:00Z",
        },
        sc,
      )
    ).status,
    201,
  );
  const sale = {
    amount: 15000,
    received: 5000,
    months: 3,
    startDate: "2026-10-06",
    paymentMode: "UPI",
    nutritionist: "Dr Luv Patel",
    plan: "Three months",
  };
  assert.equal(
    (
      await request(
        `/api/leads/${lead.id}/sale`,
        "POST",
        { ...sale, confirmed: true },
        sc,
      )
    ).status,
    403,
  );
  assert.equal(
    (await request(`/api/leads/${lead.id}/sale`, "POST", sale, sc)).status,
    201,
  );
  assert.equal(
    (await request(`/api/leads/${lead.id}/sale`, "POST", sale, sc)).status,
    409,
  );
  assert.equal(
    (await request("/api/state", "GET", undefined, admin)).data.clients.length,
    0,
  );
  assert.equal(
    (await request(`/api/leads/${lead.id}/confirm`, "POST", {}, sc)).status,
    403,
  );
  assert.equal(
    (await request(`/api/leads/${lead.id}/confirm`, "POST", {}, admin)).status,
    200,
  );
  assert.equal(
    (await request(`/api/leads/${lead.id}/confirm`, "POST", {}, admin)).status,
    409,
  );
  let state = (await request("/api/state", "GET", undefined, admin)).data;
  assert.equal(state.clients.length, 1);
  assert.equal(state.leads[0].stage, "Purchased");
  assert.equal(state.clients[0].receivedAmount, 5000);
  let report = (
    await request("/api/reports", "GET", undefined, admin)
  ).data.find((r) => r.id === seller.id);
  assert.equal(report.attempts, 1);
  assert.equal(report.connected, 1);
  assert.equal(report.buyers, 1);
  assert.equal(report.pending, 10000);
  assert.equal(
    (await request("/api/state", "GET", undefined, sc2)).data.leads.length,
    0,
  );
  const stale = structuredClone(state.clients[0]);
  assert.equal(
    (
      await request(
        "/api/clients",
        "PUT",
        { clients: [{ ...stale, receivedAmount: 15000 }], deleted: [] },
        admin,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        "/api/clients",
        "PUT",
        { clients: [stale], deleted: [] },
        admin,
      )
    ).status,
    409,
  );
  report = (await request("/api/reports", "GET", undefined, admin)).data.find(
    (r) => r.id === seller.id,
  );
  assert.equal(report.pending, 0);
  assert.equal(
    (
      await request(
        `/api/users/${seller.id}`,
        "PATCH",
        { password: "NewPassword!123" },
        admin,
      )
    ).status,
    200,
  );
  assert.equal((await request("/api/state", "GET", undefined, sc)).status, 401);
  const blocked = await fetch(base + "/api/users", {
    method: "POST",
    headers: {
      Origin: "https://evil.example",
      "Content-Type": "application/json",
      Cookie: admin,
    },
    body: "{}",
  });
  assert.equal(blocked.status, 403);
});
test("reports count distinct connected leads and use IST date boundaries", () => {
  const user = { id: "s", name: "Seller", role: "salesperson" },
    lead = { id: "l", assignedTo: "s", createdAt: "2026-10-05T20:00:00Z" };
  const calls = [
    {
      leadId: "l",
      actorId: "s",
      outcome: "Connected",
      createdAt: lead.createdAt,
    },
    {
      leadId: "l",
      actorId: "s",
      outcome: "Connected",
      createdAt: lead.createdAt,
    },
  ];
  const report = salesReport(
    [user],
    [lead],
    calls,
    [
      {
        leadId: "l",
        salespersonId: "s",
        confirmedAt: lead.createdAt,
        amount: 100,
        received: 50,
      },
    ],
    { from: "2026-10-06", to: "2026-10-06" },
  )[0];
  assert.equal(report.attempts, 2);
  assert.equal(report.connected, 1);
  assert.equal(report.leadConversion, 100);
  assert.equal(report.callConversion, 100);
});

test("database and accounts survive a server restart", async () => {
  const exited = new Promise(resolve => server.once('exit', resolve));
  server.kill(); await exited;
  await startServer();
  const admin = (await request('/api/auth/login','POST',credentials)).cookie;
  const state = (await request('/api/state','GET',undefined,admin)).data;
  assert.equal(state.leads.length,1);
  assert.equal(state.calls.length,1);
  assert.equal(state.sales.length,1);
  assert.equal(state.clients.length,1);
  assert.equal(state.users.length,3);
});
