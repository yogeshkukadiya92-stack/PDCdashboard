import { chromium } from "playwright";
import assert from "node:assert/strict";
import path from "node:path";
import { readFile } from "node:fs/promises";
const base = process.env.QA_BASE_URL;
if (!base)
  throw new Error(
    "Run npm run test:browser to create an isolated test database.",
  );
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PDC_BROWSER_CHANNEL || undefined,
});
try {
  const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(base);
  await page.locator("#loginEmail").fill("qa-admin@example.com");
  await page.locator("#loginPassword").fill("QaTest12345");
  await page.locator("#loginForm button[type=submit]").click();
  await page.locator("body.is-authenticated").waitFor();
  let event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  let download = await event;
  const clientBackup = path.join(process.env.QA_OUTPUT_DIR, "clients.json");
  await download.saveAs(clientBackup);
  const backup = JSON.parse(await readFile(clientBackup, "utf8"));
  assert.ok(backup.some((c) => c.name === "QA PDC Client"));
  await page.locator("#importFile").setInputFiles(clientBackup);
  await page
    .getByText("Data imported successfully.", { exact: true })
    .waitFor();
  await page.getByRole("link", { name: "History", exact: true }).click();
  await page
    .locator("#detailClientSelect")
    .selectOption({ label: "QA PDC Client" });
  await page
    .locator("#meetingHistory")
    .getByRole("button", { name: "Missed", exact: true })
    .nth(1)
    .click();
  await page.waitForFunction(() =>
    document
      .querySelectorAll("#meetingHistory .timeline-item")[1]
      .querySelector(".timeline-meta")
      .textContent.includes("Missed"),
  );
  await page
    .locator("#meetingHistory")
    .getByRole("button", { name: "Pending", exact: true })
    .nth(1)
    .click();
  await page.waitForFunction(() =>
    document
      .querySelectorAll("#meetingHistory .timeline-item")[1]
      .querySelector(".timeline-meta")
      .textContent.includes("Pending"),
  );
  const entry = page
    .locator("#paymentHistory .timeline-item")
    .filter({ hasText: "QA second installment" });
  await entry.getByRole("button", { name: "Delete payment" }).click();
  await page.waitForFunction(
    () =>
      document.querySelector("#installmentTotal").textContent.includes("500") &&
      !document
        .querySelector("#installmentTotal")
        .textContent.includes("1,500"),
  );
  await page.getByRole("link", { name: "Clients", exact: true }).click();
  await page
    .locator("#clientTable")
    .getByRole("button", { name: "Mark paid", exact: true })
    .click();
  await page.getByRole("link", { name: "Payments", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector("#collectionPercent").textContent === "100%",
  );
  await page.getByRole("link", { name: "Team", exact: true }).click();
  event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CRM & clients" }).click();
  download = await event;
  const allBackup = path.join(process.env.QA_OUTPUT_DIR, "crm-backup.json");
  await download.saveAs(allBackup);
  const all = JSON.parse(await readFile(allBackup, "utf8"));
  assert.ok(all.services.length >= 2);
  assert.ok(all.activities.length);
  assert.ok(all.users.every((u) => !("password" in u)));
  let row = page
    .locator("#view-team tr")
    .filter({ hasText: "sales-qa@example.com" });
  await row
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await page.locator("#crmDialog [name=password]").fill("QaReset12345");
  await page
    .locator("#crmDialog")
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await page.locator("#crmDialog").waitFor({ state: "hidden" });
  await row.getByRole("button", { name: "Disable", exact: true }).click();
  await row.getByRole("button", { name: "Enable", exact: true }).waitFor();
  await row.getByRole("button", { name: "Enable", exact: true }).click();
  await row.getByRole("button", { name: "Disable", exact: true }).waitFor();
  await page.getByRole("link", { name: "Services", exact: true }).click();
  row = page.locator("#view-services tr").filter({ hasText: "Workshop QA" });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .locator("#crmDialog [name=description]")
    .fill("Updated service description");
  await page.locator("#crmDialog [name=active]").selectOption("false");
  await page.getByRole("button", { name: "Save service", exact: true }).click();
  await page.locator("#crmDialog").waitFor({ state: "hidden" });
  await row.getByText("Archived", { exact: true }).waitFor();
  await page.getByRole("link", { name: "CRM", exact: true }).click();
  await page.getByRole("button", { name: "+ New Lead", exact: true }).click();
  assert.equal(
    await page
      .locator("#crmDialog [name=serviceId] option")
      .filter({ hasText: "Workshop QA" })
      .count(),
    0,
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("link", { name: "Sales Reports", exact: true }).click();
  await page.locator("#reportService").selectOption({ label: "Workshop QA" });
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await page.getByRole("button", { name: "Services", exact: true }).click();
  await page
    .locator("#reportTable")
    .getByText("Workshop QA", { exact: true })
    .waitFor();
  await page.locator("#reportFrom").fill("2026-10-22");
  await page.locator("#reportTo").fill("2026-10-21");
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await page
    .getByText("From date must be before To date.", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "All time", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: path.join(process.env.QA_OUTPUT_DIR, "pdc-final-mobile.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: client export/import, meeting statuses, payment delete/mark paid, full CRM backup, password reset, disable/enable, service archive, historical filters, invalid date recovery, small desktop/mobile.",
  );
} finally {
  await browser.close();
}
