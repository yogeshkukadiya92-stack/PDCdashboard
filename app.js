const storageKey = "pdc-dashboard-clients-v7";
const sheetUrlStorageKey = "pdc-dashboard-sheet-web-app-url";
const legacyStorageKeys = [];
const renewalReminderWindowDays = 20;

const seedClients = [
  {
    id: crypto.randomUUID(),
    name: "Riya Sharma",
    phone: "9876543210",
    planMonths: 3,
    serviceAmount: 15000,
    receivedAmount: 9000,
    paymentMode: "UPI",
    startDate: "2026-06-01",
    endDate: "2026-08-31",
    meetingDate: "2026-06-08",
    followUpDate: "",
    status: "Active",
    notes: "Weight loss plan, monthly progress review.",
    createdAt: new Date().toISOString()
  },
  {
    id: crypto.randomUUID(),
    name: "Amit Patel",
    phone: "9123456780",
    planMonths: 6,
    serviceAmount: 24000,
    receivedAmount: 24000,
    paymentMode: "Online",
    startDate: "2026-05-15",
    endDate: "2026-11-14",
    meetingDate: "2026-06-15",
    followUpDate: "",
    status: "Active",
    notes: "Diabetes-friendly meal counselling.",
    createdAt: new Date().toISOString()
  },
  {
    id: crypto.randomUUID(),
    name: "Neha Verma",
    phone: "9988776655",
    planMonths: 1,
    serviceAmount: 6000,
    receivedAmount: 3000,
    paymentMode: "Cash",
    startDate: "2026-05-20",
    endDate: "2026-06-19",
    meetingDate: "2026-06-04",
    followUpDate: "",
    status: "Active",
    notes: "Follow-up for diet compliance.",
    createdAt: new Date().toISOString()
  }
];

let clients = loadClients();
let selectedClientId = clients[0]?.id || "";

const elements = {
  todayLabel: document.querySelector("#todayLabel"),
  totalClients: document.querySelector("#totalClients"),
  monthMeetings: document.querySelector("#monthMeetings"),
  pendingAmount: document.querySelector("#pendingAmount"),
  dueSoonCount: document.querySelector("#dueSoonCount"),
  clientForm: document.querySelector("#clientForm"),
  clientId: document.querySelector("#clientId"),
  clientName: document.querySelector("#clientName"),
  phone: document.querySelector("#phone"),
  planMonths: document.querySelector("#planMonths"),
  serviceAmount: document.querySelector("#serviceAmount"),
  receivedAmount: document.querySelector("#receivedAmount"),
  paymentMode: document.querySelector("#paymentMode"),
  startDate: document.querySelector("#startDate"),
  endDate: document.querySelector("#endDate"),
  meetingDate: document.querySelector("#meetingDate"),
  followUpDate: document.querySelector("#followUpDate"),
  status: document.querySelector("#status"),
  notes: document.querySelector("#notes"),
  clientTable: document.querySelector("#clientTable"),
  reminderList: document.querySelector("#reminderList"),
  searchInput: document.querySelector("#searchInput"),
  statusFilter: document.querySelector("#statusFilter"),
  detailClientSelect: document.querySelector("#detailClientSelect"),
  detailSummary: document.querySelector("#detailSummary"),
  meetingHistory: document.querySelector("#meetingHistory"),
  meetingProgress: document.querySelector("#meetingProgress"),
  paymentForm: document.querySelector("#paymentForm"),
  paymentDate: document.querySelector("#paymentDate"),
  paymentAmount: document.querySelector("#paymentAmount"),
  paymentEntryMode: document.querySelector("#paymentEntryMode"),
  paymentNote: document.querySelector("#paymentNote"),
  paymentHistory: document.querySelector("#paymentHistory"),
  installmentTotal: document.querySelector("#installmentTotal"),
  paymentDonut: document.querySelector("#paymentDonut"),
  collectionPercent: document.querySelector("#collectionPercent"),
  collectionText: document.querySelector("#collectionText"),
  ledgerList: document.querySelector("#ledgerList"),
  sheetWebAppUrl: document.querySelector("#sheetWebAppUrl"),
  syncStatus: document.querySelector("#syncStatus"),
  formStatus: document.querySelector("#formStatus"),
  toast: document.querySelector("#toast")
};

function loadClients() {
  const saved = localStorage.getItem(storageKey) || legacyStorageKeys.map((key) => localStorage.getItem(key)).find(Boolean);
  let loadedClients = seedClients;
  if (saved) {
    try {
      loadedClients = JSON.parse(saved);
    } catch {
      legacyStorageKeys.concat(storageKey).forEach((key) => localStorage.removeItem(key));
    }
  }
  const normalized = loadedClients.map(normalizeClient);
  localStorage.setItem(storageKey, JSON.stringify(normalized));
  return normalized;
}

function saveClients() {
  clients = clients.map(normalizeClient);
  localStorage.setItem(storageKey, JSON.stringify(clients));
}

function normalizeClient(client) {
  const normalized = {
    ...client,
    id: client.id || crypto.randomUUID(),
    planMonths: Number(client.planMonths || 1),
    serviceAmount: Number(client.serviceAmount || 0),
    receivedAmount: Number(client.receivedAmount || 0),
    paymentMode: client.paymentMode || "Online",
    status: client.status || "Active",
    followUpDate: client.followUpDate || "",
    createdAt: client.createdAt || new Date().toISOString()
  };

  normalized.endDate = normalized.endDate || planEndDate(normalized.startDate, normalized.planMonths);
  normalized.payments = normalizePayments(normalized);
  normalized.receivedAmount = receivedFor(normalized);
  normalized.meetings = normalizeMeetings(normalized);
  normalized.meetingDate = nextMeetingFor(normalized)?.date || normalized.meetingDate || normalized.startDate;
  return normalized;
}

function normalizePayments(client) {
  if (Array.isArray(client.payments)) {
    return client.payments.map((payment) => ({
      id: payment.id || crypto.randomUUID(),
      date: payment.date || client.startDate,
      amount: Number(payment.amount || 0),
      mode: payment.mode || client.paymentMode || "Online",
      note: payment.note || ""
    }));
  }

  if (Number(client.receivedAmount || 0) <= 0) return [];
  return [
    {
      id: crypto.randomUUID(),
      date: client.startDate,
      amount: Number(client.receivedAmount || 0),
      mode: client.paymentMode || "Online",
      note: "Opening received amount"
    }
  ];
}

function normalizeMeetings(client) {
  const generated = generateMonthlyMeetings(client);
  const existing = Array.isArray(client.meetings) ? client.meetings : [];
  return generated.map((meeting) => {
    const match = existing.find((item) => item.id === meeting.id || item.date === meeting.date);
    return {
      ...meeting,
      status: match?.status || meeting.status,
      notes: match?.notes || "",
      weight: match?.weight || "",
      goal: match?.goal || ""
    };
  });
}

function generateMonthlyMeetings(client) {
  const start = client.meetingDate || client.startDate;
  const months = Math.max(Number(client.planMonths || 1), 1);
  return Array.from({ length: months }, (_, index) => ({
    id: `meeting-${index + 1}-${start}`,
    date: addCalendarMonths(start, index),
    status: "Pending",
    notes: "",
    weight: "",
    goal: ""
  }));
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(`${value}T00:00:00`));
}

function dateDiffInDays(value) {
  const today = new Date();
  const target = new Date(`${value}T00:00:00`);
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function addCalendarMonths(dateValue, months) {
  const date = new Date(`${dateValue}T00:00:00`);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + Number(months || 0));
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, lastDay));
  return toDateValue(date);
}

function planEndDate(dateValue, months) {
  const date = new Date(`${addCalendarMonths(dateValue, months)}T00:00:00`);
  date.setDate(date.getDate() - 1);
  return toDateValue(date);
}

function toDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function receivedFor(client) {
  return (client.payments || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
}

function pendingFor(client) {
  return Math.max(Number(client.serviceAmount || 0) - receivedFor(client), 0);
}

function nextMeetingFor(client) {
  const pending = (client.meetings || [])
    .filter((meeting) => meeting.status === "Pending")
    .sort((a, b) => new Date(`${a.date}T00:00:00`) - new Date(`${b.date}T00:00:00`));
  return pending.find((meeting) => dateDiffInDays(meeting.date) >= 0) || pending[0] || client.meetings?.at(-1);
}

function renewalDaysFor(client) {
  return dateDiffInDays(client.endDate);
}

function getMeetingBadge(days) {
  if (days < 0) return `<span class="badge danger">Overdue</span>`;
  if (days === 0) return `<span class="badge danger">Today</span>`;
  if (days <= 7) return `<span class="badge warning">${days} days</span>`;
  return `<span class="badge success">Scheduled</span>`;
}

function getStatusBadge(status) {
  const className = status === "Completed" ? "success" : status === "Paused" || status === "Interested" ? "warning" : "";
  return `<span class="badge ${className}">${status}</span>`;
}

function getMeetingStatusBadge(status) {
  const className = status === "Done" ? "success" : status === "Missed" ? "danger" : "warning";
  return `<span class="badge ${className}">${status}</span>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function render() {
  ensureSelectedClient();
  renderToday();
  renderSyncStatus();
  renderMetrics();
  renderClients();
  renderReminders();
  renderDetails();
  renderPayments();
  if (window.lucide) lucide.createIcons();
}

function ensureSelectedClient() {
  if (!clients.some((client) => client.id === selectedClientId)) {
    selectedClientId = clients[0]?.id || "";
  }
}

function renderToday() {
  elements.todayLabel.textContent = new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date());
}

function renderSyncStatus() {
  const url = getSheetUrl();
  elements.sheetWebAppUrl.value = url;
  elements.syncStatus.textContent = url ? "Connected" : "Not connected";
  elements.syncStatus.className = `badge ${url ? "success" : "warning"}`;
}

function setFormStatus(message) {
  if (elements.formStatus) {
    elements.formStatus.textContent = message;
  }
}

function filteredClients() {
  const query = elements.searchInput.value.trim().toLowerCase();
  const status = elements.statusFilter.value;
  return clients
    .filter((client) => status === "All" || client.status === status)
    .filter((client) => {
      const haystack = `${client.name} ${client.phone} ${client.status} ${client.paymentMode} ${client.followUpDate}`.toLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => new Date(`${a.meetingDate}T00:00:00`) - new Date(`${b.meetingDate}T00:00:00`));
}

function renderMetrics() {
  const activeClients = clients.filter((client) => client.status === "Active");
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const monthMeetings = activeClients.reduce((count, client) => {
    return (
      count +
      client.meetings.filter((meeting) => {
        const meetingDate = new Date(`${meeting.date}T00:00:00`);
        return meetingDate.getMonth() === currentMonth && meetingDate.getFullYear() === currentYear;
      }).length
    );
  }, 0);
  const pendingAmount = activeClients.reduce((sum, client) => sum + pendingFor(client), 0);
  const dueSoon = activeClients.filter((client) => {
    const next = nextMeetingFor(client);
    const meetingDays = next ? dateDiffInDays(next.date) : 999;
    const renewalDays = renewalDaysFor(client);
    return (meetingDays >= 0 && meetingDays <= 7) || (renewalDays >= 0 && renewalDays <= renewalReminderWindowDays);
  }).length;
  const followUpsDue = clients.filter((client) => {
    if (client.status !== "Interested" || !client.followUpDate) return false;
    const days = dateDiffInDays(client.followUpDate);
    return days <= 7;
  }).length;

  elements.totalClients.textContent = activeClients.length;
  elements.monthMeetings.textContent = monthMeetings;
  elements.pendingAmount.textContent = formatCurrency(pendingAmount);
  elements.dueSoonCount.textContent = dueSoon + followUpsDue;
}

function renderClients() {
  const rows = filteredClients()
    .map((client) => {
      const pending = pendingFor(client);
      const next = nextMeetingFor(client);
      const days = next ? dateDiffInDays(next.date) : 0;
      const initials = client.name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
      return `
        <tr>
          <td>
            <div class="client-main">
              <div class="avatar">${escapeHtml(initials)}</div>
              <div>
                <strong>${escapeHtml(client.name)}</strong>
                <p>${escapeHtml(client.phone)}</p>
              </div>
            </div>
          </td>
          <td>${client.planMonths} month<br><span class="muted">${formatDate(client.startDate)} - ${formatDate(client.endDate)}</span></td>
          <td>${formatDate(next?.date)}<br>${getMeetingBadge(days)}</td>
          <td>${client.followUpDate ? `${formatDate(client.followUpDate)}<br>${getMeetingBadge(dateDiffInDays(client.followUpDate))}` : `<span class="muted">-</span>`}</td>
          <td>${formatCurrency(client.serviceAmount)}</td>
          <td>${formatCurrency(receivedFor(client))}</td>
          <td><strong>${formatCurrency(pending)}</strong></td>
          <td>${escapeHtml(client.paymentMode)}</td>
          <td>${getStatusBadge(client.status)}</td>
          <td>
            <div class="row-actions">
              <button class="action-button" type="button" data-action="profile" data-id="${client.id}" title="View history" aria-label="View history" onclick="event.stopImmediatePropagation(); handleAction(event); return false;"><i data-lucide="history"></i></button>
              <button class="action-button" type="button" data-action="remind" data-id="${client.id}" title="Reminder message" aria-label="Reminder message" onclick="event.stopImmediatePropagation(); handleAction(event); return false;"><i data-lucide="message-circle"></i></button>
              <button class="action-button" type="button" data-action="paid" data-id="${client.id}" title="Mark paid" aria-label="Mark paid" onclick="event.stopImmediatePropagation(); handleAction(event); return false;"><i data-lucide="badge-indian-rupee"></i></button>
              <button class="action-button" type="button" data-action="edit" data-id="${client.id}" title="Edit client" aria-label="Edit client" onclick="event.stopImmediatePropagation(); handleAction(event); return false;"><i data-lucide="pencil"></i></button>
              <button class="action-button" type="button" data-action="delete" data-id="${client.id}" title="Delete client" aria-label="Delete client" onclick="event.stopImmediatePropagation(); handleAction(event); return false;"><i data-lucide="trash-2"></i></button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  elements.clientTable.innerHTML = rows || `<tr><td colspan="10"><div class="empty-state">No clients found. Add your first PDC client from the entry form.</div></td></tr>`;
}

function renderReminders() {
  const meetingItems = clients
    .filter((client) => client.status === "Active")
    .map((client) => ({ client, meeting: nextMeetingFor(client) }))
    .filter((item) => item.meeting && dateDiffInDays(item.meeting.date) <= 7)
    .map((item) => ({ type: "meeting", ...item, days: dateDiffInDays(item.meeting.date) }));

  const renewalItems = clients
    .filter((client) => client.status === "Active")
    .map((client) => ({ type: "renewal", client, days: renewalDaysFor(client) }))
    .filter((item) => item.days >= 0 && item.days <= renewalReminderWindowDays);

  const followUpItems = clients
    .filter((client) => client.status === "Interested" && client.followUpDate)
    .map((client) => ({ type: "followup", client, days: dateDiffInDays(client.followUpDate) }))
    .filter((item) => item.days <= 7);

  const items = meetingItems.concat(renewalItems, followUpItems).sort((a, b) => a.days - b.days);

  elements.reminderList.innerHTML =
    items
      .map((item) => {
        if (item.type === "renewal") {
          return `
            <article class="reminder-item">
              <div>
                <strong>${escapeHtml(item.client.name)} <span class="badge warning">Renewal ${item.days} days</span></strong>
                <p>Plan end: ${formatDate(item.client.endDate)} · Pending: ${formatCurrency(pendingFor(item.client))}</p>
              </div>
              <button class="ghost-button small" type="button" data-action="renewal" data-id="${item.client.id}" onclick="event.stopImmediatePropagation(); handleAction(event); return false;">
                <i data-lucide="repeat"></i>
                Renewal
              </button>
            </article>
          `;
        }
        if (item.type === "followup") {
          return `
            <article class="reminder-item">
              <div>
                <strong>${escapeHtml(item.client.name)} <span class="badge warning">Follow-up ${item.days < 0 ? "Overdue" : `${item.days} days`}</span></strong>
                <p>Interested client · Follow-up: ${formatDate(item.client.followUpDate)} · Phone: ${escapeHtml(item.client.phone)}</p>
              </div>
              <button class="ghost-button small" type="button" data-action="followup" data-id="${item.client.id}" onclick="event.stopImmediatePropagation(); handleAction(event); return false;">
                <i data-lucide="phone-forwarded"></i>
                Follow Up
              </button>
            </article>
          `;
        }
        return `
          <article class="reminder-item">
            <div>
              <strong>${escapeHtml(item.client.name)} ${getMeetingBadge(item.days)}</strong>
              <p>PDC meeting: ${formatDate(item.meeting.date)} · Pending: ${formatCurrency(pendingFor(item.client))}</p>
            </div>
            <button class="ghost-button small" type="button" data-action="remind" data-id="${item.client.id}" onclick="event.stopImmediatePropagation(); handleAction(event); return false;">
              <i data-lucide="send"></i>
              Message
            </button>
          </article>
        `;
      })
      .join("") || `<div class="empty-state">No urgent meetings, renewals, or follow-ups. Alerts appear before meeting date, plan end date, and interested-client follow-up date.</div>`;
}

function renderDetails() {
  renderClientSelect();
  const client = clients.find((item) => item.id === selectedClientId);
  if (!client) {
    elements.detailSummary.innerHTML = `<div class="empty-state">Add a client to see meeting and payment history.</div>`;
    elements.meetingHistory.innerHTML = "";
    elements.paymentHistory.innerHTML = "";
    return;
  }

  const doneMeetings = client.meetings.filter((meeting) => meeting.status === "Done").length;
  const next = nextMeetingFor(client);
  elements.meetingProgress.textContent = `${doneMeetings}/${client.meetings.length} done`;
  elements.installmentTotal.textContent = formatCurrency(receivedFor(client));
  elements.detailSummary.innerHTML = `
    <div class="summary-tile"><p>Selected Client</p><strong>${escapeHtml(client.name)}</strong></div>
    <div class="summary-tile"><p>Next Meeting</p><strong>${formatDate(next?.date)}</strong></div>
    <div class="summary-tile"><p>Plan Renewal</p><strong>${formatDate(client.endDate)}</strong></div>
    <div class="summary-tile"><p>Pending</p><strong>${formatCurrency(pendingFor(client))}</strong></div>
  `;

  elements.meetingHistory.innerHTML = client.meetings
    .map((meeting, index) => {
      const days = dateDiffInDays(meeting.date);
      const detail = [meeting.weight ? `Weight: ${escapeHtml(meeting.weight)} kg` : "", meeting.goal ? `Goal: ${escapeHtml(meeting.goal)}` : "", meeting.notes ? `Notes: ${escapeHtml(meeting.notes)}` : ""]
        .filter(Boolean)
        .join(" · ");
      return `
        <article class="timeline-item">
          <div class="timeline-top">
            <div>
              <strong>Meeting ${index + 1} · ${formatDate(meeting.date)}</strong>
              <div class="timeline-meta">${getMeetingStatusBadge(meeting.status)} ${meeting.status === "Pending" ? getMeetingBadge(days) : ""}</div>
            </div>
            <div class="timeline-actions">
              <button class="ghost-button small" type="button" data-action="meeting-done" data-id="${client.id}" data-meeting-id="${meeting.id}" onclick="event.stopImmediatePropagation(); handleAction(event); return false;"><i data-lucide="check"></i>Done</button>
              <button class="ghost-button small" type="button" data-action="meeting-missed" data-id="${client.id}" data-meeting-id="${meeting.id}" onclick="event.stopImmediatePropagation(); handleAction(event); return false;"><i data-lucide="x"></i>Missed</button>
              <button class="ghost-button small" type="button" data-action="meeting-pending" data-id="${client.id}" data-meeting-id="${meeting.id}" onclick="event.stopImmediatePropagation(); handleAction(event); return false;"><i data-lucide="clock"></i>Pending</button>
              <button class="ghost-button small" type="button" data-action="meeting-note" data-id="${client.id}" data-meeting-id="${meeting.id}" onclick="event.stopImmediatePropagation(); handleAction(event); return false;"><i data-lucide="notebook-pen"></i>Note</button>
            </div>
          </div>
          <p>${detail || "No meeting notes yet."}</p>
        </article>
      `;
    })
    .join("");

  elements.paymentHistory.innerHTML =
    client.payments
      .slice()
      .sort((a, b) => new Date(`${b.date}T00:00:00`) - new Date(`${a.date}T00:00:00`))
      .map(
        (payment) => `
          <article class="timeline-item">
            <div class="timeline-top">
              <div>
                <strong>${formatCurrency(payment.amount)} · ${escapeHtml(payment.mode)}</strong>
                <p>${formatDate(payment.date)}${payment.note ? ` · ${escapeHtml(payment.note)}` : ""}</p>
              </div>
              <button class="action-button" type="button" data-action="payment-delete" data-id="${client.id}" data-payment-id="${payment.id}" title="Delete payment" aria-label="Delete payment" onclick="event.stopImmediatePropagation(); handleAction(event); return false;"><i data-lucide="trash-2"></i></button>
            </div>
          </article>
        `
      )
      .join("") || `<div class="empty-state">No installments recorded yet.</div>`;
}

function renderClientSelect() {
  const options = clients
    .map((client) => `<option value="${client.id}" ${client.id === selectedClientId ? "selected" : ""}>${escapeHtml(client.name)}</option>`)
    .join("");
  elements.detailClientSelect.innerHTML = options;
}

function renderPayments() {
  const totalService = clients.reduce((sum, client) => sum + Number(client.serviceAmount || 0), 0);
  const totalReceived = clients.reduce((sum, client) => sum + receivedFor(client), 0);
  const percent = totalService ? Math.min(Math.round((totalReceived / totalService) * 100), 100) : 0;
  elements.paymentDonut.style.setProperty("--percent", percent);
  elements.collectionPercent.textContent = `${percent}%`;
  elements.collectionText.textContent = `${formatCurrency(totalReceived)} received of ${formatCurrency(totalService)}`;

  const pendingClients = clients
    .filter((client) => pendingFor(client) > 0)
    .sort((a, b) => pendingFor(b) - pendingFor(a));

  elements.ledgerList.innerHTML =
    pendingClients
      .slice(0, 6)
      .map(
        (client) => `
        <div class="ledger-item">
          <div>
            <strong>${escapeHtml(client.name)}</strong>
            <p>${escapeHtml(client.paymentMode)} · ${client.payments.length} installments</p>
          </div>
          <strong>${formatCurrency(pendingFor(client))}</strong>
        </div>
      `
      )
      .join("") || `<div class="empty-state">All visible payments are fully received.</div>`;
}

function resetForm() {
  elements.clientForm.reset();
  elements.clientId.value = "";
  elements.planMonths.value = 3;
  elements.serviceAmount.value = 0;
  elements.receivedAmount.value = 0;
  const today = toDateValue(new Date());
  elements.startDate.value = today;
  elements.meetingDate.value = today;
  elements.followUpDate.value = "";
  elements.endDate.value = planEndDate(today, 3);
  elements.paymentDate.value = today;
  elements.clientName.focus();
  setFormStatus("Ready to save client details.");
}

function handleSubmit(event) {
  event.preventDefault();
  const baseClient = {
    id: elements.clientId.value || crypto.randomUUID(),
    name: elements.clientName.value.trim(),
    phone: elements.phone.value.trim(),
    planMonths: Number(elements.planMonths.value || 1),
    serviceAmount: Number(elements.serviceAmount.value || 0),
    receivedAmount: Number(elements.receivedAmount.value || 0),
    paymentMode: elements.paymentMode.value,
    startDate: elements.startDate.value,
    endDate: elements.endDate.value,
    meetingDate: elements.meetingDate.value,
    followUpDate: elements.followUpDate.value,
    status: elements.status.value,
    notes: elements.notes.value.trim(),
    createdAt: new Date().toISOString()
  };

  if (baseClient.receivedAmount > baseClient.serviceAmount) {
    showToast("Received payment service amount se zyada nahi ho sakta.");
    setFormStatus("Save blocked: received amount cannot exceed service amount.");
    return;
  }

  const existingIndex = clients.findIndex((item) => item.id === baseClient.id);
  let savedClient;
  let successMessage = "";
  if (existingIndex >= 0) {
    const existing = clients[existingIndex];
    const diff = baseClient.receivedAmount - receivedFor(existing);
    let updatedPayments = existing.payments;

    if (diff !== 0) {
      updatedPayments = [
        ...(existing.payments || []),
        {
          id: crypto.randomUUID(),
          date: toDateValue(new Date()),
          amount: diff,
          mode: baseClient.paymentMode,
          note: diff > 0 ? "Adjustment (Added)" : "Adjustment (Reduced)"
        }
      ];
    }

    const client = normalizeClient({
      ...existing,
      ...baseClient,
      createdAt: existing.createdAt,
      payments: updatedPayments
    });
    clients[existingIndex] = client;
    savedClient = client;
    selectedClientId = client.id;
    successMessage = `${client.name} updated successfully. Check Client Records below.`;
    showToast("Client record updated.");
  } else {
    const client = normalizeClient(baseClient);
    clients.push(client);
    savedClient = client;
    selectedClientId = client.id;
    successMessage = `${client.name} saved successfully. Check Client Records below.`;
    showToast("New client added with monthly PDC schedule.");
  }

  saveClients();
  syncClientToSheet(savedClient, existingIndex >= 0 ? "client_updated" : "client_created");
  render();
  resetForm();
  setFormStatus(successMessage);
}

function editClient(id) {
  const client = clients.find((item) => item.id === id);
  if (!client) return;
  elements.clientId.value = client.id;
  elements.clientName.value = client.name;
  elements.phone.value = client.phone;
  elements.planMonths.value = client.planMonths;
  elements.serviceAmount.value = client.serviceAmount;
  elements.receivedAmount.value = receivedFor(client);
  elements.paymentMode.value = client.paymentMode;
  elements.startDate.value = client.startDate;
  elements.endDate.value = client.endDate;
  elements.meetingDate.value = client.meetingDate;
  elements.followUpDate.value = client.followUpDate || "";
  elements.status.value = client.status;
  elements.notes.value = client.notes || "";
  switchView("view-clients");
  document.querySelector(".form-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  setFormStatus(`Editing ${client.name}. Press Save Client to apply changes.`);
}

function deleteClient(id) {
  const client = clients.find((item) => item.id === id);
  if (!client) return;
  const confirmed = confirm(`${client.name} ka record delete karna hai?`);
  if (!confirmed) return;
  clients = clients.filter((item) => item.id !== id);
  saveClients();
  syncClientToSheet(client, "client_deleted");
  render();
  showToast("Client deleted.");
}

function markPaid(id) {
  const client = clients.find((item) => item.id === id);
  if (!client) return;
  const pending = pendingFor(client);
  if (pending <= 0) {
    showToast("Payment already fully received.");
    setFormStatus("No payment added because the client is already fully paid.");
    return;
  }
  client.payments.push({
    id: crypto.randomUUID(),
    date: toDateValue(new Date()),
    amount: pending,
    mode: client.paymentMode,
    note: "Marked fully paid"
  });
  saveClients();
  syncClientToSheet(client, "payment_marked_full", { amount: pending, mode: client.paymentMode });
  render();
  showToast(`${client.name} marked as fully paid.`);
  setFormStatus(`${client.name} marked fully paid.`);
}

function addPayment(event) {
  event.preventDefault();
  const client = clients.find((item) => item.id === selectedClientId);
  if (!client) return;
  const amount = Number(elements.paymentAmount.value || 0);
  if (amount <= 0) {
    showToast("Installment amount valid hona chahiye.");
    setFormStatus("Installment amount must be greater than zero.");
    return;
  }
  if (amount > pendingFor(client)) {
    showToast("Installment pending amount se zyada nahi ho sakta.");
    setFormStatus("Installment cannot exceed the pending amount.");
    return;
  }
  client.payments.push({
    id: crypto.randomUUID(),
    date: elements.paymentDate.value,
    amount,
    mode: elements.paymentEntryMode.value,
    note: elements.paymentNote.value.trim()
  });
  saveClients();
  syncClientToSheet(client, "payment_added", { amount, mode: elements.paymentEntryMode.value, date: elements.paymentDate.value });
  elements.paymentForm.reset();
  elements.paymentDate.value = toDateValue(new Date());
  render();
  showToast("Payment installment added.");
  setFormStatus(`${formatCurrency(amount)} installment added for ${client.name}.`);
}

function deletePayment(clientId, paymentId) {
  const client = clients.find((item) => item.id === clientId);
  if (!client) return;
  client.payments = client.payments.filter((payment) => payment.id !== paymentId);
  saveClients();
  syncClientToSheet(client, "payment_deleted", { paymentId });
  render();
  showToast("Payment installment deleted.");
  setFormStatus("Payment installment deleted.");
}

function updateMeeting(clientId, meetingId, status) {
  const client = clients.find((item) => item.id === clientId);
  const meeting = client?.meetings.find((item) => item.id === meetingId);
  if (!client || !meeting) return;
  meeting.status = status;
  if (status === "Done") {
    const weight = prompt("Current weight (kg), optional:", meeting.weight || "");
    const goal = prompt("Next goal, optional:", meeting.goal || "");
    const notes = prompt("Meeting notes, optional:", meeting.notes || "");
    meeting.weight = weight ?? meeting.weight;
    meeting.goal = goal ?? meeting.goal;
    meeting.notes = notes ?? meeting.notes;
  }
  saveClients();
  syncClientToSheet(client, "meeting_updated", { meetingId, status });
  render();
  showToast(`Meeting marked ${status}.`);
  setFormStatus(`Meeting updated to ${status}.`);
}

function editMeetingNote(clientId, meetingId) {
  const client = clients.find((item) => item.id === clientId);
  const meeting = client?.meetings.find((item) => item.id === meetingId);
  if (!client || !meeting) return;
  const notes = prompt("Meeting notes:", meeting.notes || "");
  if (notes === null) return;
  meeting.notes = notes;
  saveClients();
  syncClientToSheet(client, "meeting_note_saved", { meetingId });
  render();
  showToast("Meeting note saved.");
  setFormStatus("Meeting note saved.");
}

function reminderMessage(client) {
  const next = nextMeetingFor(client);
  const pending = pendingFor(client);
  return `Namaste ${client.name}, aapki PDC meeting ${formatDate(next?.date)} ko scheduled hai. Pending payment: ${formatCurrency(pending)}. Kripya time confirm karein. - PDC Team`;
}

function renewalMessage(client) {
  return `Namaste ${client.name}, aapka PDC plan ${formatDate(client.endDate)} ko complete ho raha hai. Continuity ke liye renewal plan confirm kar dein. Pending payment: ${formatCurrency(pendingFor(client))}. - PDC Team`;
}

function followUpMessage(client) {
  return `Namaste ${client.name}, aapne PDC plan me interest dikhaya tha. Aaj follow-up ke liye connect kar rahe hain. Kya aap plan details confirm karna chahenge? - PDC Team`;
}

async function sendWhatsApp(client, message) {
  try {
    await navigator.clipboard.writeText(message);
    showToast("Message copied. WhatsApp open ho raha hai.");
  } catch {
    showToast("Message ready. WhatsApp open ho raha hai.");
  }
  const digits = client.phone.replace(/\D/g, "");
  const phone = digits.length === 10 ? `91${digits}` : digits;
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
}

function sendReminder(id) {
  const client = clients.find((item) => item.id === id);
  if (!client) return;
  sendWhatsApp(client, reminderMessage(client));
}

function sendRenewal(id) {
  const client = clients.find((item) => item.id === id);
  if (!client) return;
  sendWhatsApp(client, renewalMessage(client));
}

function sendFollowUp(id) {
  const client = clients.find((item) => item.id === id);
  if (!client) return;
  sendWhatsApp(client, followUpMessage(client));
}

function selectProfile(id) {
  selectedClientId = id;
  renderDetails();
  switchView("view-history");
  document.querySelector("#history").scrollIntoView({ behavior: "smooth", block: "start" });
  if (window.lucide) lucide.createIcons();
}

function handleAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const { action, id, meetingId, paymentId } = button.dataset;
  if (action === "profile") selectProfile(id);
  if (action === "edit") editClient(id);
  if (action === "delete") deleteClient(id);
  if (action === "paid") markPaid(id);
  if (action === "remind") sendReminder(id);
  if (action === "renewal") sendRenewal(id);
  if (action === "followup") sendFollowUp(id);
  if (action === "meeting-done") updateMeeting(id, meetingId, "Done");
  if (action === "meeting-missed") updateMeeting(id, meetingId, "Missed");
  if (action === "meeting-pending") updateMeeting(id, meetingId, "Pending");
  if (action === "meeting-note") editMeetingNote(id, meetingId);
  if (action === "payment-delete") deletePayment(id, paymentId);
}

function getSheetUrl() {
  return localStorage.getItem(sheetUrlStorageKey) || "";
}

function saveSheetUrl() {
  const url = elements.sheetWebAppUrl.value.trim();
  if (url && !url.startsWith("https://script.google.com/")) {
    showToast("Google Apps Script Web App URL https://script.google.com/ se start hona chahiye.");
    return;
  }
  localStorage.setItem(sheetUrlStorageKey, url);
  renderSyncStatus();
  showToast(url ? "Google Sheet URL saved." : "Google Sheet URL removed.");
}

function sheetPayload(client, eventType, extra = {}) {
  const next = nextMeetingFor(client);
  return {
    eventType,
    syncedAt: new Date().toISOString(),
    client: {
      id: client.id,
      name: client.name,
      phone: client.phone,
      status: client.status,
      planMonths: client.planMonths,
      startDate: client.startDate,
      endDate: client.endDate,
      nextMeetingDate: next?.date || "",
      followUpDate: client.followUpDate || "",
      serviceAmount: client.serviceAmount,
      receivedAmount: receivedFor(client),
      pendingAmount: pendingFor(client),
      paymentMode: client.paymentMode,
      notes: client.notes || ""
    },
    extra
  };
}

async function syncClientToSheet(client, eventType, extra = {}) {
  const url = getSheetUrl();
  if (!url || !client) return;
  try {
    await fetch(url, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(sheetPayload(client, eventType, extra))
    });
    elements.syncStatus.textContent = "Synced";
    elements.syncStatus.className = "badge success";
  } catch {
    elements.syncStatus.textContent = "Sync failed";
    elements.syncStatus.className = "badge danger";
    showToast("Google Sheet sync failed. URL/deployment check karein.");
  }
}

async function syncAllToSheet() {
  const url = getSheetUrl();
  if (!url) {
    showToast("Pehle Google Apps Script Web App URL save karein.");
    return;
  }
  for (const client of clients) {
    await syncClientToSheet(client, "manual_sync");
  }
  showToast("All clients sent to Google Sheet.");
}

function exportData() {
  const blob = new Blob([JSON.stringify(clients, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `pdc-dashboard-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("Dashboard backup exported.");
}

function importData(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported)) throw new Error("Invalid data");
      clients = imported.map(normalizeClient);
      selectedClientId = clients[0]?.id || "";
      saveClients();
      render();
      showToast("Imported data loaded successfully.");
    } catch {
      showToast("Import file valid JSON backup nahi hai.");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

async function enableNotifications() {
  if (!("Notification" in window)) {
    showToast("Is browser me notifications supported nahi hain.");
    return;
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    showToast("Notification permission allow nahi hui.");
    return;
  }

  const urgentMeetings = clients.filter((client) => client.status === "Active" && nextMeetingFor(client) && dateDiffInDays(nextMeetingFor(client).date) <= 1);
  const urgentRenewals = clients.filter((client) => client.status === "Active" && renewalDaysFor(client) >= 0 && renewalDaysFor(client) <= 1);
  const urgentFollowUps = clients.filter((client) => client.status === "Interested" && client.followUpDate && dateDiffInDays(client.followUpDate) <= 1);
  if (urgentMeetings.length === 0 && urgentRenewals.length === 0 && urgentFollowUps.length === 0) {
    new Notification("PDC Dashboard", { body: "No meetings, renewals, or follow-ups due today or tomorrow." });
    return;
  }
  urgentMeetings.slice(0, 3).forEach((client) => {
    const next = nextMeetingFor(client);
    new Notification(`PDC reminder: ${client.name}`, {
      body: `${formatDate(next.date)} meeting · Pending ${formatCurrency(pendingFor(client))}`
    });
  });
  urgentRenewals.slice(0, 2).forEach((client) => {
    new Notification(`Renewal reminder: ${client.name}`, {
      body: `${formatDate(client.endDate)} plan end date`
    });
  });
  urgentFollowUps.slice(0, 2).forEach((client) => {
    new Notification(`Follow-up reminder: ${client.name}`, {
      body: `${formatDate(client.followUpDate)} interested-client follow-up`
    });
  });
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => elements.toast.classList.remove("show"), 2600);
}

function switchView(viewId) {
  const viewAliases = {
    overview: "view-overview",
    clients: "view-clients",
    history: "view-history",
    payments: "view-payments",
    reminders: "view-reminders"
  };
  const resolvedViewId = viewAliases[viewId] || viewId;

  document.querySelectorAll(".page-section").forEach((sec) => sec.classList.remove("active"));
  document.querySelectorAll(".nav-links a").forEach((link) => link.classList.remove("active"));

  const section = document.getElementById(resolvedViewId);
  if (section) section.classList.add("active");

  const navLink = document.querySelector(`.nav-links a[data-view="${resolvedViewId}"]`);
  if (navLink) navLink.classList.add("active");
  if (window.location.hash !== `#${resolvedViewId}`) {
    history.replaceState(null, "", `#${resolvedViewId}`);
  }
}

function bindEvents() {
  const navLinks = document.querySelectorAll(".nav-links a");
  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      switchView(e.currentTarget.dataset.view);
    });
  });

  elements.clientForm.addEventListener("submit", handleSubmit);
  elements.paymentForm.addEventListener("submit", addPayment);
  document.querySelector("#newClientButton").addEventListener("click", () => {
    switchView("view-clients");
    resetForm();
    document.querySelector(".form-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.querySelector("#resetFormButton").addEventListener("click", resetForm);
  document.querySelector("#exportButton").addEventListener("click", exportData);
  document.querySelector("#importFile").addEventListener("change", importData);
  document.querySelector("#saveSheetUrlButton").addEventListener("click", saveSheetUrl);
  document.querySelector("#syncAllButton").addEventListener("click", syncAllToSheet);
  document.querySelector("#notifyButton").addEventListener("click", enableNotifications);
  document.querySelector("#printButton").addEventListener("click", () => window.print());
  elements.searchInput.addEventListener("input", renderClients);
  elements.statusFilter.addEventListener("change", renderClients);
  elements.detailClientSelect.addEventListener("change", (event) => {
    selectedClientId = event.target.value;
    renderDetails();
    if (window.lucide) lucide.createIcons();
  });
  document.body.addEventListener("click", handleAction);
  elements.startDate.addEventListener("change", () => {
    elements.endDate.value = planEndDate(elements.startDate.value, elements.planMonths.value);
    if (!elements.meetingDate.value) elements.meetingDate.value = elements.startDate.value;
  });
  elements.planMonths.addEventListener("input", () => {
    if (elements.startDate.value) elements.endDate.value = planEndDate(elements.startDate.value, elements.planMonths.value);
  });

  window.addEventListener("hashchange", () => {
    switchView(window.location.hash.replace("#", "") || "view-overview");
  });
}

bindEvents();
resetForm();
switchView(window.location.hash.replace("#", "") || "view-overview");
render();
