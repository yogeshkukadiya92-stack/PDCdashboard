import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("CallFlow Android contract syncs assigned leads, calls, dispositions and follow-ups safely", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "pdc-callflow-"));
  const server = spawn(process.execPath, ["server.js"], {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: {
      ...process.env,
      PORT: "18474",
      DATA_DIR: dir,
      ADMIN_EMAIL: "admin@example.com",
      ADMIN_PASSWORD: "12345",
    },
  });
  try {
    await new Promise((resolve, reject) => {
      server.stdout.once("data", resolve);
      server.once("exit", (code) =>
        reject(new Error(`Startup failed: ${code}`)),
      );
    });
    const request = async (
      route,
      method = "GET",
      data,
      token = "",
      cookie = "",
    ) => {
      const res = await fetch(`http://127.0.0.1:18474${route}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-CallFlow-Connector": "pdc-dashboard",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
      return {
        status: res.status,
        data: await res.json(),
        cookie: res.headers.get("set-cookie")?.split(";")[0],
      };
    };
    const admin = (
      await request("/api/auth/login", "POST", {
        email: "admin@example.com",
        password: "12345",
      })
    ).cookie;
    const createUser = async (name, email, role = "salesperson") =>
      (
        await request(
          "/api/users",
          "POST",
          { name, email, role, password: "12345" },
          "",
          admin,
        )
      ).data;
    const seller = await createUser("CallFlow seller", "seller@example.com");
    const other = await createUser("Other seller", "other@example.com");
    await createUser("Dr Luv Patel", "doctor@example.com", "nutritionist");
    assert.equal(
      (
        await request("/api/callflow/auth/login", "POST", {
          identity: "doctor@example.com",
          password: "12345",
        })
      ).status,
      401,
    );
    const createLead = async (name, phone, assignedTo) =>
      (
        await request(
          "/api/leads",
          "POST",
          { name, phone, assignedTo },
          "",
          admin,
        )
      ).data;
    const lead = await createLead("Assigned buyer", "9876543210", seller.id);
    const hidden = await createLead("Other buyer", "9876543211", other.id);
    const login = await request("/api/callflow/auth/login", "POST", {
      identity: seller.email,
      password: "12345",
      installId: "android-test",
    });
    assert.equal(login.status, 200);
    let tokens = login.data;
    assert.equal(tokens.status, "ACTIVE");
    assert.equal(tokens.accountId, seller.id);
    const status = await request(
      "/api/callflow/crm/status",
      "GET",
      undefined,
      tokens.accessToken,
    );
    assert.equal(status.data.connectorId, "pdc-dashboard");
    const delta = await request(
      "/api/callflow/sync/changes",
      "GET",
      undefined,
      tokens.accessToken,
    );
    assert.deepEqual(
      delta.data.leads.map((l) => l.id),
      [lead.id],
    );
    assert.equal(delta.data.leads[0].normalizedPhone, "9876543210");
    assert.ok(delta.data.dispositions.length);
    assert.ok(delta.data.nextCursor);
    const event = (
      eventUuid,
      entityType,
      entityId,
      payload,
      operation = "CREATE",
    ) => ({
      eventUuid,
      entityType,
      entityId,
      operation,
      payload: { raw: JSON.stringify(payload) },
    });
    const time = Date.now() - 60000;
    const events = [
      event("call-uuid", "CALL", "android-call", {
        callId: "android-call",
        leadId: lead.id,
        startedAt: time,
        endedAt: time + 30000,
        durationSeconds: 30,
        direction: "OUTGOING",
      }),
      event("disposition-uuid", "CALL_DISPOSITION", "disposition-one", {
        leadId: lead.id,
        callId: "android-call",
        dispositionCode: "INTERESTED",
        note: "Interested in PDC",
      }),
      event("note-uuid", "NOTE", "note-one", {
        leadId: lead.id,
        callId: "android-call",
        body: "Call back tomorrow",
        createdAt: time + 30000,
      }),
      event(
        "lead-uuid",
        "LEAD",
        lead.id,
        { stageId: "follow_up", followUpAt: Date.now() + 86400000 },
        "UPDATE",
      ),
      event("followup-uuid", "FOLLOW_UP", "followup-one", {
        leadId: lead.id,
        scheduledAt: Date.now() + 86400000,
        note: "Call back",
        type: "Call",
        createdAt: time,
      }),
      event("hidden-uuid", "CALL", "hidden-call", { leadId: hidden.id }),
      event("bad-uuid", "CALL", "bad-call", {
        leadId: lead.id,
        startedAt: "invalid",
      }),
    ];
    const batch = () =>
      request(
        "/api/callflow/sync/batch",
        "POST",
        {
          deviceId: tokens.deviceId,
          lastSyncCursor: delta.data.nextCursor,
          events,
        },
        tokens.accessToken,
      );
    const synced = await batch();
    assert.equal(synced.status, 200);
    assert.deepEqual(
      synced.data.acceptedEventIds,
      events.slice(0, 5).map((e) => e.eventUuid),
    );
    assert.deepEqual(synced.data.failedEventIds, ["hidden-uuid", "bad-uuid"]);
    assert.deepEqual(
      (await batch()).data.acceptedEventIds,
      synced.data.acceptedEventIds,
    );
    let state = (await request("/api/state", "GET", undefined, "", admin)).data;
    assert.equal(state.calls.length, 1);
    assert.equal(state.calls[0].actorId, seller.id);
    assert.equal(state.calls[0].outcome, "Connected");
    assert.ok(state.calls[0].notes.includes("Call back tomorrow"));
    assert.equal(state.leads.find((l) => l.id === lead.id).stage, "Deferred");
    assert.equal(state.clients.length, 0);
    const pulled = (
      await request(
        "/api/callflow/sync/changes",
        "GET",
        undefined,
        tokens.accessToken,
      )
    ).data;
    assert.equal(pulled.calls[0].startedAt, time);
    assert.equal(pulled.followUps.length, 1);
    assert.equal(pulled.notes.length, 1);
    const performance = (
      await request(
        "/api/callflow/performance/today",
        "GET",
        undefined,
        tokens.accessToken,
      )
    ).data;
    assert.equal(performance.calls, 1);
    assert.equal(performance.connected, 1);
    assert.equal(performance.talkTimeSeconds, 30);
    const report = (
      await request("/api/reports", "GET", undefined, "", admin)
    ).data.find((r) => r.id === seller.id);
    assert.equal(report.attempts, 1);
    assert.equal(report.connected, 1);
    const changed = structuredClone(events[0]);
    changed.payload.raw = JSON.stringify({
      leadId: lead.id,
      durationSeconds: 99,
    });
    assert.deepEqual(
      (
        await request(
          "/api/callflow/sync/batch",
          "POST",
          { deviceId: tokens.deviceId, events: [changed] },
          tokens.accessToken,
        )
      ).data.failedEventIds,
      ["call-uuid"],
    );
    assert.equal(
      (
        await request(
          "/api/callflow/sync/batch",
          "POST",
          { deviceId: "someone-else", events: [] },
          tokens.accessToken,
        )
      ).status,
      400,
    );
    const sendEvents = (items) =>
      request(
        "/api/callflow/sync/batch",
        "POST",
        { deviceId: tokens.deviceId, events: items },
        tokens.accessToken,
      );
    const rescheduled = event(
      "reschedule",
      "FOLLOW_UP",
      "followup-one",
      { leadId: lead.id, scheduledAt: Date.now() + 172800000 },
      "UPDATE",
    );
    assert.deepEqual((await sendEvents([rescheduled])).data.failedEventIds, []);
    const converted = event(
      "converted-outcome",
      "CALL_DISPOSITION",
      "converted-disposition",
      {
        leadId: lead.id,
        callId: "android-call",
        dispositionCode: "CONVERTED",
        note: "Customer wants to buy",
      },
    );
    assert.deepEqual((await sendEvents([converted])).data.failedEventIds, []);
    state = (await request("/api/state", "GET", undefined, "", admin)).data;
    assert.equal(state.clients.length, 0);
    assert.equal(
      state.leads.find((l) => l.id === lead.id).stage,
      "Proposal Sent",
    );
    const phoneMatched = event("phone-match", "CALL", "phone-call", {
      phone: lead.phone,
      startedAt: time,
      durationSeconds: 0,
      direction: "INCOMING",
    });
    assert.deepEqual(
      (await sendEvents([phoneMatched])).data.failedEventIds,
      [],
    );
    const unmatched = event("unmatched", "CALL", "unmatched-call", {
      phone: "9999900000",
      startedAt: time,
    });
    assert.deepEqual((await sendEvents([unmatched])).data.failedEventIds, [
      "unmatched",
    ]);
    const scheduledLead = await createLead(
      "Dashboard follow-up",
      "9876543212",
      seller.id,
    );
    await request(
      `/api/leads/${scheduledLead.id}`,
      "PATCH",
      { followUpAt: new Date(Date.now() + 86400000).toISOString() },
      "",
      admin,
    );
    let extraDelta = (
      await request(
        "/api/callflow/sync/changes",
        "GET",
        undefined,
        tokens.accessToken,
      )
    ).data;
    const syntheticId = `pdc-${scheduledLead.id}`;
    assert.ok(extraDelta.followUps.some((f) => f.id === syntheticId));
    const cancelled = event(
      "cancel-dashboard-followup",
      "FOLLOW_UP",
      syntheticId,
      { leadId: scheduledLead.id },
      "CANCEL",
    );
    assert.deepEqual((await sendEvents([cancelled])).data.failedEventIds, []);
    extraDelta = (
      await request(
        "/api/callflow/sync/changes",
        "GET",
        undefined,
        tokens.accessToken,
      )
    ).data;
    assert.equal(
      extraDelta.followUps.find((f) => f.id === syntheticId).status,
      "CANCELLED",
    );
    await request(
      `/api/leads/${scheduledLead.id}`,
      "PATCH",
      { assignedTo: other.id },
      "",
      admin,
    );
    const refreshed = await request("/api/callflow/auth/refresh", "POST", {
      refreshToken: tokens.refreshToken,
    });
    assert.equal(refreshed.status, 200);
    assert.equal(
      (
        await request(
          "/api/callflow/crm/status",
          "GET",
          undefined,
          tokens.accessToken,
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await request("/api/callflow/auth/refresh", "POST", {
          refreshToken: tokens.refreshToken,
        })
      ).status,
      401,
    );
    tokens = refreshed.data;
    assert.equal(
      (
        await request(
          `/api/leads/${lead.id}`,
          "PATCH",
          { assignedTo: other.id },
          "",
          admin,
        )
      ).status,
      200,
    );
    const removed = (
      await request(
        "/api/callflow/sync/changes",
        "GET",
        undefined,
        tokens.accessToken,
      )
    ).data;
    assert.deepEqual(removed.leads, []);
    assert.ok(removed.deletedLeadIds.includes(lead.id));
    assert.ok(removed.deletedFollowUpIds.includes("followup-one"));
    const retryRemoved = (
      await request(
        "/api/callflow/sync/changes",
        "GET",
        undefined,
        tokens.accessToken,
      )
    ).data;
    assert.ok(retryRemoved.deletedLeadIds.includes(lead.id));
    assert.ok(retryRemoved.deletedFollowUpIds.includes("followup-one"));
    assert.equal(
      (
        await request(
          `/api/users/${seller.id}`,
          "PATCH",
          { password: "67890" },
          "",
          admin,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          "/api/callflow/crm/status",
          "GET",
          undefined,
          tokens.accessToken,
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await request("/api/callflow/auth/refresh", "POST", {
          refreshToken: tokens.refreshToken,
        })
      ).status,
      401,
    );
  } finally {
    server.kill();
    await new Promise((resolve) => server.once("exit", resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});
