import { chromium } from "playwright";
import ExcelJS from "exceljs";
import assert from "node:assert/strict";
import path from "node:path";
const base = process.env.QA_BASE_URL;
if (!base) throw new Error("Run via isolated browser runner.");
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PDC_BROWSER_CHANNEL || undefined,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.locator("#loginEmail").fill("qa-admin@example.com");
  await page.locator("#loginPassword").fill("QaTest12345");
  await page.locator("#loginForm button[type=submit]").click();
  await page.locator("body[data-role=admin]").waitFor();
  const submit = async () => {
    await page.locator("#opsForm button[type=submit]").click();
    await page.locator("#crmDialog").waitFor({ state: "hidden" });
  };
  const op = async (name) =>
    page
      .locator("#view-operations")
      .getByRole("button", { name, exact: true })
      .click();
  await page.getByRole("link", { name: "Operations", exact: true }).click();
  await op("Meetings & Calendar");
  await page
    .getByText("Google Calendar setup required.", { exact: true })
    .waitFor();
  await page.getByText("No meetings yet.", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Connect Google Calendar", exact: true })
      .count(),
    0,
  );
  await op("Settings & integrations");
  await op("Assignment & alerts");
  await page.locator("[name=assignment]").selectOption("round-robin");
  await page.locator("[name=commissionRate]").fill("7");
  await submit();
  await op("Settings & integrations");
  await page.getByText("Default commission: 7%", { exact: false }).waitFor();
  await op("Targets");
  await op("Set target");
  await page
    .locator("[name=salespersonId]")
    .selectOption({ label: "Sales QA" });
  await page.locator("[name=monthlyCalls]").fill("100");
  await page.locator("[name=dailyCalls]").fill("10");
  await submit();
  await page
    .locator("#view-operations")
    .getByText("/ 100", { exact: false })
    .waitFor();
  await op("WhatsApp");
  await op("Add template");
  await page.locator("[name=name]").fill("Welcome QA");
  await page
    .locator("[name=content]")
    .fill("Hello {{name}}, here is information about {{service}}.");
  await submit();
  await page.getByText("Welcome QA", { exact: true }).waitFor();
  await page.getByRole("link", { name: "CRM", exact: true }).click();
  await page.getByRole("button", { name: "Import leads", exact: true }).click();
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("Leads").addRows([
    ["Full Name", "Mobile Number", "City"],
    ["Operations Excel QA", "9898989891", "Surat"],
  ]);
  await page.locator("#leadCSV").setInputFiles({
    name: "leads.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(await wb.xlsx.writeBuffer()),
  });
  await page.getByText("1 rows found. First 5 shown:").waitFor();
  await page.locator("#crmModalForm button[type=submit]").click();
  await page.locator("#crmDialog").waitFor({ state: "hidden" });
  await page.locator("#crmSearch").fill("Operations Excel QA");
  await page
    .locator("#crmLeadRows")
    .getByRole("button", { name: "Open", exact: true })
    .click();
  await page
    .getByRole("button", { name: "WhatsApp follow-up", exact: true })
    .click();
  await page.locator("[name=consent]").check();
  await page.locator("#opsForm button[type=submit]").click();
  await page.getByRole("heading", { name: "WhatsApp draft ready" }).waitFor();
  assert.match(
    await page
      .getByRole("link", { name: "Open WhatsApp", exact: true })
      .getAttribute("href"),
    /^https:\/\/wa.me\//,
  );
  await page.locator("#opsForm button[type=submit]").click();
  await page.locator("#crmDialog").waitFor({ state: "hidden" });
  await page.getByRole("link", { name: "Operations", exact: true }).click();
  await op("Delivery");
  await page.locator("#view-operations [data-ops=delivery]").first().click();
  await page.locator("[name=status]").selectOption("In progress");
  await page.locator("[name=tasks]").fill("[x] Welcome\nDeliver workshop");
  await submit();
  await page
    .locator("#view-operations")
    .getByText("In progress", { exact: true })
    .waitFor();
  await page.screenshot({
    path: path.join(process.env.QA_OUTPUT_DIR, "operations-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await op("Settings & integrations");
  await page.screenshot({
    path: path.join(process.env.QA_OUTPUT_DIR, "operations-mobile.png"),
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 2,
    ),
    "no mobile page overflow",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: operations settings, targets, templates, Excel mapping/import, WhatsApp draft, delivery and mobile layout.",
  );
} finally {
  await browser.close();
}
