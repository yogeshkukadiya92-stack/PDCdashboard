import path from "node:path";
const base = process.env.QA_BASE_URL;
if (!base)
  throw new Error(
    "Run npm run test:browser to create an isolated test database.",
  );
const output = process.env.QA_OUTPUT_DIR;
import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PDC_BROWSER_CHANNEL || undefined,
});
const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  }),
  page = await context.newPage();
const errors = [],
  network = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => {
  if (
    r.url().includes("/api/") &&
    r.status() >= 400 &&
    !r.url().endsWith("/api/state")
  )
    network.push(`${r.status()} ${r.url()}`);
});
process.on("uncaughtException", async (error) => {
  console.error(error);
  await page.screenshot({
    path: path.join(output, "pdc-regression-failure.png"),
    fullPage: true,
  });
  await browser.close();
  process.exit(1);
});
async function login(email, password) {
  await page.goto(base);
  await page.locator("#loginEmail").fill(email);
  await page.locator("#loginPassword").fill(password);
  await page.locator("#loginForm button[type=submit]").click();
  await page.locator("body.is-authenticated").waitFor();
}
await login("qa-admin@example.com", "QaTest12345");
await page.getByRole("link", { name: "Team", exact: true }).click();
await page.getByRole("button", { name: "+ Add team member" }).click();
await page.locator("#crmDialog [name=name]").fill("Dr QA Provider");
await page.locator("#crmDialog [name=email]").fill("qa-provider@example.com");
await page.locator("#crmDialog [name=role]").selectOption("nutritionist");
await page.locator("#crmDialog [name=password]").fill("QaProvider12345");
await page.getByRole("button", { name: "Create account", exact: true }).click();
await page.locator("#crmDialog").waitFor({ state: "hidden" });
await page.getByRole("link", { name: "Clients", exact: true }).click();
await page.locator("#clientName").fill("QA PDC Client");
await page.locator("#phone").fill("9998887774");
await page.locator("#serviceAmount").fill("3000");
await page.locator("#receivedAmount").fill("500");
await page.locator("#nutritionist").selectOption("Dr QA Provider");
await page.locator("#startDate").fill("2026-10-21");
await page.locator("#meetingDate").fill("2026-10-21");
await page.locator("#saveClientButton").click();
await page
  .locator("#clientTable")
  .getByText("QA PDC Client", { exact: true })
  .waitFor();
await page
  .locator("#clientTable")
  .getByRole("button", { name: "View history", exact: true })
  .click();
const original = await page
  .locator("#meetingHistory .timeline-item strong")
  .allTextContents();
assert.equal(original.length, 3);
await page
  .locator("#meetingHistory")
  .getByRole("button", { name: "Done", exact: true })
  .first()
  .click();
await page.waitForFunction(
  () => document.querySelector("#meetingProgress").textContent === "1/3 done",
);
await page.locator("#paymentAmount").fill("1000");
await page.locator("#paymentNote").fill("QA second installment");
await page.locator("#addPaymentButton").click();
await page.waitForFunction(() =>
  document.querySelector("#installmentTotal").textContent.includes("1,500"),
);
await page.reload();
await page.locator("body.is-authenticated").waitFor();
await page.getByRole("link", { name: "History", exact: true }).click();
await page
  .locator("#detailClientSelect")
  .selectOption({ label: "QA PDC Client" });
assert.equal(await page.locator("#meetingProgress").textContent(), "1/3 done");
assert.deepEqual(
  await page.locator("#meetingHistory .timeline-item strong").allTextContents(),
  original,
);
await page.getByRole("link", { name: "Clients", exact: true }).click();
await page
  .locator("#clientTable")
  .getByRole("button", { name: "Edit client", exact: true })
  .click();
await page.locator("#meetingDate").fill("2026-11-25");
await page.locator("#saveClientButton").click();
await page
  .locator("#clientTable")
  .getByRole("button", { name: "View history", exact: true })
  .click();
await page.waitForFunction(() =>
  document.querySelector("#meetingHistory").textContent.includes("25 Nov"),
);
assert.match(
  (
    await page
      .locator("#meetingHistory .timeline-item strong")
      .allTextContents()
  )[0],
  /21 Oct/,
);
await page.getByRole("link", { name: "Payments", exact: true }).click();
assert.match(await page.locator("#view-payments").innerText(), /1,500/);
await page.getByRole("link", { name: "Reminders", exact: true }).click();
await page.getByRole("link", { name: "Overview", exact: true }).click();
await page.locator("#overviewNutritionist").selectOption("Dr QA Provider");
assert.equal(
  await page.locator("#nutritionistTotalClients").textContent(),
  "1",
);
// Browser history and unknown direct routes recover to real views.
await page.getByRole("link", { name: "Clients", exact: true }).click();
await page.getByRole("link", { name: "History", exact: true }).click();
await page.goBack();
await page.locator("#view-clients.active").waitFor();
await page.goto(base + "/#not-a-view");
await page.locator("#view-overview.active").waitFor();
await page.getByRole("button", { name: "Logout", exact: true }).click();
await login("qa-provider@example.com", "QaProvider12345");
assert.equal(
  await page.getByRole("link", { name: "Team", exact: true }).count(),
  0,
);
assert.equal(
  await page.getByRole("link", { name: "CRM", exact: true }).count(),
  0,
);
assert.match(await page.locator("#clientTable").innerText(), /QA PDC Client/);
await page.goto(base + "/#view-services");
await page.locator("#view-clients.active").waitFor();
await page.getByRole("button", { name: "Logout", exact: true }).click();
await login("sales-qa@example.com", "QaSales12345");
await page.locator("#view-crm.active").waitFor();
assert.equal(
  await page.getByRole("link", { name: "Services", exact: true }).count(),
  0,
);
assert.equal(
  await page
    .getByRole("button", { name: "+ Add salesperson", exact: true })
    .count(),
  0,
);
await page.getByRole("button", { name: "+ New Lead", exact: true }).click();
await page.locator("#crmDialog [name=name]").fill("QA Seller Lead");
await page.locator("#crmDialog [name=phone]").fill("9998887773");
await page
  .locator("#crmDialog [name=serviceId]")
  .selectOption({ label: "Workshop QA" });
await page.getByRole("button", { name: "Create lead", exact: true }).click();
await page.locator("#crmDialog").waitFor({ state: "hidden" });
await page.locator("#crmSearch").fill("QA Seller Lead");
await page
  .locator("#crmLeadRows")
  .getByRole("button", { name: "Log call" })
  .click();
await page.locator("#crmDialog [name=outcome]").selectOption("No Answer");
await page.locator("#crmDialog [name=notes]").fill("Will retry tomorrow");
await page.getByRole("button", { name: "Save call", exact: true }).click();
await page.locator("#crmDialog").waitFor({ state: "hidden" });
await page.getByRole("link", { name: "Sales Reports", exact: true }).click();
await page.getByRole("button", { name: "Apply filters", exact: true }).click();
await page
  .locator("#reportTable")
  .getByText("Sales QA", { exact: true })
  .waitFor();
assert.equal(await page.locator("#reportOwner").count(), 0);
await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole("button", { name: "Call log", exact: true }).click();
await page.screenshot({
  path: path.join(output, "pdc-salesperson-mobile.png"),
  fullPage: true,
});
assert.ok(
  await page.evaluate(
    () => document.documentElement.scrollWidth <= innerWidth + 1,
  ),
);
assert.deepEqual(errors, []);
assert.deepEqual(network, []);
console.log(
  "PASS: dynamic nutritionist, client create/edit, installments, meeting history persistence/reschedule, overview, payments, reminders, browser back, invalid route, nutritionist scope, salesperson login/call/report, mobile, no unexpected API/page errors.",
);
await browser.close();
