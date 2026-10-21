import { test } from "node:test";
import assert from "node:assert/strict";
import { createCalendar } from "../calendar.js";
import { randomBytes } from "node:crypto";
test("Google Calendar OAuth, isolation, encrypted tokens and idempotent meeting lifecycle", async () => {
  const records = new Map(),
    events = new Map();
  let breakNetwork = false,
    insertCount = 0;
  const rows = (k) =>
    [...records.values()]
      .filter((x) => x.kind === k)
      .map((x) => structuredClone(x.value));
  const record = (k, id) =>
    structuredClone(records.get(k + ":" + id)?.value || null);
  const put = (k, v) =>
    records.set(k + ":" + v.id, { kind: k, value: structuredClone(v) });
  const u = { id: "admin", role: "admin", active: 1 };
  const env = {
    GOOGLE_CLIENT_ID: "client",
    GOOGLE_CLIENT_SECRET: "secret",
    GOOGLE_REDIRECT_URI: "https://example.com/api/calendar/callback",
    GOOGLE_CALENDAR_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  };
  const scopes =
    "https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events";
  const request = async (url, opts = {}) => {
    if (breakNetwork) throw new Error("network failure");
    if (url.includes("oauth2.googleapis.com"))
      return Response.json({
        access_token: "private-access",
        refresh_token: "private-refresh",
        expires_in: 3600,
        scope: scopes,
      });
    if (url.includes("calendarList"))
      return Response.json(
        url.includes("calendarList/")
          ? { id: "primary@example.com", summary: "Sales", accessRole: "owner" }
          : {
              items: [
                {
                  id: "primary@example.com",
                  summary: "Sales",
                  accessRole: "owner",
                },
              ],
            },
      );
    const id = url.split("/events/")[1];
    if (opts.method === "DELETE") {
      events.delete(id);
      return new Response(null, { status: 204 });
    }
    const b = JSON.parse(opts.body);
    if (opts.method === "PUT") {
      if (!events.has(id)) return new Response(null, { status: 404 });
      events.set(id, b);
    }
    if (opts.method === "POST") {
      insertCount++;
      if (events.has(b.id)) return new Response(null, { status: 409 });
      events.set(b.id, b);
    }
    return Response.json({
      htmlLink: "https://www.google.com/calendar/event?id=demo",
    });
  };
  const cal = createCalendar(
    {
      rows,
      record,
      put,
      db: {
        prepare: (sql) => ({
          get: () => u,
          run: (k, id) => records.delete(k + ":" + id),
        }),
      },
      body: async (r) => r.payload,
      fail: (m, status) => {
        throw Object.assign(new Error(m), { status });
      },
      audit: () => {},
      leadAccess: () => {},
    },
    { env, request },
  );
  async function call(action, payload = {}, user = u, method = "POST") {
    let output,
      headers = {};
    const res = { setHeader: (k, v) => (headers[k] = v) };
    await cal.route(
      { method, payload },
      new URL("https://example.com/api/calendar" + action),
      user,
      (v) => (output = v),
      res,
    );
    return { output, headers };
  }
  const connect = await call("/connect", { label: "Work" }),
    auth = new URL(connect.output.authorizationUrl);
  assert.equal(auth.searchParams.get("code_challenge_method"), "S256");
  assert.equal(auth.searchParams.get("access_type"), "offline");
  const state = auth.searchParams.get("state");
  const callback = new URL(
    "https://example.com/api/calendar/callback?state=" + state + "&code=code",
  );
  await assert.rejects(
    () => cal.callback({ headers: {} }, callback, {}),
    /expired/,
  );
  let location;
  await cal.callback(
    { headers: { cookie: connect.headers["Set-Cookie"].split(";")[0] } },
    callback,
    { writeHead: (s, h) => (location = h.Location), end: () => {} },
  );
  assert.match(location, /connected/);
  await assert.rejects(
    () =>
      cal.callback(
        { headers: { cookie: connect.headers["Set-Cookie"] } },
        callback,
        {},
      ),
    /expired/,
  );
  const c = rows("calendarConnections")[0];
  assert.ok(c);
  assert.ok(!c.secret.includes("private"));
  const info = (await call("", {}, u, "GET")).output;
  assert.equal(info.connections[0].secret, undefined);
  await assert.rejects(
    () =>
      call(
        "/select",
        { connectionId: c.id, calendarId: "primary@example.com" },
        { id: "other", role: "salesperson" },
      ),
    /not found/,
  );
  await call("/select", {
    connectionId: c.id,
    calendarId: "primary@example.com",
  });
  let m = (
    await call("/meeting", {
      connectionId: c.id,
      title: "Consultation",
      start: "2026-10-25T10:00:00+05:30",
      end: "2026-10-25T10:30:00+05:30",
    })
  ).output;
  assert.equal(m.syncStatus, "synced");
  assert.equal(m.start, "2026-10-25T04:30:00.000Z");
  assert.equal(events.size, 1);
  await assert.rejects(
    () => call("/cancel", { id: m.id }, { id: "other", role: "salesperson" }),
    /not found/,
  );
  breakNetwork = true;
  m = (
    await call("/meeting", {
      ...m,
      title: "Rescheduled",
      start: "2026-10-26T10:00:00+05:30",
      end: "2026-10-26T10:30:00+05:30",
    })
  ).output;
  assert.equal(m.syncStatus, "failed");
  assert.equal(record("meetings", m.id).title, "Rescheduled");
  await assert.rejects(
    () => call("/disconnect", { connectionId: c.id }),
    /pending/,
  );
  breakNetwork = false;
  m = (await call("/retry", { id: m.id })).output;
  assert.equal(m.syncStatus, "synced");
  assert.equal(events.size, 1);
  assert.equal(insertCount, 1);
  assert.equal(events.get(m.eventId).summary, "Rescheduled");
  m = (await call("/cancel", { id: m.id })).output;
  assert.equal(m.syncStatus, "synced");
  assert.equal(events.size, 0);
  await assert.rejects(() => call("/meeting", { ...m }), /Cancelled/);
  await call("/disconnect", { connectionId: c.id });
  assert.equal(rows("calendarConnections").length, 0);
});
test("Google Calendar clearly reports missing configuration", async () => {
  const cal = createCalendar(
    {
      rows: () => [],
      record: () => null,
      fail: (m) => {
        throw new Error(m);
      },
      body: async () => ({}),
    },
    { env: {} },
  );
  let status;
  await cal.route(
    { method: "GET" },
    new URL("https://example.com/api/calendar"),
    { id: "u", role: "salesperson" },
    (v) => (status = v),
    {},
  );
  assert.equal(status.configured, false);
  await assert.rejects(
    () =>
      cal.route(
        { method: "POST" },
        new URL("https://example.com/api/calendar/connect"),
        { id: "u", role: "salesperson" },
        () => {},
        {},
      ),
    /setup/,
  );
});
