import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("multiple services, lead effort, approvals, imports, attribution and access", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pdc-services-"));
  const server = spawn(process.execPath, ["server.js"], {
    env: {
      ...process.env,
      PORT: "18476",
      DATA_DIR: dir,
      ADMIN_EMAIL: "admin@example.com",
      ADMIN_PASSWORD: "12345",
    },
  });
  try {
    await new Promise((resolve, reject) => {
      server.stdout.once("data", resolve);
      server.once("exit", (code) => reject(new Error(`Server exited ${code}`)));
    });
    const req = async (route, method = "GET", data, cookie = "") => {
      const res = await fetch(`http://127.0.0.1:18476${route}`, {
        method,
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
      return {
        status: res.status,
        data: await res.json(),
        cookie: res.headers.get("set-cookie")?.split(";")[0],
      };
    };
    const admin = (
      await req("/api/auth/login", "POST", {
        email: "admin@example.com",
        password: "12345",
      })
    ).cookie;
    const seller = (
      await req(
        "/api/users",
        "POST",
        {
          name: "One",
          email: "one@example.com",
          password: "12345",
          role: "salesperson",
        },
        admin,
      )
    ).data;
    const other = (
      await req(
        "/api/users",
        "POST",
        {
          name: "Two",
          email: "two@example.com",
          password: "12345",
          role: "salesperson",
        },
        admin,
      )
    ).data;
    const sc = (
      await req("/api/auth/login", "POST", {
        email: seller.email,
        password: "12345",
      })
    ).cookie;
    const oc = (
      await req("/api/auth/login", "POST", {
        email: other.email,
        password: "12345",
      })
    ).cookie;
    const serviceInput = {
      name: "Leadership Workshop",
      kind: "general",
      price: 2500,
      months: 1,
      deliveryOwner: "Coach A",
    };
    assert.equal(
      (await req("/api/services", "POST", serviceInput, sc)).status,
      403,
    );
    const service = (await req("/api/services", "POST", serviceInput, admin))
      .data;
    assert.equal(
      (await req("/api/services", "POST", serviceInput, admin)).status,
      409,
    );
    const leadInput = {
      name: "Same Person",
      phone: "9876543210",
      serviceId: service.id,
      source: "YouTube webinar",
      sourceDetails: "October launch",
      assignedTo: seller.id,
    };
    const lead = (await req("/api/leads", "POST", leadInput, admin)).data;
    assert.equal(lead.service, service.name);
    assert.equal(
      (
        await req(
          "/api/leads",
          "POST",
          { ...leadInput, phone: "+91 98765 43210" },
          admin,
        )
      ).status,
      409,
    );
    const pdc = (
      await req("/api/leads", "POST", { ...leadInput, serviceId: "pdc" }, admin)
    ).data;
    assert.ok(pdc.id);
    assert.equal(
      (
        await req(
          `/api/leads/${lead.id}/notes`,
          "POST",
          { text: "Sent brochure" },
          oc,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await req(
          `/api/leads/${lead.id}/notes`,
          "POST",
          { text: "Sent brochure" },
          sc,
        )
      ).status,
      201,
    );
    assert.equal(
      (
        await req(
          `/api/leads/${lead.id}/calls`,
          "POST",
          {
            outcome: "Connected",
            notes: "Asked about schedule",
            stage: "Interested",
            durationSeconds: 125,
          },
          sc,
        )
      ).status,
      201,
    );
    assert.equal(
      (
        await req(
          `/api/leads/${lead.id}/calls`,
          "POST",
          {
            outcome: "Connected",
            notes: "Invalid duration",
            durationSeconds: -1,
          },
          sc,
        )
      ).status,
      400,
    );
    const purchase = {
      amount: 2500,
      received: 500,
      months: 1,
      startDate: "2026-10-21",
      paymentMode: "UPI",
      plan: "Workshop",
    };
    assert.equal(
      (
        await req(
          `/api/leads/${lead.id}/sale`,
          "POST",
          { ...purchase, startDate: "2026-02-30" },
          sc,
        )
      ).status,
      400,
    );
    assert.equal(
      (await req(`/api/leads/${lead.id}/sale`, "POST", purchase, sc)).status,
      201,
    );
    assert.equal(
      (
        await req(
          `/api/leads/${lead.id}`,
          "PATCH",
          { assignedTo: other.id },
          admin,
        )
      ).status,
      400,
    );
    assert.equal(
      (await req(`/api/leads/${lead.id}/confirm`, "POST", {}, oc)).status,
      403,
    );
    assert.equal(
      (await req(`/api/leads/${lead.id}/confirm`, "POST", {}, admin)).status,
      200,
    );
    assert.equal(
      (await req(`/api/leads/${lead.id}/confirm`, "POST", {}, admin)).status,
      409,
    );
    assert.equal(
      (await req("/api/state", "GET", undefined, admin)).data.clients.length,
      0,
    );
    assert.equal(
      (
        await req(
          `/api/leads/${lead.id}/payment`,
          "POST",
          { amount: 2000, note: "Final UPI", requestId: "payment-1" },
          admin,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await req(
          `/api/leads/${lead.id}/payment`,
          "POST",
          { amount: 2000, note: "Final UPI", requestId: "payment-1" },
          admin,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await req(
          `/api/leads/${lead.id}/payment`,
          "POST",
          { amount: 1, note: "Overpayment", requestId: "payment-2" },
          admin,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await req(
          `/api/leads/${pdc.id}/sale`,
          "POST",
          { ...purchase, nutritionist: "Dr Luv Patel", confirmed: true },
          admin,
        )
      ).status,
      201,
    );
    let report = (await req("/api/analytics", "GET", undefined, admin)).data;
    assert.equal(report.totals.confirmed, 2);
    assert.equal(report.totals.people, 1);
    assert.equal(report.totals.received, 3000);
    assert.equal(report.byService.find((s) => s.id === service.id).attempts, 1);
    assert.equal(report.byService.find((s) => s.id === service.id).pending, 0);
    assert.equal(
      report.effort.find((l) => l.id === lead.id).talkTimeSeconds,
      125,
    );
    assert.equal(
      report.bySource.find((s) => s.name === "YouTube webinar").confirmed,
      2,
    );
    assert.equal(
      (
        await req(
          `/api/analytics?serviceId=${service.id}`,
          "GET",
          undefined,
          admin,
        )
      ).data.totals.confirmed,
      1,
    );
    assert.equal(
      (
        await req(
          `/api/analytics?salesperson=${seller.id}`,
          "GET",
          undefined,
          oc,
        )
      ).data.totals.confirmed,
      0,
    );
    assert.equal(
      (await req("/api/reports?from=2026-02-30", "GET", undefined, admin))
        .status,
      400,
    );
    assert.equal(
      (
        await req(
          "/api/analytics?from=2026-10-22&to=2026-10-21",
          "GET",
          undefined,
          admin,
        )
      ).status,
      400,
    );
    // All-or-nothing import: a duplicate must not leave a partially imported list.
    const before = (await req("/api/state", "GET", undefined, admin)).data.leads
      .length;
    assert.equal(
      (
        await req(
          "/api/leads/import",
          "POST",
          { leads: [{ ...leadInput, phone: "9876543211" }, leadInput] },
          admin,
        )
      ).status,
      409,
    );
    assert.equal(
      (await req("/api/state", "GET", undefined, admin)).data.leads.length,
      before,
    );
    assert.equal(
      (
        await req(
          "/api/leads/import",
          "POST",
          { leads: [{ ...leadInput, phone: "9876543211" }] },
          admin,
        )
      ).status,
      201,
    );
    const reassigned = (
      await req("/api/state", "GET", undefined, admin)
    ).data.leads.find((l) => l.phone === "9876543211");
    await req(
      `/api/leads/${reassigned.id}/calls`,
      "POST",
      { outcome: "No Answer", notes: "First attempt" },
      sc,
    );
    await req(
      `/api/leads/${reassigned.id}`,
      "PATCH",
      { assignedTo: other.id },
      admin,
    );
    report = (await req("/api/analytics", "GET", undefined, sc)).data;
    assert.equal(report.totals.attempts, 2);
    assert.ok(!report.effort.some((l) => l.id === reassigned.id));
    assert.ok(
      report.calls.some(
        (c) => c.leadName === "Reassigned lead" && c.notes === "",
      ),
    );
    // Cancellation permits correcting a pending purchase without a false confirmed sale.
    await req(`/api/leads/${reassigned.id}/sale`, "POST", purchase, oc);
    assert.equal(
      (
        await req(
          `/api/leads/${reassigned.id}/cancel-sale`,
          "POST",
          { reason: "Wrong plan" },
          admin,
        )
      ).status,
      200,
    );
    assert.equal(
      (await req("/api/analytics", "GET", undefined, admin)).data.totals
        .awaitingApproval,
      0,
    );
    const archived = await req(
      `/api/services/${service.id}`,
      "PATCH",
      { active: false, expectedUpdatedAt: service.updatedAt },
      admin,
    );
    assert.equal(archived.status, 200);
    assert.equal(
      (
        await req(
          "/api/leads",
          "POST",
          { ...leadInput, phone: "9876543212" },
          admin,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await req(
          `/api/services/${service.id}`,
          "PATCH",
          { name: "Stale", expectedUpdatedAt: service.updatedAt },
          admin,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await req("/api/analytics", "GET", undefined, admin)
      ).data.byService.find((s) => s.id === service.id).confirmed,
      1,
    );
    const state = (await req("/api/state", "GET", undefined, admin)).data;
    assert.equal(state.clients.length, 1);
    assert.ok(state.activities.some((a) => a.text === "Sent brochure"));
  } finally {
    const stopped = new Promise((resolve) => server.once("exit", resolve));
    server.kill();
    await stopped;
    rmSync(dir, { recursive: true, force: true });
  }
});
