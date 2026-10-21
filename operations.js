/* Operations workspace: server scopes every record and validates every mutation. */
(() => {
  let state,
    data,
    tab = "work",
    month = new Date()
      .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
      .slice(0, 7);
  const e = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const money = (v) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(v || 0);
  const btn = (a, t, id = "") =>
    `<button class="ghost-button" type="button" data-ops="${a}" data-id="${e(id)}">${e(t)}</button>`;
  const field = (label, control) => `<label>${e(label)}${control}</label>`;
  const input = (name, value = "", type = "text", extra = "") =>
    `<input name="${name}" value="${e(value)}" type="${type}" ${extra}>`;
  const opts = (list, value) =>
    list
      .map(
        (x) =>
          `<option value="${e(x.id)}" ${x.id === value ? "selected" : ""}>${e(x.name)}</option>`,
      )
      .join("");
  const select = (name, list, value = "", blank = "") =>
    `<select name="${name}">${blank ? `<option value="">${e(blank)}</option>` : ""}${opts(
      list.map((x) => (typeof x === "string" ? { id: x, name: x } : x)),
      value,
    )}</select>`;
  const table = (heads, rows) =>
    `<div class="crm-table-wrap"><table class="crm-table"><thead><tr>${heads.map((h) => `<th>${e(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${heads.length}">No records yet.</td></tr>`}</tbody></table></div>`;
  const user = (id) =>
    data.users.find((u) => u.id === id)?.name || "Unassigned";
  const service = (id) =>
    state.services.find((s) => s.id === id)?.name || "All services";
  const admin = () => currentUser.role === "admin",
    manager = () => ["admin", "teamleader"].includes(currentUser.role);
  const seenAlerts = new Set();
  const post = (action, b) =>
    api("/api/operations/" + action, {
      method: "POST",
      body: JSON.stringify(b),
    });
  function dialog(title, html, submit, handler) {
    const d = document.querySelector("#crmDialog");
    if (d.open) d.close();
    d.innerHTML = `<div class="crm-dialog-heading"><h3>${e(title)}</h3>${btn("close", "Close")}</div><form id="opsForm">${html}<p id="opsError" role="alert"></p><div class="crm-dialog-footer">${btn("close", "Cancel")}<button class="primary-button" type="submit">${e(submit)}</button></div></form>`;
    d.showModal();
    d.querySelector("form").onsubmit = async (event) => {
      event.preventDefault();
      const button = event.submitter;
      button.disabled = true;
      try {
        const result = await handler(
          Object.fromEntries(new FormData(event.target)),
          event.target,
        );
        d.close();
        await window.crmRefresh();
        if (result?.token) {
          dialog(
            "Copy your intake token",
            `<p>This token allows creation of leads. Keep it in your form server or automation; never embed it in a public page.</p>${field("Token", input("token", result.token, "text", "readonly"))}`,
            "Done",
            async () => {},
          );
        }
        if (result?.url) {
          dialog(
            "WhatsApp draft ready",
            `<p>The message is saved as a draft. Sending happens in WhatsApp.</p><a class="primary-button" href="${e(result.url)}" target="_blank" rel="noopener noreferrer">Open WhatsApp</a>`,
            "Done",
            async () => {},
          );
        }
      } catch (err) {
        d.querySelector("#opsError").textContent = err.message;
      } finally {
        button.disabled = false;
      }
    };
  }
  async function refresh(s) {
    if (s) state = s;
    if (!state || currentUser.role === "nutritionist") return;
    data = await api("/api/operations?month=" + month);
    await window.calendarRefresh?.(state);
    if (new URLSearchParams(location.search).has("calendar")) {
      tab = "calendar";
      showToast(
        new URLSearchParams(location.search).get("calendar") === "connected"
          ? "Google connected. Choose a calendar to finish setup."
          : "Google connection was not completed. Try connecting again.",
      );
      history.replaceState(null, "", location.pathname + location.hash);
    }
    render();
    const nav = document.querySelector('[data-view="view-operations"] span');
    if (nav)
      nav.textContent =
        "Operations" +
        (data.alerts.length ? " (" + data.alerts.length + ")" : "");
    if (
      localStorage.getItem("pdc-ops-alerts") === "on" &&
      "Notification" in window &&
      Notification.permission === "granted"
    )
      for (const a of data.alerts) {
        const key =
          currentUser.id + ":" + a.id + ":" + a.at + ":" + a.escalated;
        if (!seenAlerts.has(key)) {
          seenAlerts.add(key);
          new Notification(
            a.escalated ? "Follow-up escalated" : "Follow-up due",
            { body: a.name + " — " + a.type, tag: key },
          );
        }
      }
  }
  window.operationsRefresh = refresh;
  function render() {
    const tabs = [
      ["work", "Follow-ups & priorities"],
      ["targets", "Targets"],
      ["delivery", "Delivery"],
      ["renewals", "Renewals"],
      ["commission", "Commission"],
      ["messages", "WhatsApp"],
      ["calendar", "Meetings & Calendar"],
    ];
    if (admin()) tabs.push(["setup", "Settings & integrations"]);
    let content = "";
    if (tab === "calendar") content = '<div id="calendarWorkspace"></div>';
    if (tab === "work")
      content = `${btn("alerts", "Enable browser follow-up alerts")}<p>Alerts update while the dashboard is open. Escalated items appear for the team leader and admin after ${e(data.settings.escalationHours)} hours. External notifications are not connected.</p><h3>Follow-up alerts (${data.alerts.length})</h3>${table(
        ["Lead", "Owner", "Alert", "Due (IST)", "Escalation", "Action"],
        data.alerts.map((a) => [
          e(a.name),
          e(user(a.ownerId)),
          e(a.type),
          e(
            new Date(a.at).toLocaleString("en-IN", {
              timeZone: "Asia/Kolkata",
            }),
          ),
          a.escalated ? "Escalated" : "Due",
          btn("open-lead", "Open", a.leadId),
        ]),
      )}<h3>Lead priority & assignment</h3>${table(
        ["Lead", "Service", "Priority", "Salesperson", "Action"],
        data.leads
          .filter(
            (l) =>
              !["Purchased", "Not Interested", "Invalid Number"].includes(
                l.stage,
              ),
          )
          .map((l) => [
            e(l.name),
            e(l.service),
            e(l.priority || "Warm"),
            e(user(l.assignedTo)),
            btn("open-lead", "Open", l.id) +
              (manager() ? btn("assign", "Assign", l.id) : ""),
          ]),
      )}<h3>Lost / deferred reasons</h3>${table(
        ["Reason", "Leads"],
        Object.entries(data.lossReasons).map(([r, n]) => [e(r), n]),
      )}`;
    if (tab === "targets")
      content = `${manager() ? btn("target", "Set target") : ""}<p>Daily calls are today's calls within the selected month; other totals are for that month. Service value uses confirmed purchases.</p>${table(
        [
          "Salesperson / service",
          "Daily calls",
          "Monthly calls",
          "Sales",
          "Service value",
        ],
        data.targets.map((t) => [
          e(user(t.salespersonId)) +
            "<small>" +
            e(service(t.serviceId)) +
            "</small>",
          `${t.todayCalls} / ${t.dailyCalls}`,
          `${t.callsActual} / ${t.monthlyCalls}`,
          `${t.salesActual} / ${t.monthlySales}`,
          `${money(t.revenueActual)} / ${money(t.monthlyRevenue)}`,
        ]),
      )}`;
    if (tab === "delivery")
      content = `<p>Confirmed purchases enter onboarding automatically. Track tasks and the responsible delivery leader here.</p>${table(
        ["Client", "Service", "Owner", "Status", "Tasks", "Action"],
        data.deliveries.map((d) => [
          e(data.leads.find((l) => l.id === d.leadId)?.name),
          e(service(d.serviceId)),
          e(d.ownerName || user(d.ownerId)),
          e(d.status),
          `${d.tasks.filter((t) => t.done).length} / ${d.tasks.length}`,
          manager() ? btn("delivery", "Update", d.id) : "",
        ]),
      )}`;
    if (tab === "renewals")
      content = `<p>Services ending within ${e(data.settings.renewalDays)} days and overdue renewals. Marking Renewed tracks the outcome; record the new purchase/payment separately.</p>${table(
        ["Client", "Service", "Ends on", "Status", "Next follow-up", "Action"],
        data.renewals.map((r) => [
          e(r.name),
          e(r.serviceName),
          e(r.endsOn),
          e(r.status || "Pending"),
          e(r.nextDate || "—"),
          btn("renewal", "Update", r.id),
        ]),
      )}`;
    if (tab === "commission")
      content = `<p>All-time commission earned on received money, using the rate locked when the purchase is confirmed. Payment entries here record payments already made; they do not transfer money. Older purchases without a rate earn 0%.</p>${table(
        [
          "Client / service",
          "Salesperson",
          "Received",
          "Rate",
          "Earned",
          "Paid",
          "Balance",
          "Action",
        ],
        data.commissions.map((c) => [
          e(c.name) + "<small>" + e(c.serviceName) + "</small>",
          e(user(c.salespersonId)),
          money(c.received),
          e(c.rate) + "%",
          money(c.earned),
          money(c.paid),
          money(c.balance),
          admin() && c.balance > 0
            ? btn("commission-paid", "Record paid", c.saleId)
            : "",
        ]),
      )}`;
    if (tab === "messages")
      content = `<p>${data.integrations?.whatsapp ? "WhatsApp API configured. Delivery is not confirmed by provider acceptance." : "Manual WhatsApp drafts are available. Automatic WhatsApp sending is not connected."} Send follow-ups from a lead's Open screen.</p>${admin() ? btn("template", "Add template") : ""}${table(
        ["Template", "Message"],
        data.templates.map((t) => [e(t.name), e(t.content)]),
      )}<h3>Message history</h3>${table(
        ["Lead", "Time", "Status", "Message"],
        data.messages.map((m) => [
          e(data.leads.find((l) => l.id === m.leadId)?.name),
          e(new Date(m.createdAt).toLocaleString()),
          e(m.status),
          e(m.content),
        ]),
      )}`;
    if (tab === "setup" && admin())
      content = `<div class="crm-row-actions">${btn("settings", "Assignment & alerts")}${btn("assign-unassigned", "Assign unassigned leads")}${btn("commission-rule", "Service commission rate")}</div><p>Assignment: <strong>${e(data.settings.assignment)}</strong> · Default commission: ${e(data.settings.commissionRate)}% · Renewal window: ${e(data.settings.renewalDays)} days</p><h3>Salesperson teams and capacity</h3>${table(
        [
          "Salesperson",
          "Leader",
          "Eligible services",
          "Maximum open leads",
          "Action",
        ],
        data.users
          .filter((u) => u.role === "salesperson")
          .map((u) => {
            const p = data.profiles.find((p) => p.id === u.id) || {};
            return [
              e(u.name),
              e(user(p.leaderId)),
              e((p.serviceIds || []).map(service).join(", ") || "All services"),
              p.capacity || "Unlimited",
              btn("profile", "Configure", u.id),
            ];
          }),
      )}<h3>Service commission overrides</h3>${table(
        ["Service", "Rate"],
        data.commissionRules.map((r) => [e(service(r.id)), e(r.rate) + "%"]),
      )}<h3>Connections</h3><p><strong>Excel:</strong> Ready. Import .xlsx or CSV from CRM → Import leads.</p><p><strong>Automatic lead intake:</strong> ${data.integrations.intake ? "Token configured" : "Not connected"}. Website/automation can POST leads to <code>${e(location.origin)}/api/intake/leads</code>.</p>${btn("intake-token", data.integrations.intake ? "Rotate intake token" : "Create intake token")}<details><summary>Integration instructions</summary><p>Send a server-side Authorization: Bearer token header and JSON fields externalId, name, phone, serviceId, source. Same source + externalId is idempotent. Reusing a phone for the same service returns a duplicate error. Never place the token in Excel or a public website.</p><p>WhatsApp API: configure WHATSAPP_TOKEN, WHATSAPP_PHONE_ID and WHATSAPP_API_VERSION on the server. Use approved templates without variables for API sending; manual drafts support {{name}} and {{service}}.</p><p>AI call summaries: configure OPENAI_API_KEY and optionally OPENAI_SUMMARY_MODEL. Add a consented transcript from call history. Recording links are stored; calls are not automatically recorded or transcribed.</p></details><p><strong>WhatsApp API:</strong> ${data.integrations.whatsapp ? "Configured" : "Not connected"} · <strong>AI summaries:</strong> ${data.integrations.ai ? "Configured" : "Not connected"}</p>`;
    document.querySelector("#view-operations").innerHTML =
      `<div class="crm-page-heading"><div><h2>Sales operations</h2><p>Keep every lead, team and service moving.</p></div><label>Target month<input id="opsMonth" type="month" value="${month}"></label>${btn("refresh", "Refresh")}</div><div class="crm-row-actions ops-tabs">${tabs.map(([id, label]) => `<button type="button" class="${tab === id ? "primary-button" : "ghost-button"}" data-ops="tab" data-id="${id}" aria-pressed="${tab === id}">${label}</button>`).join("")}</div><section class="panel crm-panel">${content}</section>`;
    if (tab === "calendar") window.calendarMount?.();
    document.querySelector("#opsMonth").onchange = async (event) => {
      if (event.target.value) {
        month = event.target.value;
        try {
          await refresh();
        } catch (err) {
          showToast(err.message);
        }
      }
    };
  }
  document.addEventListener("click", async (event) => {
    const t = event.target.closest("[data-ops]");
    if (!t) return;
    const a = t.dataset.ops,
      id = t.dataset.id;
    t.disabled = true;
    try {
      if (a === "alerts") {
        if (!("Notification" in window))
          throw new Error("Browser notifications are unavailable.");
        const granted = await Notification.requestPermission();
        if (granted === "granted") {
          localStorage.setItem("pdc-ops-alerts", "on");
          showToast("Follow-up alerts enabled while dashboard is open.");
          await refresh();
        } else
          showToast(
            "Browser alerts were not enabled. Alerts remain visible here.",
          );
      }
      if (a === "close") document.querySelector("#crmDialog").close();
      if (a === "tab") {
        tab = id;
        render();
      }
      if (a === "refresh") await refresh();
      if (a === "open-lead") {
        switchView("view-crm");
        const b = document.querySelector(
          `[data-crm="detail"][data-id="${CSS.escape(id)}"]`,
        );
        if (b) b.click();
      }
      if (a === "settings")
        dialog(
          "Assignment & alerts",
          `<div class="crm-form-grid">${field("Assignment mode", select("assignment", ["manual", "round-robin", "workload"], data.settings.assignment))}${field("Escalation after hours", input("escalationHours", data.settings.escalationHours, "number", 'required min="1" max="720"'))}${field("Renewal notice days", input("renewalDays", data.settings.renewalDays, "number", 'required min="0" max="365"'))}${field("Default commission %", input("commissionRate", data.settings.commissionRate, "number", 'required min="0" max="100" step="0.01"'))}</div><p>Automatic assignment affects new unassigned leads. Existing leads keep their owners. Commission changes apply only to future confirmations.</p>`,
          "Save",
          (b) => post("settings", b),
        );
      if (a === "assign-unassigned") {
        const result = await post(a, {});
        showToast(result.count + " leads assigned.");
        await window.crmRefresh();
      }
      if (a === "profile") {
        const p = data.profiles.find((x) => x.id === id) || {};
        dialog(
          "Configure salesperson",
          `${field(
            "Team leader",
            select(
              "leaderId",
              data.users.filter((u) => u.role === "teamleader" && u.active),
              p.leaderId,
              "No team leader",
            ),
          )}${field("Maximum open leads (0 = unlimited)", input("capacity", p.capacity || 0, "number", 'min="0" max="10000"'))}<fieldset><legend>Eligible services (none selected = all)</legend>${state.services.map((s) => `<label class="crm-checkbox"><input type="checkbox" name="serviceIds" value="${e(s.id)}" ${(p.serviceIds || []).includes(s.id) ? "checked" : ""}>${e(s.name)}</label>`).join("")}</fieldset>`,
          "Save",
          (b, f) =>
            post(a, {
              ...b,
              id,
              serviceIds: new FormData(f).getAll("serviceIds"),
            }),
        );
      }
      if (a === "assign")
        dialog(
          "Assign lead",
          field(
            "Salesperson",
            select(
              "salespersonId",
              data.users.filter((u) => u.role === "salesperson" && u.active),
            ),
          ),
          "Assign",
          (b) => post(a, { ...b, leadId: id }),
        );
      if (a === "target")
        dialog(
          "Set target",
          `<div class="crm-form-grid">${field(
            "Salesperson",
            select(
              "salespersonId",
              data.users.filter((u) => u.role === "salesperson" && u.active),
            ),
          )}${field("Service", select("serviceId", state.services, "", "All services"))}${field("Month", input("month", month, "month", "required"))}${["dailyCalls", "monthlyCalls", "monthlySales", "monthlyRevenue"].map((n, i) => field(["Daily calls", "Monthly calls", "Monthly sales", "Monthly service value (₹)"][i], input(n, 0, "number", 'min="0" required'))).join("")}</div><p>Saving replaces the target for this salesperson, service and month.</p>`,
          "Save",
          (b) => post(a, b),
        );
      if (a === "commission-rule")
        dialog(
          "Service commission",
          field("Service", select("serviceId", state.services)) +
            field(
              "Rate %",
              input(
                "rate",
                0,
                "number",
                'required min="0" max="100" step="0.01"',
              ),
            ),
          "Save",
          (b) => post(a, b),
        );
      if (a === "commission-paid") {
        const c = data.commissions.find((c) => c.saleId === id);
        const requestId = crypto.randomUUID();
        dialog(
          "Record commission already paid",
          field(
            "Amount (₹)",
            input(
              "amount",
              c.balance,
              "number",
              `required min="0.01" max="${c.balance}" step="0.01"`,
            ),
          ) +
            field(
              "Payment reference",
              input("reference", "", "text", "required"),
            ),
          "Record payment",
          (b) => post(a, { ...b, saleId: id, requestId }),
        );
      }
      if (a === "delivery") {
        const d = data.deliveries.find((x) => x.id === id);
        dialog(
          "Service delivery",
          `${field(
            "Delivery owner",
            select(
              "ownerId",
              data.users.filter((u) => u.active),
              d.ownerId,
              "Use named owner",
            ),
          )}${field("Named owner", input("ownerName", d.ownerName))}${field("Status", select("status", ["Pending onboarding", "In progress", "Blocked", "Completed"], d.status))}${field("Tasks — one per line; prefix completed tasks with [x]", `<textarea name="tasks" rows="6">${e(d.tasks.map((t) => (t.done ? "[x] " : "") + t.text).join("\n"))}</textarea>`)}${field("Notes", `<textarea name="notes">${e(d.notes)}</textarea>`)}`,
          "Save",
          (b) =>
            post(a, {
              ...b,
              saleId: id,
              expectedUpdatedAt: d.updatedAt,
              tasks: b.tasks
                .split("\n")
                .filter((t) => t.trim())
                .map((t) => ({
                  text: t.replace(/^\[x\]\s*/i, ""),
                  done: /^\[x\]/i.test(t),
                })),
            }),
        );
      }
      if (a === "renewal") {
        const r = data.renewals.find((x) => x.id === id);
        dialog(
          "Renewal follow-up",
          field(
            "Status",
            select(
              "status",
              ["Pending", "Contacted", "Renewed", "Declined"],
              r.status || "Pending",
            ),
          ) +
            field("Next follow-up", input("nextDate", r.nextDate, "date")) +
            field("Notes", `<textarea name="notes">${e(r.notes)}</textarea>`),
          "Save",
          (b) => post(a, { ...b, saleId: id }),
        );
      }
      if (a === "intake-token")
        dialog(
          "Lead intake token",
          "<p>Creating a new token invalidates any previous token. Keep the new token only in your trusted integration server.</p>",
          "Create token",
          () => post(a, {}),
        );
      if (a === "template")
        dialog(
          "WhatsApp template",
          field("Template name", input("name", "", "text", "required")) +
            field(
              "Message (supports {{name}} and {{service}})",
              `<textarea name="content" maxlength="2000" required></textarea>`,
            ) +
            field(
              "Approved Meta template name (optional)",
              input("providerName"),
            ) +
            field("Template language", input("language", "en")),
          "Save",
          (b) => post(a, b),
        );
      if (a === "message") {
        const requestId = crypto.randomUUID();
        dialog(
          "WhatsApp follow-up",
          field("Template", select("templateId", data.templates)) +
            `<label class="crm-checkbox"><input name="consent" type="checkbox" required>Customer opted in to WhatsApp messages.</label>${data.integrations?.whatsapp ? '<label class="crm-checkbox"><input type="checkbox" name="send">Send approved template through connected WhatsApp API now</label>' : ""}<p>Without API sending, a draft is prepared for you to review in WhatsApp.</p>`,
          "Prepare message",
          (b) =>
            post(a, {
              ...b,
              leadId: id,
              consent: b.consent === "on",
              send: b.send === "on",
            }),
        );
      }
      if (a === "insight") {
        const c = state.calls.find((c) => c.id === id);
        if (!c) throw new Error("Refresh the call first.");
        dialog(
          "Call recording & AI summary",
          field(
            "HTTPS recording link (optional)",
            input("recordingUrl", c.recordingUrl, "url"),
          ) +
            field(
              "Call transcript",
              `<textarea name="transcript" rows="8" maxlength="30000">${e(c.transcript)}</textarea>`,
            ) +
            `<label class="crm-checkbox"><input type="checkbox" name="consent" required ${c.recordingConsent ? "checked" : ""}>The customer consented to recording/transcript use.</label>${data.integrations?.ai ? '<label class="crm-checkbox"><input name="generate" type="checkbox">Send transcript to configured AI provider and generate summary</label>' : "<p>AI provider is not connected. You can save a recording link and transcript.</p>"}`,
          "Save",
          (b) =>
            post("call-insight", {
              ...b,
              callId: id,
              consent: b.consent === "on",
              generate: b.generate === "on",
            }),
        );
      }
    } catch (err) {
      showToast(err.message);
    } finally {
      t.disabled = false;
    }
  });
  setInterval(() => {
    if (
      currentUser &&
      !document.hidden &&
      !document.querySelector("#crmDialog").open
    )
      refresh().catch(() => {});
  }, 60000);
})();
