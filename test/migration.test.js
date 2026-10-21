import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("legacy leads, calls and purchases migrate without losing records or duplicating services", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pdc-migrate-"));
  const db = new DatabaseSync(path.join(dir, "pdc.sqlite"));
  db.exec(
    "CREATE TABLE records(kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(kind,id))",
  );
  const put = (kind, value) =>
    db
      .prepare("INSERT INTO records VALUES(?,?,?)")
      .run(kind, value.id, JSON.stringify(value));
  put("leads", {
    id: "legacy",
    name: "Legacy Person",
    phone: "9876543210",
    service: "Legacy programme",
    source: "Referral",
    stage: "Purchased",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  });
  put("calls", {
    id: "old-call",
    leadId: "legacy",
    outcome: "Connected",
    notes: "Keep this discussion",
    createdAt: "2026-01-01T00:00:00Z",
  });
  put("sales", {
    id: "old-sale",
    leadId: "legacy",
    clientId: "old-client",
    amount: 1000,
    received: 400,
    confirmedAt: "2026-01-01T00:00:00Z",
  });
  put("clients", {
    id: "old-client",
    name: "Legacy Person",
    phone: "9876543210",
    serviceAmount: 1000,
    receivedAmount: 400,
  });
  db.close();
  let server;
  const stop = async () => {
    if (!server) return;
    const exited = new Promise((resolve) => server.once("exit", resolve));
    server.kill();
    await exited;
    server = null;
  };
  try {
    for (let i = 0; i < 2; i++) {
      server = spawn(process.execPath, ["server.js"], {
        env: {
          ...process.env,
          PORT: "18477",
          DATA_DIR: dir,
          ADMIN_EMAIL: "admin@example.com",
          ADMIN_PASSWORD: "12345",
        },
      });
      await new Promise((resolve, reject) => {
        server.stdout.once("data", resolve);
        server.once("exit", () => reject(new Error("Startup failed")));
      });
      const login = await fetch("http://127.0.0.1:18477/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@example.com", password: "12345" }),
      });
      const state = await (
        await fetch("http://127.0.0.1:18477/api/state", {
          headers: { Cookie: login.headers.get("set-cookie").split(";")[0] },
        })
      ).json();
      assert.equal(state.services.length, 2);
      assert.equal(state.leads.length, 1);
      assert.equal(state.calls.length, 1);
      assert.equal(state.sales.length, 1);
      assert.equal(state.clients.length, 1);
      assert.equal(state.calls[0].notes, "Keep this discussion");
      assert.equal(state.sales[0].received, 400);
      assert.equal(state.sales[0].serviceKind, "pdc");
      assert.equal(state.calls[0].serviceId, state.leads[0].serviceId);
      assert.equal(state.sales[0].clientId, "old-client");
      await stop();
    }
  } finally {
    await stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
