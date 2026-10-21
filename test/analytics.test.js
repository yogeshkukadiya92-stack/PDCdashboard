import { test } from "node:test";
import assert from "node:assert/strict";
import { analyticsReport, salesReport, validateSale } from "../crm-domain.js";

test("historical service/source call attribution and note-only effort survive lead edits", () => {
  const users = [{ id: "seller", name: "Seller", role: "salesperson" }];
  const leads = [
    {
      id: "lead",
      name: "Person",
      phone: "9876543210",
      serviceId: "new",
      service: "New service",
      source: "New source",
      assignedTo: "seller",
      stage: "Interested",
      createdAt: "2026-10-01T00:00:00Z",
    },
  ];
  const calls = [
    {
      id: "call",
      leadId: "lead",
      actorId: "seller",
      serviceId: "old",
      sourceName: "Old source",
      outcome: "Connected",
      durationSeconds: 65,
      createdAt: "2026-10-20T00:00:00Z",
    },
  ];
  const services = [
    { id: "old", name: "Old service" },
    { id: "new", name: "New service" },
  ];
  let result = analyticsReport(users, leads, calls, [], services, {
    serviceId: "old",
    source: "Old source",
  });
  assert.equal(result.totals.attempts, 1);
  assert.equal(result.byService.find((s) => s.id === "old").attempts, 1);
  assert.equal(
    salesReport(users, leads, calls, [], { serviceId: "new" })[0].attempts,
    0,
  );
  const activities = [
    {
      id: "note",
      leadId: "lead",
      actorId: "seller",
      serviceId: "new",
      sourceName: "New source",
      type: "note",
      text: "Brochure sent",
      createdAt: "2026-10-21T00:00:00Z",
    },
  ];
  result = analyticsReport(
    users,
    leads,
    calls,
    [],
    services,
    { from: "2026-10-21", to: "2026-10-21" },
    activities,
  );
  assert.equal(result.effort.length, 1);
  assert.equal(result.effort[0].attempts, 0);
  assert.equal(result.effort[0].activities, 1);
  assert.equal(result.effort[0].lastNote, "Brochure sent");
});

test("custom nutritionist is accepted only when configured; general services need no nutritionist", () => {
  const purchase = {
    amount: 1000,
    received: 100,
    months: 3,
    startDate: "2026-10-21",
    paymentMode: "UPI",
    nutritionist: "Dr New",
  };
  assert.throws(() => validateSale(purchase), /nutritionist/);
  assert.equal(
    validateSale(purchase, { kind: "pdc" }, ["Dr New"]).nutritionist,
    "Dr New",
  );
  assert.equal(
    validateSale(
      { ...purchase, nutritionist: undefined },
      { kind: "general", deliveryOwner: "Coach" },
    ).deliveryOwner,
    "Coach",
  );
});
