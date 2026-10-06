/* Sales CRM UI. All authoritative data and permissions are enforced by server.js. */
(() => {
  let state = {
      users: [],
      leads: [],
      calls: [],
      sales: [],
      clients: [],
      audit: [],
    },
    reports = [];
  const stages = [
    "New",
    "Contact Attempted",
    "Connected",
    "Interested",
    "Proposal Sent",
    "Purchased",
    "Not Interested",
    "Deferred",
    "Invalid Number",
  ];
  const sources = [
    "Instagram",
    "WhatsApp",
    "Advertisement",
    "Referral",
    "Website",
    "Other",
  ];
  const e = (value) =>
    String(value ?? "").replace(
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
  const money = (value) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(value || 0);
  const day = (date) =>
    new Date(date).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const today = () => day(new Date());
  const when = (value) =>
    value
      ? new Date(value).toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "—";
  const local = (value) =>
    value
      ? new Date(
          new Date(value).getTime() -
            new Date(value).getTimezoneOffset() * 60000,
        )
          .toISOString()
          .slice(0, 16)
      : "";
  const options = (items, selected) =>
    items
      .map((x) => {
        const v = typeof x === "string" ? x : x.id;
        const label = typeof x === "string" ? x : x.name;
        return `<option value="${e(v)}" ${v === selected ? "selected" : ""}>${e(label)}</option>`;
      })
      .join("");
  const salespeople = () =>
    state.users.filter((u) => u.role === "salesperson" && u.active);
  const owner = (id) =>
    state.users.find((u) => u.id === id)?.name || "Unassigned";
  const closed = (l) =>
    ["Purchased", "Not Interested", "Invalid Number"].includes(l.stage);
  const due = (l) =>
    l.followUpAt && !closed(l) && new Date(l.followUpAt) <= new Date();
  const button = (action, label, id = "", cls = "ghost-button") =>
    `<button type="button" class="${cls}" data-crm="${action}" data-id="${e(id)}">${e(label)}</button>`;
  function toast(error) {
    showToast(error.message || error);
  }
  function fields(label, control) {
    return `<label>${label}${control}</label>`;
  }
  function input(name, value = "", type = "text", extra = "") {
    return `<input name="${name}" type="${type}" value="${e(value)}" ${extra}>`;
  }
  function select(name, items, value, extra = "") {
    return `<select name="${name}" ${extra}>${options(items, value)}</select>`;
  }
  function modal(title, content, submit, handler) {
    const d = document.querySelector("#crmDialog");
    d.innerHTML = `<div class="crm-dialog-heading"><h3 id="crmDialogTitle">${e(title)}</h3>${button("close", "Close")}</div><form id="crmModalForm">${content}<p id="crmFormError" role="alert"></p><div class="crm-dialog-footer">${button("close", "Cancel")}<button class="primary-button" type="submit">${e(submit)}</button></div></form>`;
    d.showModal();
    d.querySelector("form").onsubmit = async (event) => {
      event.preventDefault();
      const submitButton = d.querySelector("[type=submit]");
      submitButton.disabled = true;
      try {
        await handler(Object.fromEntries(new FormData(event.target)));
        d.close();
        if (currentUser) await refresh();
      } catch (error) {
        d.querySelector("#crmFormError").textContent = error.message;
      } finally {
        submitButton.disabled = false;
      }
    };
  }
  function permissions() {
    const role = currentUser.role;
    document.body.dataset.role = role;
    document.querySelector("#signedInUser").textContent =
      `${currentUser.name} · ${role}`;
    document.querySelectorAll(".nav-links a").forEach((a) => {
      a.hidden =
        role === "salesperson"
          ? !["view-crm", "view-sales-reports"].includes(a.dataset.view)
          : role === "nutritionist"
            ? [
                "view-crm",
                "view-sales-reports",
                "view-team",
                "view-payments",
              ].includes(a.dataset.view)
            : false;
    });
    for (const id of ["newClientButton", "exportButton", "notifyButton"])
      document.getElementById(id).hidden = role !== "admin";
    document.querySelector(".file-button").hidden = role !== "admin";
    document
      .querySelectorAll(".sync-panel,.form-panel")
      .forEach((el) => (el.hidden = role !== "admin"));
    document.querySelector("#crmStatus").innerHTML =
      role === "admin" &&
      state.clients.length === 0 &&
      legacyClientBackup().length
        ? `<div class="crm-notice">Your previous browser has ${legacyClientBackup().length} client records. Export a backup, then import them into the shared database. ${button("migrate", "Back up & import existing clients")}</div>`
        : "";
  }
  async function refresh() {
    state = await api("/api/state");
    currentUser = state.user;
    clients = state.clients.map(normalizeClient);
    clientServerSnapshot = structuredClone(clients);
    applyAuthState();
    permissions();
    render();
    renderCRM();
    renderTeam();
    if (currentUser.role !== "nutritionist") await loadReports();
    switchView(
      window.location.hash.slice(1) ||
        (currentUser.role === "salesperson" ? "view-crm" : "view-overview"),
    );
  }
  window.crmRefresh = refresh;
  function leadRow(l) {
    const sale = state.sales.find((s) => s.leadId === l.id);
    return `<tr><td><strong>${e(l.name)}</strong><small><a href="tel:${e(l.phone)}">${e(l.phone)}</a> · ${e(l.source)}</small></td><td>${e(owner(l.assignedTo))}</td><td><span class="crm-stage">${e(l.stage)}</span>${sale && !sale.confirmedAt ? "<small>Payment confirmation pending</small>" : ""}</td><td class="${due(l) ? "crm-overdue" : ""}">${when(l.followUpAt)}</td><td><div class="crm-row-actions">${button("detail", "Open", l.id)}${!closed(l) ? button("call", "Log call", l.id) : ""}</div></td></tr>`;
  }
  function renderCRM() {
    const el = document.querySelector("#view-crm");
    const old = {
      search: document.querySelector("#crmSearch")?.value || "",
      owner: document.querySelector("#crmOwner")?.value || "",
      stage: document.querySelector("#crmStage")?.value || "",
      follow: document.querySelector("#crmFollow")?.value || "",
    };
    el.innerHTML = `<div class="crm-page-heading"><div><h2>Sales CRM</h2><p>Leads, calls and follow-ups.</p></div><div class="crm-row-actions">${button("refresh", "Refresh")}${button("new-lead", "+ New Lead", "", "primary-button")}</div></div>
    <div class="crm-metrics">${[
      ["Total leads", state.leads.length],
      [
        "Calls today",
        state.calls.filter((c) => day(c.createdAt) === today() && (currentUser.role === "admin" || c.actorId === currentUser.id)).length,
      ],
      ["Confirmed sales", state.sales.filter((s) => s.confirmedAt).length],
      ["Follow-ups due", state.leads.filter(due).length],
    ]
      .map(
        ([label, value]) =>
          `<article><p>${label}</p><strong>${value}</strong></article>`,
      )
      .join("")}</div>
    <section class="panel crm-panel"><h3>Leads</h3><div class="crm-filters"><label>Search leads<input id="crmSearch" placeholder="Name or mobile number" value="${e(old.search)}"></label>${currentUser.role === "admin" ? `<label>Salesperson<select id="crmOwner"><option value="">All</option>${options(salespeople(), old.owner)}<option value="unassigned" ${old.owner === "unassigned" ? "selected" : ""}>Unassigned</option></select></label>` : ""}<label>Stage<select id="crmStage"><option value="">All</option>${options(stages, old.stage)}</select></label><label>Follow-up<select id="crmFollow">${options(
      [
        { id: "", name: "All" },
        { id: "today", name: "Today" },
        { id: "overdue", name: "Overdue" },
        { id: "upcoming", name: "Upcoming" },
      ],
      old.follow,
    )}</select></label></div><div class="crm-table-wrap"><table class="crm-table"><thead><tr><th>Lead</th><th>Salesperson</th><th>Stage</th><th>Next follow-up (IST)</th><th>Actions</th></tr></thead><tbody id="crmLeadRows"></tbody></table></div></section>
    <section class="panel crm-panel"><h3>Today's follow-ups</h3><div class="crm-table-wrap"><table class="crm-table"><thead><tr><th>Lead</th><th>Salesperson</th><th>Stage</th><th>Follow-up time (IST)</th><th>Actions</th></tr></thead><tbody>${
      state.leads
        .filter(
          (l) =>
            l.followUpAt &&
            !closed(l) &&
            (day(l.followUpAt) === today() || due(l)),
        )
        .sort((a, b) => a.followUpAt.localeCompare(b.followUpAt))
        .map(leadRow)
        .join("") ||
      '<tr><td colspan="5" class="crm-empty">No follow-ups due today.</td></tr>'
    }</tbody></table></div></section>`;
    ["crmSearch", "crmOwner", "crmStage", "crmFollow"].forEach((id) =>
      document
        .getElementById(id)
        ?.addEventListener(
          id === "crmSearch" ? "input" : "change",
          filterLeads,
        ),
    );
    filterLeads();
  }
  function filterLeads() {
    const q = (document.querySelector("#crmSearch")?.value || "").toLowerCase(),
      person = document.querySelector("#crmOwner")?.value || "",
      stage = document.querySelector("#crmStage").value,
      follow = document.querySelector("#crmFollow").value;
    const filtered = state.leads.filter(
      (l) =>
        `${l.name} ${l.phone}`.toLowerCase().includes(q) &&
        (!person ||
          (person === "unassigned"
            ? !l.assignedTo
            : l.assignedTo === person)) &&
        (!stage || l.stage === stage) &&
        (!follow ||
          (l.followUpAt &&
            !closed(l) &&
            (follow === "today"
              ? day(l.followUpAt) === today()
              : follow === "overdue"
                ? due(l)
                : new Date(l.followUpAt) > new Date()))),
    );
    document.querySelector("#crmLeadRows").innerHTML =
      filtered.map(leadRow).join("") ||
      `<tr><td colspan="5" class="crm-empty"><strong>${state.leads.length ? "No matching leads." : "No leads yet."}</strong><p>${state.leads.length ? "Adjust your filters to see more leads." : "Add your first lead to start tracking calls."}</p></td></tr>`;
  }
  function leadForm(id) {
    const l = state.leads.find((l) => l.id === id) || {
      stage: "New",
      source: "Instagram",
      assignedTo: currentUser.role === "salesperson" ? currentUser.id : "",
    };
    modal(
      id ? "Edit lead" : "New lead",
      `<div class="crm-form-grid">${fields("Name", input("name", l.name, "text", 'required maxlength="120"'))}${fields("Mobile number", input("phone", l.phone, "tel", "required"))}${fields("City", input("city", l.city))}${fields("Service of interest", input("service", l.service || "PDC counselling"))}${fields("Lead source", select("source", sources, l.source))}${currentUser.role === "admin" ? fields("Salesperson", `<select name="assignedTo"><option value="">Unassigned</option>${options(salespeople(), l.assignedTo)}</select>`) : ""}${fields(
        "Stage",
        select(
          "stage",
          stages.filter((s) => s !== "Purchased"),
          l.stage,
        ),
      )}${fields("Next follow-up (your local time)", input("followUpAt", local(l.followUpAt), "datetime-local"))}${fields("Reason for lost / deferred / invalid lead", input("reason", l.reason))}${fields("Notes", `<textarea name="notes" rows="3" maxlength="5000">${e(l.notes)}</textarea>`)}</div>`,
      id ? "Save changes" : "Create lead",
      async (b) => {
        if (b.followUpAt) b.followUpAt = new Date(b.followUpAt).toISOString();
        if (id) b.expectedUpdatedAt = l.updatedAt;
        await api(id ? `/api/leads/${id}` : "/api/leads", {
          method: id ? "PATCH" : "POST",
          body: JSON.stringify(b),
        });
        showToast("Lead saved.");
      },
    );
  }
  function callForm(id) {
    const l = state.leads.find((l) => l.id === id);
    modal(
      `Log call · ${l.name}`,
      `<p>Call time and salesperson are recorded automatically.</p><div class="crm-form-grid">${fields("Call outcome", select("outcome", ["Connected", "No Answer", "Switched Off", "Invalid Number"], "Connected"))}${fields(
        "Lead stage after call",
        select(
          "stage",
          stages.filter((s) => s !== "Purchased"),
          l.stage === "New" ? "Connected" : l.stage,
        ),
      )}${fields("Next follow-up (your local time)", input("followUpAt", local(l.followUpAt), "datetime-local"))}${fields("Reason for lost / deferred / invalid lead", input("reason", l.reason))}${fields("What did you discuss?", `<textarea name="notes" required rows="4" maxlength="5000"></textarea>`)}</div>`,
      "Save call",
      async (b) => {
        if (b.followUpAt) b.followUpAt = new Date(b.followUpAt).toISOString();
        b.expectedUpdatedAt = l.updatedAt;
        await api(`/api/leads/${id}/calls`, {
          method: "POST",
          body: JSON.stringify(b),
        });
        showToast("Call logged.");
      },
    );
    document.querySelector("[name=outcome]").onchange = (event) => {
      document.querySelector("[name=stage]").value =
        event.target.value === "Connected"
          ? "Connected"
          : event.target.value === "Invalid Number"
            ? "Invalid Number"
            : "Contact Attempted";
    };
  }
  function saleForm(id) {
    const l = state.leads.find((l) => l.id === id);
    modal(
      `Record purchase · ${l.name}`,
      `<div class="crm-form-grid">${fields("Purchased plan", input("plan", l.service, "text", "required"))}${fields("Plan duration (months)", input("months", 3, "number", 'required min="1" max="60"'))}${fields("Total service amount (₹)", input("amount", "", "number", 'required min="1" step="0.01"'))}${fields("Received amount (₹)", input("received", 0, "number", 'required min="0" step="0.01"'))}${fields("Payment mode", select("paymentMode", ["UPI", "Online", "Cash", "Bank Transfer", "Card"], "UPI"))}${fields("Service start date", input("startDate", today(), "date", "required"))}${fields("Nutritionist", select("nutritionist", ["Dr Luv Patel", "Dt Nilesh Lakhani"], "Dr Luv Patel"))}</div>${currentUser.role === "admin" ? '<label class="crm-checkbox"><input type="checkbox" name="confirmed"> I have verified this purchase and payment.</label>' : "<p>The admin will verify payment before this becomes a confirmed sale and PDC client.</p>"}`,
      "Record purchase",
      async (b) => {
        b.confirmed = b.confirmed === "on";
        b.expectedUpdatedAt = l.updatedAt;
        await api(`/api/leads/${id}/sale`, {
          method: "POST",
          body: JSON.stringify(b),
        });
        showToast(
          b.confirmed
            ? "Purchase confirmed and PDC client created."
            : "Purchase sent for admin confirmation.",
        );
      },
    );
  }
  function detail(id) {
    const l = state.leads.find((l) => l.id === id),
      sale = state.sales.find((s) => s.leadId === id),
      calls = state.calls
        .filter((c) => c.leadId === id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const d = document.querySelector("#crmDialog");
    d.innerHTML = `<div class="crm-dialog-heading"><div><h3 id="crmDialogTitle">${e(l.name)}</h3><a href="tel:${e(l.phone)}">${e(l.phone)}</a></div>${button("close", "Close")}</div><dl class="crm-detail-grid"><div><dt>Salesperson</dt><dd>${e(owner(l.assignedTo))}</dd></div><div><dt>Stage</dt><dd>${e(l.stage)}</dd></div><div><dt>Source</dt><dd>${e(l.source)}</dd></div><div><dt>Service</dt><dd>${e(l.service)}</dd></div><div><dt>City</dt><dd>${e(l.city) || "—"}</dd></div><div><dt>Next follow-up (IST)</dt><dd>${when(l.followUpAt)}</dd></div></dl><p>${e(l.notes)}</p>${l.reason ? `<p><strong>Reason:</strong> ${e(l.reason)}</p>` : ""}<div class="crm-row-actions">${l.stage !== "Purchased" ? button("edit-lead", "Edit lead", id) : ""}${!closed(l) ? button("call", "Log call", id) : ""}${!sale && !closed(l) ? button("sale", "Record purchase", id, "primary-button") : ""}</div>${sale ? `<section class="crm-purchase"><h4>${sale.confirmedAt ? "Confirmed purchase" : "Payment confirmation pending"}</h4><p>${e(sale.plan)} · ${sale.months} months · ${e(sale.nutritionist)}</p><p>Service: ${money(sale.amount)} · Received: ${money(sale.received)} · Pending: ${money(sale.amount - sale.received)}</p>${!sale.confirmedAt && currentUser.role === "admin" ? button("confirm-sale", "Confirm payment & create client", id, "primary-button") : ""}</section>` : ""}<h4>Call history (${calls.length})</h4><div class="crm-timeline">${calls.map((c) => `<article><strong>${e(c.outcome)}</strong><small>${when(c.createdAt)} · ${e(c.actorName)}</small><p>${e(c.notes)}</p>${c.followUpAt ? `<small>Next follow-up: ${when(c.followUpAt)}</small>` : ""}</article>`).join("") || "<p>No calls logged yet.</p>"}</div>`;
    d.showModal();
  }
  async function loadReports() {
    const from = document.querySelector("#reportFrom")?.value || "",
      to = document.querySelector("#reportTo")?.value || "",
      person = document.querySelector("#reportOwner")?.value || "";
    reports = await api(
      `/api/reports?${new URLSearchParams({ from, to, salesperson: person })}`,
    );
    const totals = reports.reduce((sum, row) => {
      for (const key of ["attempts", "buyers", "received", "pending"]) {
        sum[key] += row[key];
      }
      return sum;
    }, { attempts: 0, buyers: 0, received: 0, pending: 0 });
    const summary = `<div class="crm-metrics">${[
      ["Call attempts in period", totals.attempts],
      ["Confirmed buyers in period", totals.buyers],
      ["Received for these purchases", money(totals.received)],
      ["Pending for these purchases", money(totals.pending)],
    ].map(([label, value]) => `<article><p>${e(label)}</p><strong>${e(value)}</strong></article>`).join("")}</div>`;
    document.querySelector("#view-sales-reports").innerHTML =
      `<div class="crm-page-heading"><div><h2>Sales reports</h2><p>Call activity, confirmed purchases and collections.</p></div>${button("report-export", "Export CSV")}</div>${summary}<section class="panel crm-panel"><div class="crm-row-actions crm-periods">${button("period-today", "Today")}${button("period-week", "This week")}${button("period-month", "This month")}${button("period-all", "All time")}</div><div class="crm-filters"><label>From<input id="reportFrom" type="date" value="${e(from)}"></label><label>To<input id="reportTo" type="date" value="${e(to)}"></label>${currentUser.role === "admin" ? `<label>Salesperson<select id="reportOwner"><option value="">All</option>${options(salespeople(), person)}</select></label>` : ""}${button("report-refresh", "Apply filters", "", "primary-button")}</div><div class="crm-table-wrap"><table class="crm-table"><thead><tr>${["Salesperson", "Assigned leads", "Call attempts", "Connected leads", "Buyers", "Service value", "Received", "Pending", "Follow-ups due", "Lead conversion", "Call conversion"].map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>${reports.map((r) => `<tr><td><strong>${e(r.name)}</strong></td>${[r.assigned, r.attempts, r.connected, r.buyers, money(r.revenue), money(r.received), money(r.pending), r.due, `${r.leadConversion.toFixed(1)}%`, `${r.callConversion.toFixed(1)}%`].map((x) => `<td>${x}</td>`).join("")}</tr>`).join("") || '<tr><td colspan="11" class="crm-empty">Add a salesperson in Team to start reporting.</td></tr>'}</tbody></table></div><p class="crm-help">Dates use Indian Standard Time. Calls count each attempt; connected leads count distinct people. Buyers count confirmed purchases in the selected period. Lead conversion measures purchases among leads created in this period. Call conversion measures buyers among leads connected in this period. Received and pending amounts reflect current collections for those purchases. Follow-ups due show the current workload.</p></section><section class="panel crm-panel"><h3>Recent call activity</h3><div class="crm-table-wrap"><table class="crm-table"><thead><tr><th>Time (IST)</th><th>Salesperson</th><th>Lead</th><th>Outcome</th><th>Notes</th></tr></thead><tbody>${
        state.calls
          .filter(
            (c) =>
              (!from || day(c.createdAt) >= from) &&
              (!to || day(c.createdAt) <= to) &&
              (!person || c.actorId === person),
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 100)
          .map(
            (c) =>
              `<tr><td>${when(c.createdAt)}</td><td>${e(c.actorName)}</td><td>${e(state.leads.find((l) => l.id === c.leadId)?.name || "Lead")}</td><td>${e(c.outcome)}</td><td>${e(c.notes)}</td></tr>`,
          )
          .join("") ||
        '<tr><td colspan="5" class="crm-empty">No calls in this period.</td></tr>'
      }</tbody></table></div></section>`;
  }
  function renderTeam() {
    if (currentUser.role !== "admin") return;
    document.querySelector("#view-team").innerHTML =
      `<div class="crm-page-heading"><div><h2>Team</h2><p>Separate accounts and access for your team.</p></div><div class="crm-row-actions">${button("change-password", "Change my password")}${button("new-user", "+ Add team member", "", "primary-button")}</div></div><section class="panel crm-panel"><div class="crm-table-wrap"><table class="crm-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>${state.users.map((u) => `<tr><td>${e(u.name)}</td><td>${e(u.email)}</td><td>${e(u.role)}</td><td>${u.active ? "Active" : "Disabled"}</td><td><div class="crm-row-actions">${button("reset-password", "Reset password", u.id)}${u.id !== currentUser.id ? button("toggle-user", u.active ? "Disable" : "Enable", u.id) : ""}</div></td></tr>`).join("")}</tbody></table></div></section><section class="panel crm-panel"><div class="crm-page-heading"><h3>Data backup</h3>${button("backup", "Export CRM & clients")}</div><p>Download leads, calls, purchases and clients as a JSON backup. Back up the persistent database volume separately to preserve user accounts.</p></section><section class="panel crm-panel"><h3>CallFlow connection</h3><p>Connect the CallFlow PDC app with the same team email and password. Assigned leads, call outcomes, notes and follow-ups sync with this dashboard.</p><p>Connector URL: <strong>${e(location.origin)}/api/callflow/</strong><br>Connector ID: <strong>pdc-dashboard</strong></p><p>Confirm purchases here after checking payment.</p></section><section class="panel crm-panel"><h3>Recent changes</h3><div class="crm-table-wrap"><table class="crm-table"><thead><tr><th>Time (IST)</th><th>Team member</th><th>Change</th></tr></thead><tbody>${state.audit.map((a) => `<tr><td>${when(a.created_at)}</td><td>${e(owner(a.actor_id))}</td><td>${e(a.action.replaceAll("_", " "))}</td></tr>`).join("") || '<tr><td colspan="3" class="crm-empty">Changes appear here as your team works.</td></tr>'}</tbody></table></div></section>`;
  }
  function download(data, name, type) {
    const link = document.createElement("a");
    const url = URL.createObjectURL(new Blob([data], { type }));
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  document.addEventListener("click", async (event) => {
    const target = event.target.closest("[data-crm]");
    if (!target) return;
    event.preventDefault();
    const { crm: action, id } = target.dataset;
    const d = document.querySelector("#crmDialog");
    try {
      if (action === "close") {
        d.close();
        return;
      }
      if (
        [
          "new-lead",
          "edit-lead",
          "call",
          "sale",
          "detail",
          "new-user",
          "reset-password",
          "change-password",
        ].includes(action)
      )
        d.close();
      if (action === "new-lead") leadForm();
      if (action === "edit-lead") leadForm(id);
      if (action === "call") callForm(id);
      if (action === "sale") saleForm(id);
      if (action === "detail") detail(id);
      if (action === "refresh") await refresh();
      if (action.startsWith("period-")) {
        const date = new Date(`${today()}T12:00:00+05:30`);
        let from = today();
        if (action === "period-week") {
          date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
          from = day(date);
        }
        if (action === "period-month") from = today().slice(0, 8) + "01";
        document.querySelector("#reportFrom").value =
          action === "period-all" ? "" : from;
        document.querySelector("#reportTo").value =
          action === "period-all" ? "" : today();
        await loadReports();
      }
      if (action === "report-refresh") {
        state = await api("/api/state");
        if (
          document.querySelector("#reportFrom").value >
            document.querySelector("#reportTo").value &&
          document.querySelector("#reportTo").value
        )
          throw new Error("From date must be before To date.");
        await loadReports();
      }
      if (action === "confirm-sale") {
        if (
          !confirm(
            "Confirm that you have verified this purchase and payment? This creates a PDC client.",
          )
        )
          return;
        target.disabled = true;
        await api(`/api/leads/${id}/confirm`, { method: "POST" });
        d.close();
        if (currentUser) await refresh();
        showToast("Purchase confirmed. PDC client created.");
      }
      if (action === "new-user")
        modal(
          "Add team member",
          `<div class="crm-form-grid">${fields("Name", input("name", "", "text", "required"))}${fields("Email", input("email", "", "email", "required"))}${fields("Role", select("role", ["salesperson", "nutritionist", "admin"], "salesperson"))}${fields("Initial password", input("password", "", "password", 'required minlength="5" autocomplete="new-password"'))}</div><p>For nutritionist access, use the exact name Dr Luv Patel or Dt Nilesh Lakhani.</p>`,
          "Create account",
          async (b) => {
            await api("/api/users", {
              method: "POST",
              body: JSON.stringify(b),
            });
            showToast("Team member created.");
          },
        );
      if (action === "reset-password")
        modal(
          `Reset password · ${owner(id)}`,
          fields(
            "New password",
            input(
              "password",
              "",
              "password",
              'required minlength="5" autocomplete="new-password"',
            ),
          ),
          "Reset password",
          async (b) => {
            await api(`/api/users/${id}`, {
              method: "PATCH",
              body: JSON.stringify(b),
            });
            if (id === currentUser.id) {
              currentUser = null;
              applyAuthState();
            }
            showToast("Password reset. Existing sessions were signed out.");
          },
        );
      if (action === "change-password")
        modal(
          "Change my password",
          fields(
            "Current password",
            input(
              "currentPassword",
              "",
              "password",
              'required autocomplete="current-password"',
            ),
          ) +
            fields(
              "New password",
              input(
                "password",
                "",
                "password",
                'required minlength="5" autocomplete="new-password"',
              ),
            ),
          "Change password",
          async (b) => {
            await api("/api/auth/password", {
              method: "POST",
              body: JSON.stringify(b),
            });
            currentUser = null;
            applyAuthState();
            showToast("Password changed. Log in with your new password.");
          },
        );
      if (action === "toggle-user") {
        const u = state.users.find((u) => u.id === id);
        if (
          !confirm(`${u.active ? "Disable" : "Enable"} access for ${u.name}?`)
        )
          return;
        await api(`/api/users/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ active: !u.active }),
        });
        await refresh();
      }
      if (action === "backup")
        download(
          JSON.stringify(await api("/api/backup"), null, 2),
          `pdc-crm-backup-${today()}.json`,
          "application/json",
        );
      if (action === "migrate") {
        const old = legacyClientBackup();
        download(
          JSON.stringify(old, null, 2),
          `pdc-browser-backup-${today()}.json`,
          "application/json",
        );
        await api("/api/clients/migrate", {
          method: "POST",
          body: JSON.stringify({ clients: old }),
        });
        await refresh();
        showToast("Existing clients imported. Browser backup preserved.");
      }
      if (action === "report-export") {
        const escape = (v) =>
          `"${String(v)
            .replace(/^[=+@-]/, "'$&")
            .replaceAll('"', '""')}"`;
        const headings = [
          "Salesperson",
          "Assigned leads",
          "Call attempts",
          "Connected leads",
          "Buyers",
          "Service value",
          "Received",
          "Pending",
          "Follow-ups due",
          "Lead conversion %",
          "Call conversion %",
        ];
        download(
          [
            headings,
            ...reports.map((r) => [
              r.name,
              r.assigned,
              r.attempts,
              r.connected,
              r.buyers,
              r.revenue,
              r.received,
              r.pending,
              r.due,
              r.leadConversion.toFixed(1),
              r.callConversion.toFixed(1),
            ]),
          ]
            .map((row) => row.map(escape).join(","))
            .join("\r\n"),
          `pdc-sales-report-${today()}.csv`,
          "text/csv",
        );
      }
    } catch (error) {
      toast(error);
    } finally {
      target.disabled = false;
    }
  });
  async function init() {
    try {
      const status = await api("/api/auth/status");
      if (!status.configured) {
        document
          .querySelector("#loginTitle")
          .insertAdjacentHTML(
            "afterend",
            '<p class="crm-login-message">Admin setup is required. Configure ADMIN_EMAIL and ADMIN_PASSWORD in Coolify, then restart the app.</p>',
          );
        applyAuthState();
        return;
      }
      await refresh();
    } catch (error) {
      applyAuthState();
      if (!error.message.includes("log in")) toast(error);
    }
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && currentUser) refresh().catch(toast);
  });
  window.addEventListener("unhandledrejection", (event) => {
    toast(event.reason);
  });
  init();
})();
