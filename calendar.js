import {
  randomBytes,
  randomUUID,
  createHash,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
const hash = (v) => createHash("sha256").update(v).digest("hex");
const scopes = [
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];
export function createCalendar(
  { db, rows, record, put, body, fail, audit, leadAccess },
  { env = process.env, request = fetch } = {},
) {
  const key = Buffer.from(env.GOOGLE_CALENDAR_ENCRYPTION_KEY || "", "base64");
  const ready = () =>
    !!(
      env.GOOGLE_CLIENT_ID &&
      env.GOOGLE_CLIENT_SECRET &&
      env.GOOGLE_REDIRECT_URI &&
      key.length === 32
    );
  const locks = new Set();
  const remove = (kind, id) =>
    db.prepare("DELETE FROM records WHERE kind=? AND id=?").run(kind, id);
  function seal(value) {
    const iv = randomBytes(12),
      c = createCipheriv("aes-256-gcm", key, iv);
    return Buffer.concat([
      iv,
      c.update(JSON.stringify(value)),
      c.final(),
      c.getAuthTag(),
    ]).toString("base64");
  }
  function unseal(value) {
    const b = Buffer.from(value, "base64"),
      c = createDecipheriv("aes-256-gcm", key, b.subarray(0, 12));
    c.setAuthTag(b.subarray(-16));
    return JSON.parse(
      Buffer.concat([c.update(b.subarray(12, -16)), c.final()]).toString(),
    );
  }
  async function token(params) {
    const r = await request("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        ...params,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok)
      throw new Error(
        "Google authorization expired or failed. Reconnect your calendar.",
      );
    return r.json();
  }
  async function google(c, path, options = {}) {
    if (!ready()) fail("Google Calendar server setup is required.", 503);
    let t = unseal(c.secret);
    if (!t.expires || t.expires < Date.now() + 60000) {
      const next = await token({
        grant_type: "refresh_token",
        refresh_token: t.refresh_token,
      });
      t = { ...t, ...next, expires: Date.now() + next.expires_in * 1000 };
      c.secret = seal(t);
      put("calendarConnections", c);
    }
    return request("https://www.googleapis.com/calendar/v3/" + path, {
      ...options,
      headers: {
        Authorization: "Bearer " + t.access_token,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15000),
    });
  }
  const own = (u, id) => {
    const c = record("calendarConnections", id);
    if (!c || c.ownerId !== u.id) fail("Calendar connection not found.", 404);
    return c;
  };
  const safe = (c) => ({
    id: c.id,
    label: c.label,
    calendarId: c.calendarId,
    calendarName: c.calendarName,
  });
  async function sync(m, u) {
    const c = own(u, m.connectionId);
    if (!c.calendarId || c.calendarId !== m.calendarId)
      fail("Reconnect the original calendar before retrying.", 409);
    const path = "calendars/" + encodeURIComponent(m.calendarId) + "/events";
    try {
      let r;
      if (m.cancelled) {
        r = await google(c, path + "/" + m.eventId, { method: "DELETE" });
        if (!r.ok && ![404, 410].includes(r.status)) throw new Error();
      } else {
        const event = {
          summary: m.title,
          description: m.notes,
          location: m.location,
          start: { dateTime: m.start, timeZone: "Asia/Kolkata" },
          end: { dateTime: m.end, timeZone: "Asia/Kolkata" },
        };
        // Stable Google-compatible ID makes retries safe after uncertain network outcomes.
        r = await google(c, path + "/" + m.eventId, {
          method: "PUT",
          body: JSON.stringify(event),
        });
        if (r.status === 404) {
          r = await google(c, path, {
            method: "POST",
            body: JSON.stringify({ ...event, id: m.eventId }),
          });
          if (r.status === 409)
            r = await google(c, path + "/" + m.eventId, {
              method: "PUT",
              body: JSON.stringify(event),
            });
        }
        if (!r.ok) throw new Error();
        const result = await r.json();
        m.googleUrl = result.htmlLink || "";
      }
      m.syncStatus = "synced";
      m.syncError = "";
    } catch {
      m.syncStatus = "failed";
      m.syncError =
        "Saved here, but Google sync failed. Check your connection and retry.";
    }
    m.updatedAt = new Date().toISOString();
    put("meetings", m);
    return m;
  }
  async function callback(req, url, res) {
    if (url.pathname !== "/api/calendar/callback") return false;
    const state = url.searchParams.get("state") || "";
    const s = record("calendarOAuth", hash(state));
    const browser = (req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("pdc_calendar_oauth="))
      ?.split("=")[1];
    if (!s || s.expires < Date.now() || !browser || s.browser !== hash(browser))
      fail("Calendar connection expired. Start again from the dashboard.", 400);
    remove("calendarOAuth", s.id);
    const u = db
      .prepare("SELECT * FROM users WHERE id=? AND active=1")
      .get(s.ownerId);
    if (!u || u.role === "nutritionist") fail("Account is unavailable.", 403);
    let result = "connected";
    try {
      if (url.searchParams.has("error") || !url.searchParams.get("code"))
        throw new Error();
      const t = await token({
        grant_type: "authorization_code",
        code: url.searchParams.get("code"),
        redirect_uri: env.GOOGLE_REDIRECT_URI,
        code_verifier: s.verifier,
      });
      if (
        !t.refresh_token ||
        !scopes.every((x) => (t.scope || "").split(" ").includes(x))
      )
        throw new Error();
      const old = s.connectionId ? own(u, s.connectionId) : null;
      const c = {
        id: old?.id || randomUUID(),
        ownerId: u.id,
        label: s.label,
        calendarId: old?.calendarId || "",
        calendarName: old?.calendarName || "",
        secret: seal({ ...t, expires: Date.now() + t.expires_in * 1000 }),
      };
      if (c.calendarId) {
        const r = await google(
          c,
          "users/me/calendarList/" + encodeURIComponent(c.calendarId),
        );
        if (!r.ok || !["owner", "writer"].includes((await r.json()).accessRole))
          throw new Error();
      }
      put("calendarConnections", c);
      audit(u, "google_calendar_connected", u.id);
    } catch {
      result = "failed";
    }
    res.writeHead(303, {
      Location: "/?calendar=" + result + "#view-operations",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "Set-Cookie":
        "pdc_calendar_oauth=; Path=/api/calendar/callback; HttpOnly; SameSite=Lax; Max-Age=0; Secure",
    });
    res.end();
    return true;
  }
  async function route(req, url, u, json, res) {
    if (!url.pathname.startsWith("/api/calendar")) return false;
    if (u.role === "nutritionist") fail("Sales account required.", 403);
    const action = url.pathname.slice("/api/calendar".length);
    if (req.method === "GET" && action === "") {
      json({
        configured: ready(),
        connections: rows("calendarConnections")
          .filter((c) => c.ownerId === u.id)
          .map(safe),
        meetings: rows("meetings").filter(
          (m) => u.role === "admin" || m.ownerId === u.id,
        ),
      });
      return true;
    }
    if (req.method !== "POST") fail("Method not allowed.", 405);
    const b = await body(req);
    if (action === "/connect") {
      if (!ready())
        fail(
          "Google Calendar server setup is required. See the setup guide.",
          503,
        );
      const existing = b.connectionId ? own(u, b.connectionId) : null;
      const state = randomBytes(32).toString("hex"),
        browser = randomBytes(32).toString("hex"),
        verifier = randomBytes(32).toString("base64url");
      for (const s of rows("calendarOAuth"))
        if (s.expires < Date.now()) remove("calendarOAuth", s.id);
      put("calendarOAuth", {
        id: hash(state),
        ownerId: u.id,
        connectionId: existing?.id,
        browser: hash(browser),
        verifier,
        label: String(b.label || existing?.label || "Google Calendar").slice(
          0,
          100,
        ),
        expires: Date.now() + 600000,
      });
      res.setHeader(
        "Set-Cookie",
        `pdc_calendar_oauth=${browser}; Path=/api/calendar/callback; HttpOnly; SameSite=Lax; Max-Age=600; Secure`,
      );
      const q = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: env.GOOGLE_REDIRECT_URI,
        response_type: "code",
        scope: scopes.join(" "),
        access_type: "offline",
        prompt: "consent",
        state,
        code_challenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
        code_challenge_method: "S256",
      });
      json({
        authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?" + q,
      });
      return true;
    }
    if (action === "/calendars") {
      const c = own(u, b.connectionId),
        calendars = [];
      let pageToken = "";
      do {
        const r = await google(
          c,
          "users/me/calendarList?minAccessRole=writer&maxResults=250" +
            (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : ""),
        );
        if (!r.ok)
          fail("Unable to load calendars. Reconnect your Google account.", 502);
        const p = await r.json();
        calendars.push(
          ...(p.items || []).map((x) => ({ id: x.id, name: x.summary })),
        );
        pageToken = p.nextPageToken;
      } while (pageToken);
      json({ calendars });
      return true;
    }
    if (action === "/select") {
      const c = own(u, b.connectionId);
      if (
        rows("meetings").some((m) => m.connectionId === c.id && (!m.cancelled || m.syncStatus !== "synced")) &&
        c.calendarId !== b.calendarId
      )
        fail(
          "This connection has meetings. Add another connection to use a different calendar.",
          409,
        );
      const r = await google(
        c,
        "users/me/calendarList/" + encodeURIComponent(String(b.calendarId)),
      );
      if (!r.ok) fail("Calendar unavailable.", 400);
      const cal = await r.json();
      if (!["owner", "writer"].includes(cal.accessRole))
        fail("Choose a calendar you can edit.", 403);
      c.calendarId = cal.id;
      c.calendarName = cal.summary;
      put("calendarConnections", c);
      json(safe(c));
      return true;
    }
    if (action === "/disconnect") {
      const c = own(u, b.connectionId);
      if (
        rows("meetings").some(
          (m) => m.connectionId === c.id && m.syncStatus !== "synced",
        )
      )
        fail("Retry pending meeting changes before disconnecting.", 409);
      remove("calendarConnections", c.id);
      audit(u, "google_calendar_disconnected", c.id);
      json({ ok: true });
      return true;
    }
    if (["/meeting", "/retry", "/cancel"].includes(action)) {
      const previous = b.id ? record("meetings", b.id) : null;
      if (b.id && (!previous || previous.ownerId !== u.id))
        fail("Meeting not found.", 404);
      if (action !== "/meeting" && !previous) fail("Meeting required.", 400);
      const id = previous?.id || randomUUID();
      if (locks.has(id))
        fail("This meeting is syncing. Try again shortly.", 409);
      locks.add(id);
      try {
        let m = previous;
        if (action === "/meeting") {
          if (previous?.cancelled)
            fail("Cancelled meetings cannot be edited.", 409);
          const c = own(u, previous?.connectionId || b.connectionId);
          if (!c.calendarId) fail("Choose a Google calendar first.", 400);
          const start = new Date(b.start),
            end = new Date(b.end),
            title = String(b.title || "").trim();
          if (
            !title ||
            title.length > 200 ||
            !Number.isFinite(start.getTime()) ||
            !Number.isFinite(end.getTime()) ||
            end <= start ||
            end - start > 7 * 86400000
          )
            fail(
              "Enter a title and valid start/end times (maximum 7 days).",
              400,
            );
          if (b.leadId) leadAccess(u, b.leadId);
          m = {
            ...previous,
            id,
            ownerId: u.id,
            connectionId: c.id,
            calendarId: c.calendarId,
            eventId: previous?.eventId || "pdc" + id.replaceAll("-", ""),
            title,
            start: start.toISOString(),
            end: end.toISOString(),
            notes: String(b.notes || "").slice(0, 3000),
            location: String(b.location || "").slice(0, 300),
            leadId: b.leadId || "",
            cancelled: false,
          };
        }
        if (action === "/cancel") m = { ...m, cancelled: true };
        own(u, m.connectionId);
        m.syncStatus = "pending";
        put("meetings", m);
        const result = await sync(m, u);
        audit(u, "calendar_meeting_" + action.slice(1), id);
        json(result);
      } finally {
        locks.delete(id);
      }
      return true;
    }
    fail("Endpoint not found.", 404);
  }
  return { route, callback };
}
