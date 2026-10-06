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
    city: String(input.city || "")
      .trim()
      .slice(0, 120),
    service: String(input.service || "PDC")
      .trim()
      .slice(0, 120),
    source: sources.includes(input.source) ? input.source : "Other",
    stage,
    reason: String(input.reason || "")
      .trim()
      .slice(0, 1000),
    followUpAt: input.followUpAt
      ? new Date(input.followUpAt).toISOString()
      : "",
    notes: String(input.notes || "")
      .trim()
      .slice(0, 5000),
    assignedTo: String(input.assignedTo || ""),
  };
}
export function validateSale(input) {
  const amount = Number(input.amount),
    received = Number(input.received),
    months = Number(input.months);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000)
    throw new Error("Enter a positive service amount.");
  if (!Number.isFinite(received) || received < 0 || received > amount)
    throw new Error("Received amount must be between zero and service amount.");
  if (!Number.isInteger(months) || months < 1 || months > 60)
    throw new Error("Plan duration must be 1–60 months.");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate || "") ||
    Number.isNaN(Date.parse(input.startDate))
  )
    throw new Error("Enter a valid start date.");
  if (
    !["UPI", "Online", "Cash", "Bank Transfer", "Card"].includes(
      input.paymentMode,
    )
  )
    throw new Error("Choose a payment mode.");
  if (!["Dr Luv Patel", "Dt Nilesh Lakhani"].includes(input.nutritionist))
    throw new Error("Choose a nutritionist.");
  return {
    amount,
    received,
    months,
    startDate: input.startDate,
    paymentMode: input.paymentMode,
    nutritionist: input.nutritionist,
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
  { from = "", to = "", salesperson = "" } = {},
) {
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
        connected,
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
