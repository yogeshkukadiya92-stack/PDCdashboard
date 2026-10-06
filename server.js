import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateLead,
  validateSale,
  outcomes,
  salesReport,
  phoneKey,
} from "./crm-domain.js";
const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(root, "data");
mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, "pdc.sqlite"));
db.exec(
  "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
);
db.exec(`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,role TEXT NOT NULL,password TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS records(kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(kind,id));
CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL,action TEXT NOT NULL,record_id TEXT NOT NULL,created_at TEXT NOT NULL);`);
const now = () => new Date().toISOString();
const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  active: !!u.active,
});
const rows = (kind) =>
  db
    .prepare("SELECT data FROM records WHERE kind=?")
    .all(kind)
    .map((r) => JSON.parse(r.data));
const record = (kind, id) => {
  const r = db
    .prepare("SELECT data FROM records WHERE kind=? AND id=?")
    .get(kind, id);
  return r ? JSON.parse(r.data) : null;
};
const put = (kind, data) =>
  db
    .prepare(
      "INSERT INTO records(kind,id,data) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data",
    )
    .run(kind, data.id, JSON.stringify(data));
const audit = (u, action, id) =>
  db
    .prepare("INSERT INTO audit VALUES(?,?,?,?,?)")
    .run(randomUUID(), u.id, action, id, now());
function transaction(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
function passwordHash(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
function verify(password, hash) {
  const [salt, key] = hash.split(":");
  const actual = scryptSync(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(key, "hex"));
}
function passwordValid(p) {
  if (typeof p !== "string" || p.length < 5 || p.length > 200)
    throw new Error("Use a password with 5–200 characters.");
}
function addUser(input) {
  const email = String(input.email || "")
    .trim()
    .toLowerCase();
  const name = String(input.name || "").trim();
  if (!/^\S+@\S+\.\S+$/.test(email) || !name || name.length > 120)
    throw new Error("Enter a name and valid email.");
  if (!["admin", "salesperson", "nutritionist"].includes(input.role))
    throw new Error("Choose a valid role.");
  passwordValid(input.password);
  const id = randomUUID();
  db.prepare(
    "INSERT INTO users(id,name,email,role,password) VALUES(?,?,?,?,?)",
  ).run(id, name, email, input.role, passwordHash(input.password));
  return publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(id));
}
if (
  !db.prepare("SELECT id FROM users LIMIT 1").get() &&
  process.env.ADMIN_EMAIL &&
  process.env.ADMIN_PASSWORD
) {
  addUser({
    name: process.env.ADMIN_NAME || "PDC Admin",
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    role: "admin",
  });
}
const loginAttempts = new Map();
function fail(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  throw e;
}
function admin(u) {
  if (u.role !== "admin") fail("Admin access required.", 403);
}
function leadAccess(u, id) {
  const lead = record("leads", id);
  if (!lead) fail("Lead not found.", 404);
  if (
    u.role === "nutritionist" ||
    (u.role === "salesperson" && lead.assignedTo !== u.id)
  )
    fail("This lead is not assigned to you.", 403);
  return lead;
}
function body(req) {
  return new Promise((resolve, reject) => {
    let text = "";
    req.on("data", (chunk) => {
      text += chunk;
      if (Buffer.byteLength(text) > 2_000_000) {
        reject(
          Object.assign(new Error("Request is too large."), { status: 413 }),
        );
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(new Error("Invalid JSON."));
      }
    });
    req.on("error", reject);
  });
}
const hashToken = (t) => createHash("sha256").update(t).digest("hex");
function userFor(req) {
  const token = (req.headers.cookie || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("pdc_session="))
    ?.slice(12);
  if (!token) return null;
  const session = db
    .prepare("SELECT * FROM sessions WHERE token=? AND expires>?")
    .get(hashToken(token), Date.now());
  if (!session) return null;
  return db
    .prepare("SELECT * FROM users WHERE id=? AND active=1")
    .get(session.user_id);
}
function cookie(req, token, maxAge) {
  const secure =
    req.socket.encrypted || req.headers["x-forwarded-proto"] === "https";
  return `pdc_session=${token}; Path=/; HttpOnly; SameSite=Strict;${secure ? " Secure;" : ""}${maxAge ? ` Max-Age=${maxAge};` : ""}`;
}
function snapshot(u) {
  const allLeads = rows("leads");
  const leads =
    u.role === "admin"
      ? allLeads
      : u.role === "salesperson"
        ? allLeads.filter((l) => l.assignedTo === u.id)
        : [];
  const ids = new Set(leads.map((l) => l.id));
  const sales =
    u.role === "admin"
      ? rows("sales")
      : rows("sales").filter((s) => ids.has(s.leadId));
  return {
    user: publicUser(u),
    users: db
      .prepare("SELECT * FROM users")
      .all()
      .map(publicUser)
      .filter((x) => u.role === "admin" || x.id === u.id),
    leads,
    calls: rows("calls").filter((c) => ids.has(c.leadId)),
    sales,
    clients:
      u.role === "admin"
        ? rows("clients")
        : u.role === "nutritionist"
          ? rows("clients").filter((c) => c.nutritionist === u.name)
          : [],
    audit:
      u.role === "admin"
        ? db
            .prepare("SELECT * FROM audit ORDER BY created_at DESC LIMIT 100")
            .all()
        : [],
  };
}
const staticFiles = new Set([
  "index.html",
  "app.js",
  "crm.js",
  "styles.css",
  "crm.css",
]);
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;
  const json = (data, status = 200) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(data));
  };
  try {
    if (p === "/api/health") return json({ ok: true });
    if (p.startsWith("/api/")) {
      if (
        !["GET", "HEAD"].includes(req.method) &&
        req.headers.origin &&
        req.headers.origin !==
          `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`
      )
        fail("Request origin does not match.", 403);
      if (p === "/api/auth/status" && req.method === "GET")
        return json({
          configured: !!db.prepare("SELECT id FROM users LIMIT 1").get(),
        });
      if (p === "/api/auth/login" && req.method === "POST") {
        const input = await body(req);
        const key = String(input.email || "")
          .trim()
          .toLowerCase();
        const attempt = loginAttempts.get(key) || { count: 0, until: 0 };
        if (attempt.until > Date.now() && attempt.count >= 8)
          fail("Too many attempts. Try again in 15 minutes.", 429);
        const u = db
          .prepare("SELECT * FROM users WHERE email=? AND active=1")
          .get(key);
        if (
          !u ||
          typeof input.password !== "string" ||
          input.password.length > 200 ||
          !verify(input.password, u.password)
        ) {
          loginAttempts.set(key, {
            count: attempt.until > Date.now() ? attempt.count + 1 : 1,
            until: Date.now() + 900000,
          });
          fail("Incorrect email or password.", 401);
        }
        loginAttempts.delete(key);
        db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
        const token = randomBytes(32).toString("hex");
        const age = input.remember ? 604800 : 43200;
        db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
          hashToken(token),
          u.id,
          Date.now() + age * 1000,
        );
        res.setHeader(
          "Set-Cookie",
          cookie(req, token, input.remember ? age : 0),
        );
        return json({ user: publicUser(u) });
      }
      const u = userFor(req);
      if (!u) fail("Please log in.", 401);
      if (p === "/api/auth/logout" && req.method === "POST") {
        db.prepare("DELETE FROM sessions WHERE token=?").run(
          hashToken(
            (req.headers.cookie || "")
              .split(";")
              .map((s) => s.trim())
              .find((s) => s.startsWith("pdc_session="))
              ?.slice(12) || "",
          ),
        );
        res.setHeader("Set-Cookie", cookie(req, "", -1));
        return json({ ok: true });
      }
      if (p === "/api/auth/password" && req.method === "POST") {
        const b = await body(req);
        if (!verify(String(b.currentPassword || ""), u.password))
          fail("Current password is incorrect.");
        passwordValid(b.password);
        db.prepare("UPDATE users SET password=? WHERE id=?").run(
          passwordHash(b.password),
          u.id,
        );
        db.prepare("DELETE FROM sessions WHERE user_id=?").run(u.id);
        audit(u, "password_changed", u.id);
        return json({ ok: true });
      }
      if (p === "/api/state" && req.method === "GET") return json(snapshot(u));
      if (p === "/api/users" && req.method === "POST") {
        admin(u);
        const b = await body(req);
        const created = transaction(() => {
          if (
            b.role === "nutritionist" &&
            !["Dr Luv Patel", "Dt Nilesh Lakhani"].includes(b.name)
          )
            fail(
              "Use the assigned nutritionist name: Dr Luv Patel or Dt Nilesh Lakhani.",
            );
          const user = addUser(b);
          audit(u, "user_created", user.id);
          return user;
        });
        return json(created, 201);
      }
      const userMatch = p.match(/^\/api\/users\/([^/]+)$/);
      if (userMatch && req.method === "PATCH") {
        admin(u);
        const b = await body(req);
        const target = db
          .prepare("SELECT * FROM users WHERE id=?")
          .get(userMatch[1]);
        if (!target) fail("User not found.", 404);
        if (b.password) passwordValid(b.password);
        if (b.active === false && target.id === u.id)
          fail("You cannot disable your own account.");
        transaction(() => {
          if (b.password) {
            db.prepare("UPDATE users SET password=? WHERE id=?").run(
              passwordHash(b.password),
              target.id,
            );
            db.prepare("DELETE FROM sessions WHERE user_id=?").run(target.id);
          }
          if (typeof b.active === "boolean") {
            db.prepare("UPDATE users SET active=? WHERE id=?").run(
              b.active ? 1 : 0,
              target.id,
            );
            db.prepare("DELETE FROM sessions WHERE user_id=?").run(target.id);
          }
          audit(
            u,
            b.password ? "user_password_reset" : "user_access_changed",
            target.id,
          );
        });
        return json({ ok: true });
      }
      if (p === "/api/reports" && req.method === "GET") {
        if (u.role === "nutritionist")
          fail("Sales report access required.", 403);
        const users = db.prepare("SELECT * FROM users").all().map(publicUser);
        return json(
          salesReport(users, rows("leads"), rows("calls"), rows("sales"), {
            from: url.searchParams.get("from") || "",
            to: url.searchParams.get("to") || "",
            salesperson:
              u.role === "salesperson"
                ? u.id
                : url.searchParams.get("salesperson") || "",
          }),
        );
      }
      if (p === "/api/leads" && req.method === "POST") {
        if (u.role === "nutritionist") fail("Sales access required.", 403);
        const b = await body(req);
        const lead = validateLead({
          ...b,
          assignedTo: u.role === "salesperson" ? u.id : b.assignedTo,
        });
        if (
          lead.assignedTo &&
          !db
            .prepare(
              "SELECT id FROM users WHERE id=? AND role='salesperson' AND active=1",
            )
            .get(lead.assignedTo)
        )
          fail("Choose an active salesperson.");
        if (rows("leads").some((l) => phoneKey(l.phone) === lead.phone))
          fail("A lead with this mobile number already exists.", 409);
        const value = {
          ...lead,
          id: randomUUID(),
          createdAt: now(),
          updatedAt: now(),
        };
        transaction(() => {
          put("leads", value);
          audit(u, "lead_created", value.id);
        });
        return json(value, 201);
      }
      const match = p.match(
        /^\/api\/leads\/([^/]+)(?:\/(calls|sale|confirm))?$/,
      );
      if (match) {
        let lead = leadAccess(u, match[1]);
        const action = match[2];
        const b = await body(req);
        lead = leadAccess(u, match[1]);
        if (b.expectedUpdatedAt && b.expectedUpdatedAt !== lead.updatedAt)
          fail("This lead changed. Refresh and try again.", 409);
        if (!action && req.method === "PATCH") {
          if (lead.stage === "Purchased")
            fail("Purchased leads cannot be edited.");
          const update = validateLead({
            ...lead,
            ...b,
            assignedTo:
              u.role === "salesperson"
                ? lead.assignedTo
                : (b.assignedTo ?? lead.assignedTo),
          });
          if (
            update.assignedTo &&
            !db
              .prepare(
                "SELECT id FROM users WHERE id=? AND role='salesperson' AND active=1",
              )
              .get(update.assignedTo)
          )
            fail("Choose an active salesperson.");
          if (
            rows("leads").some(
              (l) => l.id !== lead.id && phoneKey(l.phone) === update.phone,
            )
          )
            fail("A lead with this mobile number already exists.", 409);
          lead = { ...lead, ...update, updatedAt: now() };
          transaction(() => {
            put("leads", lead);
            audit(u, "lead_updated", lead.id);
          });
          return json(lead);
        }
        if (action === "calls" && req.method === "POST") {
          if (lead.stage === "Purchased")
            fail("This lead has already purchased.");
          if (!outcomes.includes(b.outcome)) fail("Choose a call outcome.");
          if (!String(b.notes || "").trim())
            fail("Add a short note about this call.");
          const update = validateLead({
            ...lead,
            stage:
              b.stage ||
              (b.outcome === "Connected"
                ? "Connected"
                : b.outcome === "Invalid Number"
                  ? "Invalid Number"
                  : "Contact Attempted"),
            reason: b.reason || lead.reason,
            followUpAt: b.followUpAt || "",
          });
          const call = {
            id: randomUUID(),
            leadId: lead.id,
            actorId: u.id,
            actorName: u.name,
            outcome: b.outcome,
            notes: String(b.notes).trim().slice(0, 5000),
            createdAt: now(),
            followUpAt: update.followUpAt,
            stage: update.stage,
          };
          transaction(() => {
            put("calls", call);
            put("leads", { ...lead, ...update, updatedAt: now() });
            audit(u, "call_logged", lead.id);
          });
          return json(call, 201);
        }
        if (action === "sale" && req.method === "POST") {
          if (
            lead.stage === "Purchased" ||
            rows("sales").some((s) => s.leadId === lead.id)
          )
            fail("A purchase already exists for this lead.", 409);
          if (!lead.assignedTo)
            fail("Assign a salesperson before recording a purchase.");
          const saleInput = validateSale(b);
          if (saleInput.confirmed && u.role !== "admin")
            fail("Admin must confirm payment.", 403);
          const sale = {
            ...saleInput,
            id: randomUUID(),
            leadId: lead.id,
            salespersonId: lead.assignedTo,
            createdAt: now(),
            confirmedAt: saleInput.confirmed ? now() : "",
            clientId: randomUUID(),
          };
          transaction(() => {
            put("sales", sale);
            if (sale.confirmedAt) convert(lead, sale);
            audit(u, "purchase_recorded", lead.id);
          });
          return json(sale, 201);
        }
        if (action === "confirm" && req.method === "POST") {
          admin(u);
          const sale = rows("sales").find((s) => s.leadId === lead.id);
          if (!sale) fail("Purchase not found.", 404);
          if (sale.confirmedAt) fail("Purchase is already confirmed.", 409);
          sale.confirmedAt = now();
          sale.confirmed = true;
          transaction(() => {
            put("sales", sale);
            convert(lead, sale);
            audit(u, "payment_confirmed", lead.id);
          });
          return json(sale);
        }
      }
      if (p === "/api/clients" && req.method === "PUT") {
        admin(u);
        const b = await body(req);
        if (
          !Array.isArray(b.clients) ||
          b.clients.length > 10000 ||
          !Array.isArray(b.deleted) ||
          b.deleted.length > 10000
        )
          fail("Invalid client data.");
        transaction(() => {
          for (const c of b.clients) {
            if (
              typeof c.id !== "string" ||
              !/^[a-zA-Z0-9_-]{1,120}$/.test(c.id) ||
              !c.name ||
              (c.phone != null && typeof c.phone !== "string")
            )
              fail("Invalid client.");
            const existing = record("clients", c.id);
            if (existing && (existing.revision || 0) !== (c.revision || 0))
              fail(
                "Another user changed this client. Refresh before editing.",
                409,
              );
            if (
              !Number.isFinite(Number(c.serviceAmount)) ||
              !Number.isFinite(Number(c.receivedAmount)) ||
              Number(c.receivedAmount) < 0 ||
              (Number(c.receivedAmount) > Number(c.serviceAmount) && !(existing && Number(existing.receivedAmount) === Number(c.receivedAmount) && Number(existing.serviceAmount) === Number(c.serviceAmount)))
            )
              fail("Invalid payment amounts.");
            put("clients", { ...c, revision: (existing?.revision || 0) + 1 });
            const sale = rows("sales").find((s) => s.clientId === c.id);
            if (sale) {
              sale.received = Number(c.receivedAmount);
              sale.amount = Number(c.serviceAmount);
              put("sales", sale);
            }
          }
          for (const item of b.deleted) {
            const existing = record("clients", item.id);
            if (existing && (existing.revision || 0) !== (item.revision || 0))
              fail("Client was changed by another user. Refresh first.", 409);
            if (rows("sales").some((s) => s.clientId === item.id))
              fail(
                "Clients linked to a CRM purchase must be retained. Mark the client completed instead.",
              );
            db.prepare("DELETE FROM records WHERE kind=? AND id=?").run(
              "clients",
              item.id,
            );
          }
          audit(u, "clients_saved", "clients");
        });
        return json({ clients: rows("clients") });
      }
      if (p === "/api/clients/migrate" && req.method === "POST") {
        admin(u);
        const b = await body(req);
        if (!Array.isArray(b.clients) || b.clients.length > 10000)
          fail("Invalid client backup.");
        if (rows("clients").length)
          fail(
            "Server already contains clients. Import through the Clients backup workflow.",
            409,
          );
        transaction(() => {
          for (const c of b.clients) {
            if (
              typeof c.id !== "string" ||
              !/^[a-zA-Z0-9_-]{1,120}$/.test(c.id) ||
              !c.name ||
              (c.phone != null && typeof c.phone !== "string")
            )
              fail("Invalid client backup.");
            put("clients", c);
          }
          audit(u, "clients_migrated", "clients");
        });
        return json({ ok: true, count: b.clients.length });
      }
      if (p === "/api/backup" && req.method === "GET") {
        admin(u);
        return json({ ...snapshot(u), version: 2, exportedAt: now() });
      }
      fail("Endpoint not found.", 404);
    }
    if (!["GET", "HEAD"].includes(req.method)) fail("Method not allowed.", 405);
    const file = p === "/" ? "index.html" : p.slice(1);
    if (!staticFiles.has(file) && !/^assets\/[a-zA-Z0-9_.-]+$/.test(file))
      fail("Not found.", 404);
    const target = path.join(root, file);
    if (!existsSync(target)) fail("Not found.", 404);
    const types = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".webp": "image/webp",
      ".png": "image/png",
    };
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
    });
    res.end(req.method === "HEAD" ? "" : readFileSync(target));
  } catch (e) {
    json(
      {
        error: e.message.includes("UNIQUE constraint")
          ? "This email already exists."
          : e.status
            ? e.message
            : e.message.includes("constraint")
              ? "Unable to save this record."
              : e.message,
      },
      e.status || 400,
    );
  }
});
function convert(lead, sale) {
  put("leads", {
    ...lead,
    stage: "Purchased",
    followUpAt: "",
    updatedAt: now(),
  });
  const start = new Date(`${sale.startDate}T00:00:00Z`);
  const end = new Date(start);
  const targetMonth = end.getUTCMonth() + sale.months;
  end.setUTCDate(1);
  end.setUTCMonth(targetMonth);
  const last = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
  ).getUTCDate();
  end.setUTCDate(Math.min(start.getUTCDate(), last));
  end.setUTCDate(end.getUTCDate() - 1);
  put("clients", {
    id: sale.clientId,
    name: lead.name,
    phone: lead.phone,
    planMonths: sale.months,
    serviceAmount: sale.amount,
    receivedAmount: sale.received,
    paymentMode: sale.paymentMode,
    startDate: sale.startDate,
    endDate: end.toISOString().slice(0, 10),
    meetingDate: sale.startDate,
    nutritionist: sale.nutritionist,
    status: "Active",
    notes: `CRM: ${sale.plan}`,
    createdAt: now(),
    crmLeadId: lead.id,
  });
}
server.listen(Number(process.env.PORT || 3000), "0.0.0.0", () =>
  console.log(`PDC server ready on port ${process.env.PORT || 3000}`),
);
