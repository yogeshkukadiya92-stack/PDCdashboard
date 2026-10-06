import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { phoneKey, istDay, salesReport } from "./crm-domain.js";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const id = (value) => {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,120}$/.test(value))
    throw new Error("Invalid record ID.");
  return value;
};
const text = (value, max = 5000) =>
  String(value ?? "")
    .trim()
    .slice(0, max);
const millis = (value, fallback = Date.now()) => {
  if (value == null) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > Date.now() + 300000)
    throw new Error("Invalid event time.");
  return n;
};
const schedule = (value) => {
  if (value == null) return "";
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 4102444800000)
    throw new Error("Invalid follow-up time.");
  return new Date(n).toISOString();
};
const stageIds = {
  New: "new",
  "Contact Attempted": "attempted",
  Connected: "contacted",
  Interested: "interested",
  "Proposal Sent": "proposal",
  Purchased: "won",
  "Not Interested": "lost",
  Deferred: "follow_up",
  "Invalid Number": "invalid",
};
const stageNames = {
  new: "New",
  attempted: "Contact Attempted",
  contacted: "Connected",
  qualified: "Interested",
  hot: "Interested",
  interested: "Interested",
  proposal: "Proposal Sent",
  won: "Proposal Sent",
  converted: "Proposal Sent",
  lost: "Not Interested",
  follow_up: "Deferred",
  invalid: "Invalid Number",
  no_answer: "Contact Attempted",
  busy: "Contact Attempted",
  out_of_network: "Contact Attempted",
  not_connected: "Contact Attempted",
  custom: "Connected",
};
const dispositions = [
  ["interested", "INTERESTED", "Interested", "interested", false, false],
  [
    "callback",
    "CALLBACK_REQUESTED",
    "Callback requested",
    "follow_up",
    false,
    true,
  ],
  ["follow_up", "FOLLOW_UP", "Follow-up", "follow_up", false, true],
  ["proposal_sent", "PROPOSAL_SENT", "Proposal sent", "proposal", false, true],
  [
    "payment_follow_up",
    "PAYMENT_FOLLOW_UP",
    "Payment follow-up",
    "proposal",
    false,
    true,
  ],
  ["not_interested", "NOT_INTERESTED", "Not interested", "lost", true, false],
  ["no_answer", "NO_ANSWER", "No answer", "attempted", false, false],
  ["busy", "BUSY", "Busy", "follow_up", false, true],
  ["wrong_number", "WRONG_NUMBER", "Wrong number", "invalid", true, false],
  [
    "converted",
    "CONVERTED",
    "Purchase awaiting admin verification",
    "proposal",
    false,
    false,
  ],
];

export function createCallFlowApi({
  db,
  rows,
  record,
  put,
  transaction,
  audit,
  verify,
  body,
  fail,
}) {
  db.exec(`CREATE TABLE IF NOT EXISTS callflow_sessions(access_hash TEXT PRIMARY KEY,refresh_hash TEXT UNIQUE NOT NULL,user_id TEXT NOT NULL,device_id TEXT NOT NULL,password_hash TEXT NOT NULL,access_expires INTEGER NOT NULL,refresh_expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS callflow_receipts(user_id TEXT NOT NULL,event_id TEXT NOT NULL,payload_hash TEXT NOT NULL,PRIMARY KEY(user_id,event_id));`);
  const attempts = new Map();
  const issue = (u, deviceId) => {
    const accessToken = randomBytes(32).toString("hex"),
      refreshToken = randomBytes(32).toString("hex");
    const accessExpires = Date.now() + 3600000,
      refreshExpires = Date.now() + 604800000;
    db.prepare("INSERT INTO callflow_sessions VALUES(?,?,?,?,?,?,?)").run(
      hash(accessToken),
      hash(refreshToken),
      u.id,
      deviceId,
      u.password,
      accessExpires,
      refreshExpires,
    );
    return {
      accessToken,
      refreshToken,
      expiresAt: new Date(accessExpires).toISOString(),
      offlineValidUntil: new Date(refreshExpires).toISOString(),
      employeeName: u.name,
      accountId: u.id,
      deviceId,
      status: "ACTIVE",
    };
  };
  const userFor = (session) => {
    const u =
      session &&
      db
        .prepare(
          "SELECT * FROM users WHERE id=? AND active=1 AND role IN ('admin','salesperson')",
        )
        .get(session.user_id);
    if (
      !u ||
      u.password !== session.password_hash ||
      session.refresh_expires <= Date.now()
    )
      fail("Session expired. Sign in again.", 401);
    return u;
  };
  const access = (req) => {
    const token = req.headers.authorization?.match(
      /^Bearer ([a-f0-9]{64})$/,
    )?.[1];
    const s =
      token &&
      db
        .prepare(
          "SELECT * FROM callflow_sessions WHERE access_hash=? AND access_expires>?",
        )
        .get(hash(token), Date.now());
    if (!s) fail("CallFlow sign-in required.", 401);
    return { session: s, user: userFor(s) };
  };
  const leadFor = (u, value) => {
    const l = record("leads", id(value));
    if (!l || (u.role !== "admin" && l.assignedTo !== u.id))
      fail("Assigned lead required.", 403);
    return l;
  };
  const updated = (lead) =>
    new Date(
      Math.max(Date.now(), Date.parse(lead.updatedAt) + 1),
    ).toISOString();
  const editable = (l) => {
    if (l.stage === "Purchased")
      fail("Purchase is confirmed. Lead changes require the dashboard.", 409);
  };
  const ownedCall = (u, value) => {
    const c = record("calls", id(value));
    if (!c || c.source !== "callflow" || c.actorId !== u.id)
      fail("Your CallFlow call is required.", 403);
    leadFor(u, c.leadId);
    return c;
  };
  function apply(u, deviceId, event) {
    id(event.eventUuid);
    id(event.entityId);
    const p =
      typeof event.payload?.raw === "string"
        ? JSON.parse(event.payload.raw)
        : event.payload;
    if (!p || typeof p !== "object" || Array.isArray(p))
      fail("Invalid event payload.");
    const type = event.entityType,
      op = event.operation;
    if (type === "CALL" && ["CREATE", "UPDATE"].includes(op)) {
      const matches = p.leadId
        ? []
        : rows("leads").filter(
            (l) =>
              phoneKey(p.phone).length >= 10 &&
              phoneKey(l.phone) === phoneKey(p.phone) &&
              (u.role === "admin" || l.assignedTo === u.id),
          );
      const l = leadFor(
          u,
          p.leadId || (matches.length === 1 ? matches[0].id : ""),
        ),
        callId = id(p.callId || event.entityId);
      if (callId !== event.entityId) fail("Call ID mismatch.");
      const existing = record("calls", callId);
      if (
        existing &&
        (existing.source !== "callflow" ||
          existing.actorId !== u.id ||
          existing.leadId !== l.id)
      )
        fail("Call belongs to another record.", 403);
      if (op === "UPDATE" && !existing)
        fail("Create the call before updating it.", 409);
      const startedAt = millis(
        p.startedAt ?? p.createdAt,
        existing?.startedAt ?? Date.now(),
      );
      const durationSeconds =
        p.durationSeconds == null
          ? existing?.durationSeconds || 0
          : Number(p.durationSeconds);
      if (
        !Number.isFinite(durationSeconds) ||
        durationSeconds < 0 ||
        durationSeconds > 86400
      )
        fail("Invalid call duration.");
      const endedAt =
        p.endedAt == null ? (existing?.endedAt ?? null) : millis(p.endedAt);
      if (endedAt != null && endedAt < startedAt)
        fail("Call end precedes call start.");
      const value = {
        ...existing,
        id: callId,
        leadId: l.id,
        actorId: u.id,
        actorName: u.name,
        source: "callflow",
        deviceId,
        startedAt,
        endedAt,
        durationSeconds,
        direction: p.direction || existing?.direction || "OUTGOING",
        outcome: existing?.dispositionCode
          ? existing.outcome
          : durationSeconds > 0
            ? "Connected"
            : existing?.outcome || "No Answer",
        notes: existing?.notes || "",
        createdAt: new Date(startedAt).toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (!["INCOMING", "OUTGOING"].includes(value.direction))
        fail("Invalid call direction.");
      put("calls", value);
    } else if (type === "CALL_DISPOSITION" && op === "CREATE") {
      const l = leadFor(u, p.leadId);
      editable(l);
      const c = ownedCall(u, p.callId);
      if (c.leadId !== l.id) fail("Call and lead do not match.");
      const code = text(
        p.dispositionCode || p.dispositionId,
        100,
      ).toUpperCase();
      if (!code) fail("Disposition is required.");
      const outcome = ["NO_ANSWER", "BUSY", "NOT_CONNECTED"].includes(code)
        ? "No Answer"
        : code === "OUT_OF_NETWORK"
          ? "Switched Off"
          : code === "WRONG_NUMBER"
            ? "Invalid Number"
            : "Connected";
      const item = dispositions.find(
        (d) => d[1] === code || d[0].toUpperCase() === code,
      );
      const stage =
        code === "WRONG_NUMBER"
          ? "Invalid Number"
          : ["NOT_ELIGIBLE", "NEGATIVE"].includes(code)
            ? "Not Interested"
            : code === "OUT_OF_NETWORK" || code === "NOT_CONNECTED"
              ? "Contact Attempted"
              : stageNames[item?.[3]] ||
                ([
                  "HOT",
                  "WARM",
                  "INTRO_ATTENDED",
                  "MEETING_COMPLETED",
                ].includes(code)
                  ? "Interested"
                  : "Connected");
      put("calls", {
        ...c,
        outcome,
        dispositionCode: code,
        notes: text(p.note) || `CallFlow: ${code}`,
        updatedAt: new Date().toISOString(),
      });
      put("leads", {
        ...l,
        stage,
        reason: ["Not Interested", "Invalid Number", "Deferred"].includes(stage)
          ? text(p.note) || code
          : "",
        updatedAt: updated(l),
      });
    } else if (type === "NOTE" && op === "CREATE") {
      const l = leadFor(u, p.leadId),
        note = text(p.body);
      if (!note) fail("Note is required.");
      const c = p.callId ? ownedCall(u, p.callId) : null;
      if (c && c.leadId !== l.id) fail("Call and lead do not match.");
      const existing = record("callflow_notes", event.entityId);
      if (existing) {
        if (
          existing.createdBy !== u.id ||
          existing.leadId !== l.id ||
          existing.body !== note
        )
          fail("Note ID already exists.", 409);
        return;
      }
      put("callflow_notes", {
        id: event.entityId,
        leadId: l.id,
        callId: c?.id || null,
        body: note,
        createdAt: millis(p.createdAt),
        createdBy: u.id,
        deviceId,
      });
      if (c && !c.notes.includes(note))
        put("calls", {
          ...c,
          notes: text([c.notes, note].filter(Boolean).join("\n")),
        });
      if (!c)
        put("leads", {
          ...l,
          notes: text([l.notes, note].filter(Boolean).join("\n")),
          updatedAt: updated(l),
        });
    } else if (type === "LEAD" && op === "UPDATE") {
      const l = leadFor(u, event.entityId);
      editable(l);
      const stage =
        p.stageId === "lost" && l.stage === "Invalid Number"
          ? "Invalid Number"
          : stageNames[p.stageId];
      if (!stage) fail("Unsupported lead stage.");
      put("leads", {
        ...l,
        stage,
        followUpAt: schedule(p.followUpAt),
        reason: ["Not Interested", "Deferred", "Invalid Number"].includes(stage)
          ? l.reason || "CallFlow status update"
          : "",
        updatedAt: updated(l),
      });
    } else if (
      type === "FOLLOW_UP" &&
      ["CREATE", "UPDATE", "CANCEL"].includes(op)
    ) {
      const l = leadFor(u, p.leadId);
      editable(l);
      const old =
        record("callflow_followups", event.entityId) ||
        (event.entityId === `pdc-${l.id}` && l.followUpAt
          ? {
              id: event.entityId,
              leadId: l.id,
              assignedTo: l.assignedTo,
              scheduledAt: Date.parse(l.followUpAt),
              createdAt: Date.parse(l.createdAt),
              version: Date.parse(l.updatedAt),
            }
          : null);
      if (old && (old.assignedTo !== u.id || old.leadId !== l.id))
        fail("Follow-up belongs to another record.", 403);
      if (op !== "CREATE" && !old) fail("Follow-up not found.", 404);
      if (op !== "CANCEL" && p.scheduledAt == null)
        fail("Follow-up date is required.");
      const scheduledAt =
        op === "CANCEL" ? old.scheduledAt : Number(p.scheduledAt);
      schedule(scheduledAt);
      if (!Number.isFinite(scheduledAt)) fail("Follow-up date is required.");
      const time = Math.max(Date.now(), (old?.version || 0) + 1);
      put("callflow_followups", {
        ...old,
        id: event.entityId,
        leadId: l.id,
        scheduledAt,
        note: text(p.note ?? old?.note),
        priority: 1,
        assignedTo: u.id,
        type: text(p.type || old?.type || "CALL", 100)
          .toUpperCase()
          .replaceAll(" ", "_"),
        status: op === "CANCEL" ? "CANCELLED" : "PENDING",
        createdAt: old?.createdAt || millis(p.createdAt),
        updatedAt: time,
        version: time,
      });
      const pending = rows("callflow_followups")
        .filter((f) => f.leadId === l.id && f.status === "PENDING")
        .sort((a, b) => a.scheduledAt - b.scheduledAt);
      put("leads", {
        ...l,
        followUpAt: pending.length ? schedule(pending[0].scheduledAt) : "",
        updatedAt: updated(l),
      });
    } else fail("Unsupported sync event.");
  }

  return async (req, url, json) => {
    if (!url.pathname.startsWith("/api/callflow/")) return false;
    const route = url.pathname.slice("/api/callflow/".length);
    if (
      req.headers.origin &&
      req.headers.origin !==
        `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`
    )
      fail("Request origin does not match.", 403);
    if (req.headers["x-callflow-connector"] !== "pdc-dashboard")
      fail("Use connector ID pdc-dashboard.", 400);
    db.prepare("DELETE FROM callflow_sessions WHERE refresh_expires<=?").run(
      Date.now(),
    );
    if (route === "auth/login" && req.method === "POST") {
      const b = await body(req),
        email = text(b.identity, 254).toLowerCase();
      const key = hash(email),
        attempt = attempts.get(key);
      if (attempt?.until > Date.now() && attempt.count >= 8)
        fail("Try again in 15 minutes.", 429);
      const u = db
        .prepare(
          "SELECT * FROM users WHERE email=? AND active=1 AND role IN ('admin','salesperson')",
        )
        .get(email);
      if (
        !u ||
        typeof b.password !== "string" ||
        b.password.length > 200 ||
        !verify(b.password, u.password)
      ) {
        if (attempts.size > 10000) attempts.clear();
        attempts.set(key, {
          count: attempt?.until > Date.now() ? attempt.count + 1 : 1,
          until: Date.now() + 900000,
        });
        fail("Email or password is incorrect.", 401);
      }
      attempts.delete(key);
      const installId = id(b.installId || "callflow");
      const deviceId = hash(`${u.id}:${installId}`).slice(0, 40);
      put("callflow_devices", {
        id: deviceId,
        userId: u.id,
        name: text(b.deviceName, 120),
        lastSyncAt: "",
        seenLeads: [],
        seenFollowups: [],
      });
      json(issue(u, deviceId));
      return true;
    }
    if (route === "auth/refresh" && req.method === "POST") {
      const b = await body(req);
      if (
        typeof b.refreshToken !== "string" ||
        !/^[a-f0-9]{64}$/.test(b.refreshToken)
      )
        fail("Session expired.", 401);
      const s = db
        .prepare("SELECT * FROM callflow_sessions WHERE refresh_hash=?")
        .get(hash(b.refreshToken));
      const u = userFor(s);
      const tokens = transaction(() => {
        db.prepare("DELETE FROM callflow_sessions WHERE access_hash=?").run(
          s.access_hash,
        );
        return issue(u, s.device_id);
      });
      json(tokens);
      return true;
    }
    const { user: u, session } = access(req);
    const device = record("callflow_devices", session.device_id);
    if (route === "auth/logout" && req.method === "POST") {
      db.prepare("DELETE FROM callflow_sessions WHERE access_hash=?").run(
        session.access_hash,
      );
      json({ ok: true });
      return true;
    }
    if (route === "devices/register" && req.method === "POST") {
      json({ deviceId: session.device_id, status: "ACTIVE" });
      return true;
    }
    if (route === "crm/status" && req.method === "GET") {
      json({
        connectorId: "pdc-dashboard",
        dashboardName: "PDC Dashboard",
        status: "CONNECTED",
        syncDirection: "TWO_WAY",
        lastSuccessfulSyncAt: device.lastSyncAt || null,
        capabilities: [
          "LEAD_PULL",
          "CALL_PUSH",
          "NOTE_PUSH",
          "FOLLOW_UP_PUSH",
          "DISPOSITION_PUSH",
        ],
      });
      return true;
    }
    if (route === "sync/batch" && req.method === "POST") {
      const b = await body(req);
      if (
        b.deviceId !== session.device_id ||
        !Array.isArray(b.events) ||
        b.events.length > 100
      )
        fail("Invalid device or batch size.");
      const acceptedEventIds = [],
        failedEventIds = [];
      for (const event of b.events) {
        try {
          const eventId = id(event?.eventUuid),
            digest = hash(
              JSON.stringify([
                event.entityType,
                event.entityId,
                event.operation,
                event.payload,
              ]),
            );
          transaction(() => {
            const old = db
              .prepare(
                "SELECT payload_hash FROM callflow_receipts WHERE user_id=? AND event_id=?",
              )
              .get(u.id, eventId);
            if (old) {
              if (
                !timingSafeEqual(
                  Buffer.from(old.payload_hash),
                  Buffer.from(digest),
                )
              )
                fail("Event ID reused with different data.", 409);
              return;
            }
            apply(u, session.device_id, event);
            db.prepare("INSERT INTO callflow_receipts VALUES(?,?,?)").run(
              u.id,
              eventId,
              digest,
            );
            audit(u, "callflow_synced", event.entityId);
          });
          acceptedEventIds.push(eventId);
        } catch {
          failedEventIds.push(text(event?.eventUuid, 120));
        }
      }
      const time = new Date().toISOString();
      put("callflow_devices", { ...device, lastSyncAt: time });
      // Batch never advances the pull cursor: a following pull must still retrieve applied changes.
      json({
        acceptedEventIds,
        failedEventIds,
        nextSyncCursor: b.lastSyncCursor || null,
        serverTimestamp: time,
      });
      return true;
    }
    if (route === "sync/changes" && req.method === "GET") {
      const leads = rows("leads").filter(
          (l) => u.role === "admin" || l.assignedTo === u.id,
        ),
        ids = new Set(leads.map((l) => l.id));
      const calls = rows("calls").filter(
        (c) => ids.has(c.leadId) && (u.role === "admin" || c.actorId === u.id),
      );
      const notes = rows("callflow_notes").filter(
        (n) =>
          ids.has(n.leadId) && (u.role === "admin" || n.createdBy === u.id),
      );
      const followUps = rows("callflow_followups")
        .filter(
          (f) =>
            ids.has(f.leadId) && (u.role === "admin" || f.assignedTo === u.id),
        )
        .map((f) => {
          const lead = leads.find((l) => l.id === f.leadId);
          return ["Purchased", "Not Interested", "Invalid Number"].includes(
            lead.stage,
          ) && f.status === "PENDING"
            ? {
                ...f,
                status: "CANCELLED",
                version: Math.max(f.version, Date.parse(lead.updatedAt)),
                updatedAt: Math.max(f.updatedAt, Date.parse(lead.updatedAt)),
              }
            : f;
        });
      // Full snapshots support assignment removals and avoid missed changes from equal timestamps.
      const generated = leads
        .filter(
          (l) =>
            l.followUpAt &&
            l.stage !== "Purchased" &&
            !followUps.some((f) => f.leadId === l.id && f.status === "PENDING"),
        )
        .map((l) => ({
          id: `pdc-${l.id}`,
          leadId: l.id,
          scheduledAt: Date.parse(l.followUpAt),
          note: l.notes || "",
          priority: 1,
          assignedTo: l.assignedTo,
          type: "CALL",
          status: "PENDING",
          createdAt: Date.parse(l.createdAt),
          updatedAt: Date.parse(l.updatedAt),
          version: Date.parse(l.updatedAt),
        }));
      const allFollowups = [...followUps, ...generated];
      const time = new Date().toISOString();
      json({
        leads: leads.map((l) => ({
          id: l.id,
          serverId: l.id,
          name: l.name,
          company: null,
          city: l.city || null,
          normalizedPhone: phoneKey(l.phone),
          displayPhone: l.phone,
          stageId: stageIds[l.stage] || "new",
          assignedUserId: l.assignedTo || "",
          assignedTo: l.assignedTo || null,
          campaignId: null,
          nextFollowUpAt: l.followUpAt ? Date.parse(l.followUpAt) : null,
          updatedAt: Date.parse(l.updatedAt),
          updatedBy: "pdc-dashboard",
          version: Date.parse(l.updatedAt),
          createdAt: Date.parse(l.createdAt),
          doNotCall: ["Purchased", "Not Interested", "Invalid Number"].includes(
            l.stage,
          ),
          interest: l.service,
          sourceDetails: [l.source],
        })),
        calls: calls.map((c) => ({
          id: c.id,
          serverId: c.id,
          leadId: c.leadId,
          employeeId: c.actorId,
          campaignId: null,
          normalizedPhone: phoneKey(
            leads.find((l) => l.id === c.leadId)?.phone,
          ),
          direction: c.direction || "OUTGOING",
          startedAt: c.startedAt ?? Date.parse(c.createdAt),
          answeredAt:
            c.durationSeconds > 0
              ? (c.endedAt || c.startedAt) - c.durationSeconds * 1000
              : null,
          endedAt: c.endedAt ?? null,
          failureReason: c.outcome === "Connected" ? null : c.outcome,
        })),
        callEvents: [],
        notes,
        followUps: allFollowups,
        leadStages: Object.entries(stageIds).map(([name, stage], i) => ({
          id: stage,
          code: stage.toUpperCase(),
          name,
          sortOrder: i,
          active: true,
        })),
        dispositions: dispositions.map(
          (
            [id, code, name, targetStageId, requiresNote, requiresFollowUp],
            sortOrder,
          ) => ({
            id,
            code,
            name,
            targetStageId,
            requiresNote,
            requiresFollowUp,
            sortOrder,
            active: true,
            icon: null,
          }),
        ),
        appConfiguration: [],
        deletedLeadIds: (device.seenLeads || []).filter((x) => !ids.has(x)),
        deletedFollowUpIds: (device.seenFollowups || []).filter(
          (x) => !allFollowups.some((f) => f.id === x),
        ),
        nextCursor: time,
        serverTimestamp: time,
      });
      put("callflow_devices", {
        ...device,
        seenLeads: [...new Set([...(device.seenLeads || []), ...ids])],
        seenFollowups: [
          ...new Set([
            ...(device.seenFollowups || []),
            ...allFollowups.map((f) => f.id),
          ]),
        ],
        lastSyncAt: time,
      });
      return true;
    }
    if (route === "availability" && ["GET", "POST"].includes(req.method)) {
      if (req.method === "POST") {
        const b = await body(req);
        if (typeof b.acceptingLeads !== "boolean") fail("Choose availability.");
        put("callflow_devices", {
          ...device,
          acceptingLeads: b.acceptingLeads,
          changedAt: new Date().toISOString(),
        });
      }
      const current = record("callflow_devices", session.device_id);
      json({
        acceptingLeads: current.acceptingLeads ?? true,
        changedAt: current.changedAt || null,
      });
      return true;
    }
    if (route === "engagement/config" && req.method === "GET") {
      json({
        whatsappTemplate: "Hello {{name}}, following up about PDC counselling.",
        salespersonName: u.name,
        noteTemplates: [
          "Interested in counselling",
          "Call back requested",
          "Plan details shared",
        ],
      });
      return true;
    }
    if (route === "performance/today" && req.method === "GET") {
      const day = istDay(new Date());
      const r = salesReport([u], rows("leads"), rows("calls"), rows("sales"), {
        from: day,
        to: day,
        salesperson: u.id,
      })[0];
      const todayCalls = rows("calls").filter(
        (c) => c.actorId === u.id && istDay(c.createdAt) === day,
      );
      const connected = todayCalls.filter(
        (c) => c.outcome === "Connected",
      ).length;
      json({
        date: day,
        callTarget: 0,
        connectedTarget: 0,
        calls: todayCalls.length,
        connected,
        connectionRate: todayCalls.length
          ? Math.round((connected / todayCalls.length) * 100)
          : 0,
        talkTimeSeconds: todayCalls.reduce(
          (a, c) => a + (c.durationSeconds || 0),
          0,
        ),
        conversions: r?.buyers || 0,
        followUpsDue: r?.due || 0,
        callTargetPercent: 0,
        connectedTargetPercent: 0,
        leaderboardRank: 0,
        leaderboardSize: 0,
      });
      return true;
    }
    fail("This CallFlow feature is not supported by PDC.", 404);
  };
}
