/* Sales CRM UI. All authoritative data and permissions are enforced by server.js. */
(() => {
  let state = {
      users: [],
      leads: [],
      calls: [],
      sales: [],
      clients: [],
      audit: [],
      services: [],
      activities: [],
    },
    reports = [],
    analytics = null,
    reportTab = "salespeople",
    refreshing = false;
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
      a.hidden = ["salesperson", "teamleader"].includes(role)
        ? !["view-crm", "view-sales-reports", "view-operations"].includes(
            a.dataset.view,
          )
        : role === "nutritionist"
          ? [
              "view-crm",
              "view-sales-reports",
              "view-team",
              "view-services",
              "view-operations",
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
    if (refreshing) return;
    refreshing = true;
    try {
      state = await api("/api/state");
      currentUser = state.user;
      clients = state.clients.map(normalizeClient);
      clientServerSnapshot = structuredClone(clients);
      for (const id of ["nutritionist", "overviewNutritionist"]) {
        const control = document.getElementById(id);
        if (!control) continue;
        const selected = control.value;
        const names = [
          ...new Set([
            ...(state.nutritionists || []),
            ...state.clients.map((c) => c.nutritionist).filter(Boolean),
          ]),
        ];
        control.innerHTML = options(names, selected);
      }
      applyAuthState();
      permissions();
      render();
      renderCRM();
      renderTeam();
      renderServices();
      renderSalesOverview();
      if (currentUser.role !== "nutritionist")
        await window.operationsRefresh?.(state);
      if (currentUser.role !== "nutritionist") await loadReports();
      switchView(
        window.location.hash.slice(1) ||
          (currentUser.role === "salesperson" ? "view-crm" : "view-overview"),
      );
    } finally {
      refreshing = false;
    }
  }
  window.crmRefresh = refresh;
  function leadRow(l) {
    const sale = state.sales.find((s) => s.leadId === l.id);
    return `<tr><td><strong>${e(l.name)}</strong><small><a href="tel:${e(l.phone)}">${e(l.phone)}</a> · ${e(l.source)}</small><small>${e(l.service)} · ${e(l.priority || "Warm")} · ${state.calls.filter((c) => c.leadId === l.id).length} calls</small></td><td>${e(owner(l.assignedTo))}</td><td><span class="crm-stage">${e(l.stage)}</span>${sale && !sale.confirmedAt ? "<small>Payment confirmation pending</small>" : ""}</td><td class="${due(l) ? "crm-overdue" : ""}">${when(l.followUpAt)}</td><td><div class="crm-row-actions">${button("detail", "Open", l.id)}${!closed(l) ? button("call", "Log call", l.id) : ""}</div></td></tr>`;
  }
  function renderCRM() {
    const el = document.querySelector("#view-crm");
    const old = {
      search: document.querySelector("#crmSearch")?.value || "",
      owner: document.querySelector("#crmOwner")?.value || "",
      stage: document.querySelector("#crmStage")?.value || "",
      follow: document.querySelector("#crmFollow")?.value || "",
      service: document.querySelector("#crmService")?.value || "",
    };
    el.innerHTML = `<div class="crm-page-heading"><div><h2>Sales CRM</h2><p>Leads, calls and follow-ups.</p></div><div class="crm-row-actions">${currentUser.role === "admin" ? button("new-salesperson", "+ Add salesperson") + button("import-leads", "Import leads") : ""}${button("refresh", "Refresh")}${button("new-lead", "+ New Lead", "", "primary-button")}</div></div>
    <div class="crm-metrics">${[
      ["Total leads", state.leads.length],
      [
        "Calls today",
        state.calls.filter(
          (c) =>
            day(c.createdAt) === today() &&
            (currentUser.role === "admin" || c.actorId === currentUser.id),
        ).length,
      ],
      ["Confirmed sales", state.sales.filter((s) => s.confirmedAt).length],
      ["Follow-ups due", state.leads.filter(due).length],
    ]
      .map(
        ([label, value]) =>
          `<article><p>${label}</p><strong>${value}</strong></article>`,
      )
      .join("")}</div>
    <section class="panel crm-panel"><h3>Leads</h3><div class="crm-filters"><label>Search leads<input id="crmSearch" placeholder="Name or mobile number" value="${e(old.search)}"></label>${
      currentUser.role === "admin"
        ? `<label>Salesperson<select id="crmOwner"><option value="">All</option>${options(
            state.users.filter((u) => u.role === "salesperson"),
            old.owner,
          )}<option value="unassigned" ${old.owner === "unassigned" ? "selected" : ""}>Unassigned</option></select></label>`
        : ""
    }<label>Service<select id="crmService"><option value="">All services</option>${options(state.services, old.service)}</select></label><label>Stage<select id="crmStage"><option value="">All</option>${options(stages, old.stage)}</select></label><label>Follow-up<select id="crmFollow">${options(
      [
        { id: "", name: "All" },
        { id: "today", name: "Today" },
        { id: "overdue", name: "Overdue" },
        { id: "upcoming", name: "Upcoming" },
      ],
      old.follow,
    )}</select></label></div><div class="crm-table-wrap"><table class="crm-table"><thead><tr><th>Lead</th><th>Salesperson</th><th>Stage</th><th>Next follow-up (IST)</th><th>Actions</th></tr></thead><tbody id="crmLeadRows"></tbody></table></div></section>
    <section class="panel crm-panel"><h3>Today’s and overdue follow-ups</h3><div class="crm-table-wrap"><table class="crm-table"><thead><tr><th>Lead</th><th>Salesperson</th><th>Stage</th><th>Follow-up time (IST)</th><th>Actions</th></tr></thead><tbody>${
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
    }</tbody></table></div></section>${purchaseQueue()}`;
    ["crmSearch", "crmOwner", "crmStage", "crmFollow", "crmService"].forEach(
      (id) =>
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
      service = document.querySelector("#crmService").value,
      stage = document.querySelector("#crmStage").value,
      follow = document.querySelector("#crmFollow").value;
    const filtered = state.leads.filter(
      (l) =>
        `${l.name} ${l.phone} ${l.service} ${l.source}`
          .toLowerCase()
          .includes(q) &&
        (!person ||
          (person === "unassigned"
            ? !l.assignedTo
            : l.assignedTo === person)) &&
        (!service || l.serviceId === service) &&
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
      `<div class="crm-form-grid">${fields("Name", input("name", l.name, "text", 'required maxlength="120"'))}${fields("Mobile number", input("phone", l.phone, "tel", "required"))}${fields("City", input("city", l.city))}${fields(
        "Service of interest",
        select(
          "serviceId",
          state.services.filter((s) => s.active || s.id === l.serviceId),
          l.serviceId || "pdc",
          "required",
        ),
      )}${fields("Lead source", input("source", l.source || "Other", "text", 'required maxlength="120" list="crmSourceSuggestions"'))}<datalist id="crmSourceSuggestions">${sources.map((v) => `<option value="${e(v)}">`).join("")}</datalist>${fields("Source details / campaign", input("sourceDetails", l.sourceDetails, "text", 'maxlength="500"'))}${["admin", "teamleader"].includes(currentUser.role) ? fields("Salesperson", `<select name="assignedTo"><option value="">Unassigned</option>${options(salespeople(), l.assignedTo)}</select>`) : ""}${fields(
        "Stage",
        select(
          "stage",
          stages.filter((s) => s !== "Purchased"),
          l.stage,
        ),
      )}${fields("Priority", select("priority", ["Hot", "Warm", "Cold"], l.priority || "Warm"))}${fields("Next follow-up (your local time)", input("followUpAt", local(l.followUpAt), "datetime-local"))}${fields("Reason for lost / deferred / invalid lead", input("reason", l.reason))}${fields("Notes", `<textarea name="notes" rows="3" maxlength="5000">${e(l.notes)}</textarea>`)}</div>`,
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
      )}${fields("Next follow-up (your local time)", input("followUpAt", local(l.followUpAt), "datetime-local"))}${fields("Reason for lost / deferred / invalid lead", input("reason", l.reason))}${fields("Call duration (seconds, optional)", input("durationSeconds", "", "number", 'min="0" max="86400" step="1"'))}${fields("What did you discuss?", `<textarea name="notes" required rows="4" maxlength="5000"></textarea>`)}</div>`,
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
    const service = state.services.find((s) => s.id === l.serviceId) || {
      kind: "pdc",
      months: 3,
    };
    modal(
      `Record purchase · ${l.name}`,
      `<div class="crm-form-grid">${fields("Purchased plan", input("plan", l.service, "text", "required"))}${fields("Plan duration (months)", input("months", service.months, "number", 'required min="1" max="60"'))}${fields("Total service amount (₹)", input("amount", service.price || "", "number", 'required min="1" step="0.01"'))}${fields("Received amount (₹)", input("received", 0, "number", 'required min="0" step="0.01"'))}${fields("Payment mode", select("paymentMode", ["UPI", "Online", "Cash", "Bank Transfer", "Card"], "UPI"))}${fields("Service start date", input("startDate", today(), "date", "required"))}${service.kind === "pdc" ? fields("Nutritionist", select("nutritionist", state.nutritionists || ["Dr Luv Patel", "Dt Nilesh Lakhani"], "Dr Luv Patel")) : fields("Service delivery leader", input("deliveryOwner", service.deliveryOwner))}</div>${currentUser.role === "admin" ? '<label class="crm-checkbox"><input type="checkbox" name="confirmed"> I have verified this purchase and payment.</label>' : "<p>The admin will verify payment before this becomes a confirmed sale.</p>"}`,
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
            ? "Purchase confirmed."
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
    d.innerHTML = `<div class="crm-dialog-heading"><div><h3 id="crmDialogTitle">${e(l.name)}</h3><a href="tel:${e(l.phone)}">${e(l.phone)}</a></div>${button("close", "Close")}</div><dl class="crm-detail-grid"><div><dt>Salesperson</dt><dd>${e(owner(l.assignedTo))}</dd></div><div><dt>Stage</dt><dd>${e(l.stage)}</dd></div><div><dt>Source</dt><dd>${e(l.source)}</dd></div><div><dt>Service</dt><dd>${e(l.service)}</dd></div><div><dt>City</dt><dd>${e(l.city) || "—"}</dd></div><div><dt>Next follow-up (IST)</dt><dd>${when(l.followUpAt)}</dd></div></dl><p>${e(l.notes)}</p>${l.sourceDetails ? `<p><strong>Campaign / source details:</strong> ${e(l.sourceDetails)}</p>` : ""}${l.reason ? `<p><strong>Reason:</strong> ${e(l.reason)}</p>` : ""}<div class="crm-row-actions">${button("add-note", "Add activity note", id)}<button type="button" class="ghost-button" data-ops="message" data-id="${e(id)}">WhatsApp follow-up</button>${l.stage !== "Purchased" ? button("edit-lead", "Edit lead", id) : ""}${!closed(l) ? button("call", "Log call", id) : ""}${!sale && !closed(l) ? button("sale", "Record purchase", id, "primary-button") : ""}</div>${sale ? `<section class="crm-purchase"><h4>${sale.confirmedAt ? "Confirmed purchase" : "Payment confirmation pending"}</h4><p>${e(sale.plan)} · ${sale.months} months · ${e(sale.nutritionist || sale.deliveryOwner || "No delivery leader assigned")}</p><p>Service: ${money(sale.amount)} · Received: ${money(sale.received)} · Pending: ${money(sale.amount - sale.received)}</p>${!sale.confirmedAt && currentUser.role === "admin" ? button("confirm-sale", "Confirm purchase", id, "primary-button") + button("cancel-sale", "Cancel pending purchase", id) : ""}${sale.confirmedAt && !sale.clientId && currentUser.role === "admin" && sale.received < sale.amount ? button("add-payment", "Record payment", id) : ""}</section>` : ""}${activityTimeline(id)}<h4>Call history (${calls.length}) · ${duration(calls.reduce((n, c) => n + (c.durationSeconds || 0), 0))} total</h4><div class="crm-timeline">${calls.map((c) => `<article><strong>${e(c.outcome)}</strong><small>Stage: ${e(c.stage || "—")} · Duration: ${c.durationSeconds == null ? "Not recorded" : duration(c.durationSeconds)}</small><small>${when(c.createdAt)} · ${e(c.actorName)}</small><p>${e(c.notes)}</p><button type="button" class="ghost-button" data-ops="insight" data-id="${e(c.id)}">Recording & summary</button>${c.summary ? `<p><strong>AI summary — review for accuracy:</strong> ${e(c.summary)}</p>` : ""}${c.reason ? `<p><strong>Reason:</strong> ${e(c.reason)}</p>` : ""}${c.followUpAt ? `<small>Next follow-up: ${when(c.followUpAt)}</small>` : ""}</article>`).join("") || "<p>No calls logged yet.</p>"}</div>`;
    d.showModal();
  }
  async function loadReports() {
    const from = document.querySelector("#reportFrom")?.value || "",
      to = document.querySelector("#reportTo")?.value || "",
      person = document.querySelector("#reportOwner")?.value || "",
      serviceId = document.querySelector("#reportService")?.value || "",
      source = document.querySelector("#reportSource")?.value || "";
    const query = new URLSearchParams({
      from,
      to,
      salesperson: person,
      serviceId,
      source,
    });
    [reports, analytics] = await Promise.all([
      api(`/api/reports?${query}`),
      api(`/api/analytics?${query}`),
    ]);
    const t = analytics.totals;
    const summary = metrics([
      ["Call attempts", t.attempts],
      ["Confirmed purchases", t.confirmed],
      ["Unique confirmed people", t.people],
      ["Awaiting approval", t.awaitingApproval],
      ["Service value", money(t.revenue)],
      ["Received", money(t.received)],
      ["Pending collection", money(t.pending)],
      ["Talk time recorded", duration(t.talkTimeSeconds)],
    ]);
    document.querySelector("#view-sales-reports").innerHTML =
      `<div class="crm-page-heading"><div><h2>Sales reports</h2><p>Understand who worked each lead, what happened and which services converted.</p></div><div class="crm-row-actions">${currentUser.role === "admin" ? button("new-salesperson", "+ Add salesperson") : ""}${button("analytics-export", "Export current table")}</div></div>${summary}
      <section class="panel crm-panel"><div class="crm-row-actions crm-periods">${button("period-today", "Today")}${button("period-week", "This week")}${button("period-month", "This month")}${button("period-all", "All time")}</div>
      <div class="crm-filters"><label>From<input id="reportFrom" type="date" value="${e(from)}"></label><label>To<input id="reportTo" type="date" value="${e(to)}"></label>${
        currentUser.role === "admin"
          ? `<label>Salesperson<select id="reportOwner"><option value="">All salespeople and admin activity</option>${options(
              state.users.filter((u) => u.role === "salesperson"),
              person,
            )}</select></label>`
          : ""
      }<label>Service<select id="reportService"><option value="">All services</option>${options(state.services, serviceId)}</select></label><label>Source<select id="reportSource"><option value="">All sources</option>${options([...new Set(state.leads.map((l) => l.source))].sort(), source)}</select></label>${button("report-refresh", "Apply filters", "", "primary-button")}</div>
      <div class="crm-row-actions crm-periods" aria-label="Report tables">${[
        ["salespeople", "Salespeople"],
        ["services", "Services"],
        ["sources", "Lead sources"],
        ["effort", "Lead effort"],
        ["calls", "Call log"],
      ]
        .map(([key, label]) =>
          button(
            "report-tab",
            label,
            key,
            reportTab === key ? "primary-button" : "ghost-button",
          ),
        )
        .join("")}</div><div id="reportTable"></div>
      <p class="crm-help">Dates use IST. Lead counts use creation dates; calls use call dates; purchases use confirmation dates. A person buying two services counts as two purchases and one unique person. Collections reflect the current balance of purchases in this period. Missing call duration is excluded from talk time. Lead conversion uses leads created in the period; call conversion uses distinct connected leads in the period. Admin calls appear in service/source totals and the call log, while the salesperson table lists salespeople only.</p></section>
      <div class="crm-notice">Current workload: ${t.unworked} open leads with no calls · ${t.overdue} follow-ups overdue. These counts are not limited by report dates.</div>`;
    renderReportTable();
  }
  function reportData() {
    if (reportTab === "salespeople")
      return {
        headers: [
          "Salesperson",
          "Assigned leads",
          "Call attempts",
          "Connected calls",
          "No answer",
          "Switched off",
          "Invalid number",
          "Connection %",
          "Connected leads",
          "Talk time",
          "Confirmed purchases",
          "Service value",
          "Received",
          "Pending",
          "Follow-ups due",
          "Lead conversion %",
          "Call conversion %",
        ],
        rows: reports.map((r) => [
          r.name,
          r.assigned,
          r.attempts,
          r.connectedCalls,
          r.noAnswer,
          r.switchedOff,
          r.invalidNumber,
          r.connectionRate.toFixed(1),
          r.connected,
          duration(r.talkTimeSeconds),
          r.buyers,
          money(r.revenue),
          money(r.received),
          money(r.pending),
          r.due,
          r.leadConversion.toFixed(1),
          r.callConversion.toFixed(1),
        ]),
      };
    if (["services", "sources"].includes(reportTab))
      return {
        headers: [
          reportTab === "services" ? "Service" : "Source",
          "New leads",
          "Calls",
          "Connected calls",
          "Leads worked",
          "Confirmed purchases",
          "Unique people",
          "Talk time",
          "Service value",
          "Received",
          "Pending",
        ],
        rows: (reportTab === "services"
          ? analytics.byService
          : analytics.bySource
        ).map((r) => [
          r.name,
          r.leads,
          r.attempts,
          r.connected,
          r.workedLeads,
          r.confirmed,
          r.people,
          duration(r.talkTimeSeconds),
          money(r.revenue),
          money(r.received),
          money(r.pending),
        ]),
      };
    if (reportTab === "effort")
      return {
        headers: [
          "Lead",
          "Phone",
          "Service",
          "Salesperson",
          "Stage",
          "Calls",
          "Connected",
          "Activities",
          "Talk time",
          "Last call (IST)",
          "Latest discussion",
          "Next follow-up (IST)",
        ],
        rows: analytics.effort.map((r) => [
          r.name,
          r.phone,
          r.service,
          r.owner,
          r.stage,
          r.attempts,
          r.connected,
          r.activities,
          duration(r.talkTimeSeconds),
          when(r.lastCallAt),
          r.lastNote,
          when(r.followUpAt),
        ]),
        ids: analytics.effort.map((r) => r.id),
      };
    return {
      headers: [
        "Time (IST)",
        "Salesperson",
        "Lead",
        "Service",
        "Outcome",
        "Stage",
        "Duration",
        "Discussion",
        "Next follow-up (IST)",
      ],
      rows: analytics.calls.map((c) => [
        when(c.createdAt),
        c.actorName,
        c.leadName,
        c.serviceName,
        c.outcome,
        c.stage || "—",
        c.durationSeconds == null
          ? "Not recorded"
          : duration(c.durationSeconds),
        c.notes,
        when(c.followUpAt),
      ]),
      ids: analytics.calls.map((c) => c.leadId),
    };
  }
  function renderReportTable() {
    const { headers, rows, ids } = reportData();
    document.querySelector("#reportTable").innerHTML = table(
      headers.concat(ids ? ["Details"] : []),
      rows.map((r, i) =>
        r
          .map(e)
          .concat(
            ids
              ? [
                  ids[i] && state.leads.some((l) => l.id === ids[i])
                    ? button("detail", "Open", ids[i])
                    : "—",
                ]
              : [],
          ),
      ),
    );
  }
  const duration = (seconds) =>
    `${Math.floor((seconds || 0) / 60)}m ${Math.round((seconds || 0) % 60)}s`;
  const metrics = (entries) =>
    `<div class="crm-metrics">${entries.map(([label, value]) => `<article><p>${e(label)}</p><strong>${e(value)}</strong></article>`).join("")}</div>`;
  const table = (headers, rows) =>
    `<div class="crm-table-wrap"><table class="crm-table"><thead><tr>${headers.map((h) => `<th>${e(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${headers.length}" class="crm-empty">No records match this view.</td></tr>`}</tbody></table></div>`;
  function activityTimeline(id) {
    const entries = (state.activities || [])
      .filter((a) => a.leadId === id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return `<h4>Activity history</h4><div class="crm-timeline">${entries.map((a) => `<article><strong>${e(a.type.replaceAll("_", " "))}</strong><small>${when(a.createdAt)} · ${e(a.actorName)}</small><p>${e(a.text)}</p></article>`).join("") || "<p>No activity notes yet.</p>"}</div>`;
  }
  function purchaseQueue() {
    const sales = state.sales.filter((s) => !s.confirmedAt);
    return `<section class="panel crm-panel"><h3>Purchases awaiting admin approval (${sales.length})</h3>${table(
      ["Lead", "Service", "Salesperson", "Amount", "Received", "Review"],
      sales.map((s) => [
        e(state.leads.find((l) => l.id === s.leadId)?.name || "Lead"),
        e(s.serviceName || s.plan),
        e(owner(s.salespersonId)),
        money(s.amount),
        money(s.received),
        button("detail", "Review purchase", s.leadId),
      ]),
    )}</section><section class="panel crm-panel"><h3>Confirmed service purchases</h3>${table(
      [
        "Lead",
        "Service",
        "Delivery leader",
        "Confirmed (IST)",
        "Received",
        "Pending",
        "Details",
      ],
      state.sales
        .filter((s) => s.confirmedAt)
        .map((s) => [
          e(state.leads.find((l) => l.id === s.leadId)?.name || "Lead"),
          e(s.serviceName || s.plan),
          e(s.deliveryOwner || s.nutritionist || "—"),
          when(s.confirmedAt),
          money(s.received),
          money(s.amount - s.received),
          button("detail", "Open", s.leadId),
        ]),
    )}</section>`;
  }
  function renderServices() {
    if (currentUser.role !== "admin") return;
    document.querySelector("#view-services").innerHTML =
      `<div class="crm-page-heading"><div><h2>Services</h2><p>Add every service you sell, with a default price, duration and delivery leader.</p></div>${button("new-service", "+ Add service", "", "primary-button")}</div><section class="panel crm-panel">${table(
        [
          "Service",
          "Type",
          "Default price",
          "Months",
          "Delivery leader",
          "Status",
          "Actions",
        ],
        state.services.map((s) => [
          `<strong>${e(s.name)}</strong><small>${e(s.description)}</small>`,
          s.kind === "pdc" ? "PDC counselling" : "General service",
          money(s.price),
          e(s.months),
          e(s.deliveryOwner || "—"),
          s.active ? "Active" : "Archived",
          button("edit-service", "Edit", s.id),
        ]),
      )}<p class="crm-help">PDC counselling purchases create a client and monthly meeting schedule. General services are tracked in CRM with their own purchase, delivery leader and payments. Archive a service to stop new lead intake while retaining its reports.</p></section>`;
  }
  function serviceForm(id) {
    const s = state.services.find((s) => s.id === id) || {
      kind: "general",
      months: 1,
      price: 0,
      active: true,
    };
    modal(
      id ? "Edit service" : "Add service",
      `<div class="crm-form-grid">${fields("Service name", input("name", s.name, "text", 'required maxlength="120"'))}${fields(
        "Service type",
        select(
          "kind",
          [
            { id: "general", name: "General service" },
            { id: "pdc", name: "PDC counselling with monthly meetings" },
          ],
          s.kind,
        ),
      )}${fields("Default price (₹)", input("price", s.price, "number", 'required min="0" max="100000000" step="0.01"'))}${fields("Default duration (months)", input("months", s.months, "number", 'required min="1" max="60"'))}${fields("Delivery leader / service owner", input("deliveryOwner", s.deliveryOwner, "text", 'maxlength="120"'))}${fields(
        "Status",
        select(
          "active",
          [
            { id: "true", name: "Active" },
            { id: "false", name: "Archived" },
          ],
          String(s.active),
        ),
      )}${fields("Description", `<textarea name="description" rows="3" maxlength="2000">${e(s.description)}</textarea>`)}</div>`,
      "Save service",
      async (b) => {
        b.active = b.active === "true";
        if (id) b.expectedUpdatedAt = s.updatedAt;
        await api(id ? `/api/services/${id}` : "/api/services", {
          method: id ? "PATCH" : "POST",
          body: JSON.stringify(b),
        });
        showToast("Service saved.");
      },
    );
  }
  function exportCSV(headers, rows, name) {
    const quote = (v) =>
      `"${String(v ?? "")
        .replace(/^[\s]*[=+@-]/, "'$&")
        .replaceAll('"', '""')}"`;
    download(
      "\uFEFF" +
        [headers, ...rows].map((r) => r.map(quote).join(",")).join("\r\n"),
      name,
      "text/csv;charset=utf-8",
    );
  }
  function parseCSV(text) {
    const rows = [];
    let row = [],
      field = "",
      quoted = false;
    text = text.replace(/^\uFEFF/, "");
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (quoted && text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = !quoted;
      } else if (c === "," && !quoted) {
        row.push(field);
        field = "";
      } else if ((c === "\n" || c === "\r") && !quoted) {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        if (row.some((v) => v.trim())) rows.push(row);
        row = [];
        field = "";
      } else field += c;
    }
    if (quoted) throw new Error("CSV has an unclosed quote.");
    row.push(field);
    if (row.some((v) => v.trim())) rows.push(row);
    if (rows.length < 2)
      throw new Error("Include a header and at least one lead.");
    const headers = rows.shift().map((h) => h.trim().toLowerCase());
    if (!headers.includes("name") || !headers.includes("phone"))
      throw new Error("CSV requires name and phone columns.");
    if (rows.length > 500) throw new Error("Import up to 500 leads at a time.");
    return rows.map((r, i) => {
      if (r.length !== headers.length)
        throw new Error(
          `CSV row ${i + 2} has ${r.length} columns; expected ${headers.length}.`,
        );
      return Object.fromEntries(headers.map((h, j) => [h, r[j].trim()]));
    });
  }
  function importLeadsForm() {
    let grid = [],
      headers = [];
    const columns = [
      "name",
      "phone",
      "city",
      "source",
      "notes",
      "sourcedetails",
    ];
    modal(
      "Import Excel / CSV leads",
      `<p>Use the first worksheet of an .xlsx file, or a CSV. Up to 500 rows, 1 MB. Map your columns before importing. Names and phone numbers are required; format mobile numbers as text in Excel.</p><div class="crm-form-grid">${fields(
        "Service",
        select(
          "serviceId",
          state.services.filter((s) => s.active),
          "pdc",
        ),
      )}${fields("Assign salesperson", `<select name="assignedTo"><option value="">Use automatic assignment / unassigned</option>${options(salespeople(), "")}</select>`)}${fields("Default source", input("source", "Excel"))}${fields("Excel or CSV file", '<input id="leadCSV" type="file" accept=".xlsx,.csv" required>')}</div><label class="crm-checkbox"><input type="checkbox" name="skipDuplicates" checked>Skip mobile numbers already present for this service</label><div id="importMapping"></div><div id="importPreview">Choose a file.</div>`,
      "Import leads",
      async (b) => {
        if (!grid.length) throw new Error("Choose a valid file.");
        if (b.map_name === "" || b.map_phone === "")
          throw new Error("Map name and phone columns.");
        const leads = grid.map((row) => {
          const v = Object.fromEntries(
            columns.map((c) => [
              c,
              b["map_" + c] === ""
                ? ""
                : String(row[Number(b["map_" + c])] || "").trim(),
            ]),
          );
          return {
            name: v.name,
            phone: v.phone,
            city: v.city,
            source: v.source || b.source,
            notes: v.notes,
            sourceDetails: v.sourcedetails,
            serviceId: b.serviceId,
            assignedTo: b.assignedTo,
          };
        });
        const r = await api("/api/leads/import", {
          method: "POST",
          body: JSON.stringify({
            leads,
            skipDuplicates: b.skipDuplicates === "on",
          }),
        });
        showToast(`${r.count} imported, ${r.skipped || 0} duplicates skipped.`);
      },
    );
    document.querySelector("#leadCSV").onchange = async (event) => {
      grid = [];
      headers = [];
      const preview = document.querySelector("#importPreview"),
        mapping = document.querySelector("#importMapping");
      mapping.innerHTML = "";
      try {
        const file = event.target.files[0];
        if (!file) return;
        if (file.size > 1000000) throw new Error("File must be under 1 MB.");
        if (file.name.toLowerCase().endsWith(".xlsx")) {
          const buffer = new Uint8Array(await file.arrayBuffer());
          let binary = "";
          for (const byte of buffer) binary += String.fromCharCode(byte);
          const r = await api("/api/operations/excel-preview", {
            method: "POST",
            body: JSON.stringify({ file: btoa(binary) }),
          });
          headers = r.headers;
          grid = r.rows;
        } else {
          const raw = await file.text();
          let row = [],
            value = "",
            quoted = false,
            all = [];
          for (let i = 0; i < raw.length; i++) {
            const c = raw[i];
            if (c === '"') {
              if (quoted && raw[i + 1] === '"') {
                value += '"';
                i++;
              } else quoted = !quoted;
            } else if (c === "," && !quoted) {
              row.push(value);
              value = "";
            } else if ((c === "\n" || c === "\r") && !quoted) {
              if (c === "\r" && raw[i + 1] === "\n") i++;
              row.push(value);
              if (row.some((x) => x.trim())) all.push(row);
              row = [];
              value = "";
            } else value += c;
          }
          if (quoted) throw new Error("CSV has an unclosed quote.");
          row.push(value);
          if (row.some((x) => x.trim())) all.push(row);
          headers = (all.shift() || []).map((x) =>
            x.replace(/^\uFEFF/, "").trim(),
          );
          grid = all;
          if (grid.some((r) => r.length !== headers.length))
            throw new Error("CSV rows have inconsistent columns.");
        }
        if (!grid.length || grid.length > 500 || headers.length > 40)
          throw new Error("Use a header and 1–500 rows, up to 40 columns.");
        const aliases = {
          name: ["name", "full name", "client name"],
          phone: ["phone", "mobile", "mobile number", "phone number"],
          city: ["city"],
          source: ["source"],
          notes: ["notes"],
          sourcedetails: ["sourcedetails", "campaign"],
        };
        mapping.innerHTML =
          '<h4>Map columns</h4><div class="crm-form-grid">' +
          columns
            .map((c) => {
              const i = headers.findIndex((h) =>
                aliases[c].includes(h.toLowerCase()),
              );
              return fields(
                c,
                `<select name="map_${c}"><option value="">Not mapped</option>${headers.map((h, j) => `<option value="${j}" ${i === j ? "selected" : ""}>${e(h)}</option>`).join("")}</select>`,
              );
            })
            .join("") +
          "</div>";
        preview.innerHTML = `<p>${grid.length} rows found. First 5 shown:</p>${table(
          headers,
          grid.slice(0, 5).map((r) => r.map(e)),
        )}`;
      } catch (err) {
        grid = [];
        preview.textContent = err.message;
      }
    };
  }

  function renderSalesOverview() {
    if (currentUser.role !== "admin") {
      document.querySelector("#salesOverview")?.remove();
      return;
    }
    let el = document.querySelector("#salesOverview");
    if (!el) {
      el = document.createElement("section");
      el.id = "salesOverview";
      el.className = "panel crm-panel";
      document.querySelector("#view-overview").prepend(el);
    }
    el.innerHTML = `<div class="crm-page-heading"><div><h3>Sales operations</h3><p>${state.services.filter((s) => s.active).length} active services · ${salespeople().length} active salespeople · ${state.leads.filter((l) => !l.assignedTo && !closed(l)).length} leads awaiting assignment</p></div><div class="crm-row-actions">${button("open-crm", "Open CRM")}${button("open-reports", "View reports", "", "primary-button")}</div></div>${metrics(
      [
        ["Open leads", state.leads.filter((l) => !closed(l)).length],
        [
          "Calls today",
          state.calls.filter((c) => day(c.createdAt) === today()).length,
        ],
        [
          "Confirmed purchases",
          state.sales.filter((s) => s.confirmedAt).length,
        ],
        ["Awaiting approval", state.sales.filter((s) => !s.confirmedAt).length],
      ],
    )}`;
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
          "new-salesperson",
          "new-service",
          "edit-service",
          "import-leads",
          "add-note",
          "add-payment",
          "cancel-sale",
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
      if (action === "open-crm") switchView("view-crm");
      if (action === "open-reports") switchView("view-sales-reports");
      if (action === "refresh") await refresh();
      if (action === "new-service") serviceForm();
      if (action === "edit-service") serviceForm(id);
      if (action === "import-leads") importLeadsForm();
      if (action === "report-tab") {
        reportTab = id;
        await loadReports();
      }
      if (action === "analytics-export") {
        const { headers, rows } = reportData();
        exportCSV(headers, rows, `pdc-${reportTab}-${today()}.csv`);
      }
      if (action === "add-note")
        modal(
          "Add activity note",
          fields(
            "What work was done?",
            '<textarea name="text" required maxlength="5000" rows="5"></textarea>',
          ),
          "Save note",
          async (b) => {
            await api(`/api/leads/${id}/notes`, {
              method: "POST",
              body: JSON.stringify(b),
            });
            showToast("Activity saved.");
          },
        );
      if (action === "cancel-sale")
        modal(
          "Cancel pending purchase",
          fields(
            "Reason",
            '<textarea name="reason" required maxlength="1000"></textarea>',
          ),
          "Cancel purchase",
          async (b) => {
            await api(`/api/leads/${id}/cancel-sale`, {
              method: "POST",
              body: JSON.stringify(b),
            });
            showToast("Pending purchase cancelled.");
          },
        );
      if (action === "add-payment") {
        const sale = state.sales.find((s) => s.leadId === id),
          requestId = crypto.randomUUID();
        modal(
          "Record payment",
          `<p>Pending balance: ${money(sale.amount - sale.received)}</p>${fields("Amount received (₹)", input("amount", "", "number", `required min="0.01" step="0.01" max="${sale.amount - sale.received}"`))}${fields("Payment reference / note", input("note", "", "text", 'required maxlength="1000"'))}`,
          "Save payment",
          async (b) => {
            await api(`/api/leads/${id}/payment`, {
              method: "POST",
              body: JSON.stringify({ ...b, requestId }),
            });
            showToast("Payment recorded.");
          },
        );
      }
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
            "Confirm that you have verified this purchase and payment? PDC services also create a counselling client.",
          )
        )
          return;
        target.disabled = true;
        await api(`/api/leads/${id}/confirm`, { method: "POST" });
        d.close();
        if (currentUser) await refresh();
        showToast("Purchase confirmed.");
      }
      if (action === "new-user" || action === "new-salesperson")
        modal(
          action === "new-salesperson" ? "Add salesperson" : "Add team member",
          `<div class="crm-form-grid">${fields("Name", input("name", "", "text", "required"))}${fields("Email", input("email", "", "email", "required"))}${action === "new-salesperson" ? '<input type="hidden" name="role" value="salesperson">' : fields("Role", select("role", ["salesperson", "teamleader", "nutritionist", "admin"], "salesperson"))}${fields("Initial password", input("password", "", "password", 'required minlength="5" autocomplete="new-password"'))}</div><p>Each salesperson signs in with their own email and password at this dashboard URL. They can access their assigned leads and personal sales reports.</p>${action === "new-user" ? "<p>Nutritionist accounts appear in the client assignment list and can read only their assigned clients.</p>" : ""}`,
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
          "Connected calls",
          "No answer",
          "Switched off",
          "Invalid number",
          "Connection rate %",
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
              r.connectedCalls,
              r.noAnswer,
              r.switchedOff,
              r.invalidNumber,
              r.connectionRate.toFixed(1),
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
  window.addEventListener("pdc:view", (event) => {
    if (
      currentUser &&
      [
        "view-crm",
        "view-sales-reports",
        "view-services",
        "view-team",
        "view-operations",
      ].includes(event.detail) &&
      !refreshing
    )
      refresh().catch(toast);
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && currentUser) refresh().catch(toast);
  });
  window.addEventListener("unhandledrejection", (event) => {
    toast(event.reason);
  });
  init();
})();
