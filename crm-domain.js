export const stages = [
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
export const outcomes = [
  "Connected",
  "No Answer",
  "Switched Off",
  "Invalid Number",
];
export const sources = [
  "Instagram",
  "WhatsApp",
  "Advertisement",
  "Referral",
  "Website",
  "Other",
];
export function phoneKey(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}
export function validateLead(input) {
  const name = String(input.name || "").trim();
  const phone = phoneKey(input.phone);
  if (!name || name.length > 120)
    throw new Error("Enter a lead name (up to 120 characters).");
  if (phone.length < 10 || phone.length > 15)
    throw new Error("Enter a valid mobile number.");
  if (input.priority && !["Hot", "Warm", "Cold"].includes(input.priority))
    throw new Error("Choose Hot, Warm or Cold priority.");
  const stage = input.stage || "New";
  if (!stages.includes(stage) || stage === "Purchased")
    throw new Error("Use Record purchase to mark a purchased lead.");
  if (
    ["Not Interested", "Deferred", "Invalid Number"].includes(stage) &&
    !String(input.reason || "").trim()
  )
    throw new Error("Enter the reason for this lead status.");
  if (input.followUpAt && Number.isNaN(Date.parse(input.followUpAt)))
    throw new Error("Enter a valid follow-up date and time.");
  return {
    name,
    phone,
    priority: input.priority || "Warm",
    city: String(input.city || "")
      .trim()
      .slice(0, 120),
    service: String(input.service || "PDC")
      .trim()
      .slice(0, 120),
    serviceId: String(input.serviceId || ""),
    source:
      String(input.source || "Other")
        .trim()
        .slice(0, 120) || "Other",
    sourceDetails: String(input.sourceDetails || "")
      .trim()
      .slice(0, 500),
    stage,
    reason: String(input.reason || "")
      .trim()
      .slice(0, 1000),
    followUpAt:
      !["Not Interested", "Invalid Number"].includes(stage) && input.followUpAt
        ? new Date(input.followUpAt).toISOString()
        : "",
    notes: String(input.notes || "")
      .trim()
      .slice(0, 5000),
    assignedTo: String(input.assignedTo || ""),
  };
}
export function validateSale(
  input,
  service = { kind: "pdc" },
  nutritionists = ["Dr Luv Patel", "Dt Nilesh Lakhani"],
) {
  const amount = Number(input.amount),
    received = Number(input.received),
    months = Number(input.months);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000)
    throw new Error("Enter a positive service amount.");
  if (!Number.isFinite(received) || received < 0 || received > amount)
    throw new Error("Received amount must be between zero and service amount.");
  if (!Number.isInteger(months) || months < 1 || months > 60)
    throw new Error("Plan duration must be 1–60 months.");
  if (!validDate(input.startDate)) throw new Error("Enter a valid start date.");
  if (
    !["UPI", "Online", "Cash", "Bank Transfer", "Card"].includes(
      input.paymentMode,
    )
  )
    throw new Error("Choose a payment mode.");
  if (service.kind === "pdc" && !nutritionists.includes(input.nutritionist))
    throw new Error("Choose a nutritionist.");
  return {
    amount,
    received,
    months,
    startDate: input.startDate,
    paymentMode: input.paymentMode,
    nutritionist: service.kind === "pdc" ? input.nutritionist : "",
    deliveryOwner: String(input.deliveryOwner || service.deliveryOwner || "")
      .trim()
      .slice(0, 120),
    confirmed: input.confirmed === true,
    plan: String(input.plan || "PDC counselling")
      .trim()
      .slice(0, 120),
  };
}
export function istDay(date) {
  return new Date(date).toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
}
export function salesReport(
  users,
  leads,
  calls,
  sales,
  { from = "", to = "", salesperson = "", serviceId = "", source = "" } = {},
) {
  validateReportDates({ from, to });
  const leadMap = new Map(leads.map((l) => [l.id, l]));
  const matches = (item) =>
    (!serviceId ||
      (item.serviceId || leadMap.get(item.leadId)?.serviceId) === serviceId) &&
    (!source ||
      (item.sourceName || leadMap.get(item.leadId)?.source || item.source) ===
        source);
  leads = leads.filter(matches);
  calls = calls.filter(matches);
  sales = sales.filter(matches);
  const inRange = (date) =>
    (!from || istDay(date) >= from) && (!to || istDay(date) <= to);
  return users
    .filter(
      (u) => u.role === "salesperson" && (!salesperson || u.id === salesperson),
    )
    .map((user) => {
      const assigned = leads.filter(
        (l) => l.assignedTo === user.id && inRange(l.createdAt),
      );
      const attempts = calls.filter(
        (c) => c.actorId === user.id && inRange(c.createdAt),
      );
      const connected = new Set(
        attempts.filter((c) => c.outcome === "Connected").map((c) => c.leadId),
      ).size;
      const purchases = sales.filter(
        (s) =>
          s.salespersonId === user.id &&
          s.confirmedAt &&
          inRange(s.confirmedAt),
      );
      const buyers = new Set(purchases.map((s) => s.leadId)).size;
      const cohortBuyers = new Set(
        purchases
          .filter((s) => assigned.some((l) => l.id === s.leadId))
          .map((s) => s.leadId),
      ).size;
      const connectedBuyers = new Set(
        purchases
          .filter((s) =>
            attempts.some(
              (c) => c.leadId === s.leadId && c.outcome === "Connected",
            ),
          )
          .map((s) => s.leadId),
      ).size;
      const due = leads.filter(
        (l) =>
          l.assignedTo === user.id &&
          l.followUpAt &&
          new Date(l.followUpAt) <= new Date() &&
          !["Purchased", "Not Interested", "Invalid Number"].includes(l.stage),
      ).length;
      return {
        id: user.id,
        name: user.name,
        assigned: assigned.length,
        attempts: attempts.length,
        connectedCalls: attempts.filter((c) => c.outcome === "Connected")
          .length,
        noAnswer: attempts.filter((c) => c.outcome === "No Answer").length,
        switchedOff: attempts.filter((c) => c.outcome === "Switched Off")
          .length,
        invalidNumber: attempts.filter((c) => c.outcome === "Invalid Number")
          .length,
        connectionRate: attempts.length
          ? (attempts.filter((c) => c.outcome === "Connected").length /
              attempts.length) *
            100
          : 0,
        connected,
        talkTimeSeconds: attempts.reduce(
          (sum, c) => sum + (c.durationSeconds || 0),
          0,
        ),
        buyers,
        revenue: purchases.reduce((a, s) => a + s.amount, 0),
        received: purchases.reduce((a, s) => a + s.received, 0),
        pending: purchases.reduce((a, s) => a + s.amount - s.received, 0),
        due,
        leadConversion: assigned.length
          ? (cohortBuyers / assigned.length) * 100
          : 0,
        callConversion: connected ? (connectedBuyers / connected) * 100 : 0,
      };
    });
}

export function validDate(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function validateReportDates({ from = "", to = "" }) {
  if ((from && !validDate(from)) || (to && !validDate(to)))
    throw new Error("Enter valid report dates.");
  if (from && to && from > to)
    throw new Error("From date must be before To date.");
}
export function validateService(input) {
  const name = String(input.name || "").trim();
  const price = Number(input.price ?? 0),
    months = Number(input.months ?? 1);
  if (!name || name.length > 120)
    throw new Error("Enter a service name (up to 120 characters).");
  if (!["pdc", "general"].includes(input.kind))
    throw new Error("Choose the service type.");
  if (!Number.isFinite(price) || price < 0 || price > 100000000)
    throw new Error("Enter a valid default price.");
  if (!Number.isInteger(months) || months < 1 || months > 60)
    throw new Error("Duration must be 1–60 months.");
  return {
    name,
    kind: input.kind,
    price,
    months,
    deliveryOwner: String(input.deliveryOwner || "")
      .trim()
      .slice(0, 120),
    description: String(input.description || "")
      .trim()
      .slice(0, 2000),
    active: input.active !== false,
  };
}
export function callDuration(value) {
  if (value === "" || value == null) return null;
  const duration = Number(value);
  if (!Number.isInteger(duration) || duration < 0 || duration > 86400)
    throw new Error("Call duration must be 0–86400 seconds.");
  return duration;
}
export function analyticsReport(
  users,
  leads,
  calls,
  sales,
  services,
  filters = {},
  activities = [],
) {
  validateReportDates(filters);
  const {
    from = "",
    to = "",
    salesperson = "",
    serviceId = "",
    source = "",
  } = filters;
  const inRange = (date) =>
    (!from || istDay(date) >= from) && (!to || istDay(date) <= to);
  const leadMap = new Map(leads.map((l) => [l.id, l]));
  const matches = (item) =>
    (!serviceId ||
      (item.serviceId || leadMap.get(item.leadId)?.serviceId) === serviceId) &&
    (!source ||
      (item.sourceName || leadMap.get(item.leadId)?.source || item.source) ===
        source);
  const work = activities.filter(
    (a) =>
      matches(a) &&
      inRange(a.createdAt) &&
      (!salesperson || a.actorId === salesperson),
  );
  const owned = leads.filter(
    (l) => matches(l) && (!salesperson || l.assignedTo === salesperson),
  );
  const attempts = calls.filter(
    (c) =>
      matches(c) &&
      inRange(c.createdAt) &&
      (!salesperson || c.actorId === salesperson),
  );
  const purchases = sales.filter(
    (s) =>
      matches(s) &&
      s.confirmedAt &&
      inRange(s.confirmedAt) &&
      (!salesperson || s.salespersonId === salesperson),
  );
  const pendingSales = sales.filter(
    (s) =>
      matches(s) &&
      !s.confirmedAt &&
      inRange(s.createdAt) &&
      (!salesperson || s.salespersonId === salesperson),
  );
  const summarize = (ls, cs, ss) => ({
    leads: ls.filter((l) => inRange(l.createdAt)).length,
    attempts: cs.length,
    connected: cs.filter((c) => c.outcome === "Connected").length,
    workedLeads: new Set(cs.map((c) => c.leadId)).size,
    confirmed: ss.length,
    people: new Set(
      ss.map((s) => phoneKey(leadMap.get(s.leadId)?.phone) || s.leadId),
    ).size,
    revenue: ss.reduce((a, s) => a + s.amount, 0),
    received: ss.reduce((a, s) => a + s.received, 0),
    pending: ss.reduce((a, s) => a + s.amount - s.received, 0),
    talkTimeSeconds: cs.reduce((a, c) => a + (c.durationSeconds || 0), 0),
  });
  const group = (key, name, ls, cs, ss) => ({
    id: key,
    name,
    ...summarize(ls, cs, ss),
  });
  const byService = services.map((s) =>
    group(
      s.id,
      s.name,
      owned.filter((l) => l.serviceId === s.id),
      attempts.filter(
        (c) => (c.serviceId || leadMap.get(c.leadId)?.serviceId) === s.id,
      ),
      purchases.filter(
        (p) => (p.serviceId || leadMap.get(p.leadId)?.serviceId) === s.id,
      ),
    ),
  );
  const sourceNames = [
    ...new Set([
      ...owned.map((l) => l.source),
      ...attempts.map(
        (c) => c.sourceName || leadMap.get(c.leadId)?.source || "Other",
      ),
      ...purchases.map(
        (s) => s.sourceName || leadMap.get(s.leadId)?.source || "Other",
      ),
    ]),
  ].sort();
  const bySource = sourceNames.map((name) =>
    group(
      name,
      name,
      owned.filter((l) => l.source === name),
      attempts.filter(
        (c) =>
          (c.sourceName || leadMap.get(c.leadId)?.source || "Other") === name,
      ),
      purchases.filter(
        (s) =>
          (s.sourceName || leadMap.get(s.leadId)?.source || "Other") === name,
      ),
    ),
  );
  const effortIds = new Set([
    ...owned.filter((l) => inRange(l.createdAt)).map((l) => l.id),
    ...attempts.map((c) => c.leadId),
    ...purchases.map((s) => s.leadId),
    ...work.map((a) => a.leadId),
  ]);
  const effort = [...effortIds]
    .map((id) => {
      const l = leadMap.get(id);
      if (!l) return null;
      const cs = attempts
        .filter((c) => c.leadId === id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return {
        id,
        name: l.name,
        phone: l.phone,
        service: l.service,
        serviceId: l.serviceId,
        source: l.source,
        stage: l.stage,
        assignedTo: l.assignedTo,
        owner: users.find((u) => u.id === l.assignedTo)?.name || "Unassigned",
        followUpAt: l.followUpAt,
        attempts: cs.length,
        connected: cs.filter((c) => c.outcome === "Connected").length,
        talkTimeSeconds: cs.reduce((a, c) => a + (c.durationSeconds || 0), 0),
        activities: work.filter((a) => a.leadId === id).length,
        lastCallAt: cs[0]?.createdAt || "",
        lastNote:
          cs[0]?.notes ||
          work
            .filter((a) => a.leadId === id)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.text ||
          "",
        confirmed: purchases.some((s) => s.leadId === id),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.attempts - a.attempts || a.name.localeCompare(b.name));
  return {
    totals: {
      ...summarize(owned, attempts, purchases),
      awaitingApproval: pendingSales.length,
      unworked: owned.filter(
        (l) =>
          !calls.some((c) => c.leadId === l.id) &&
          !["Purchased", "Not Interested", "Invalid Number"].includes(l.stage),
      ).length,
      overdue: owned.filter(
        (l) =>
          l.followUpAt &&
          Date.parse(l.followUpAt) <= Date.now() &&
          !["Purchased", "Not Interested", "Invalid Number"].includes(l.stage),
      ).length,
    },
    byService,
    bySource,
    effort,
    calls: attempts
      .map((c) => ({
        ...c,
        leadName: leadMap.get(c.leadId)?.name || "Lead",
        serviceName: c.serviceName || leadMap.get(c.leadId)?.service || "",
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}
