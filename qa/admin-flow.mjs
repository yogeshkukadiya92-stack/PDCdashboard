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
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(base);
await page.locator("#loginEmail").fill("qa-admin@example.com");
await page.locator("#loginPassword").fill("QaTest12345");
await page.locator("#loginForm button[type=submit]").click();
await page.locator("body[data-role=admin]").waitFor();
await page.getByRole("link", { name: "Services", exact: true }).click();
await page.getByRole("button", { name: "+ Add service", exact: true }).click();
await page.locator("#crmDialog [name=name]").fill("Workshop QA");
await page.locator("#crmDialog [name=price]").fill("2500");
await page.locator("#crmDialog [name=deliveryOwner]").fill("Coach QA");
await page.getByRole("button", { name: "Save service", exact: true }).click();
await page.locator("#crmDialog").waitFor({ state: "hidden" });
await page.getByRole("link", { name: "CRM", exact: true }).click();
await page
  .getByRole("button", { name: "+ Add salesperson", exact: true })
  .click();
await page.locator("#crmDialog [name=name]").fill("Sales QA");
await page.locator("#crmDialog [name=email]").fill("sales-qa@example.com");
await page.locator("#crmDialog [name=password]").fill("QaSales12345");
await page.getByRole("button", { name: "Create account", exact: true }).click();
await page.locator("#crmDialog").waitFor({ state: "hidden" });
await page.getByRole("button", { name: "+ New Lead", exact: true }).click();
await page.locator("#crmDialog [name=name]").fill("QA Buyer");
await page.locator("#crmDialog [name=phone]").fill("9998887776");
await page
  .locator("#crmDialog [name=serviceId]")
  .selectOption({ label: "Workshop QA" });
await page
  .locator("#crmDialog [name=assignedTo]")
  .selectOption({ label: "Sales QA" });
await page.locator("#crmDialog [name=source]").fill("YouTube live");
await page.locator("#crmDialog [name=sourceDetails]").fill("October webinar");
await page.getByRole("button", { name: "Create lead", exact: true }).click();
await page.locator("#crmDialog").waitFor({ state: "hidden" });
await page
  .locator("#crmLeadRows")
  .getByRole("button", { name: "Log call", exact: true })
  .click();
await page.locator("#crmDialog [name=stage]").selectOption("Interested");
await page.locator("#crmDialog [name=durationSeconds]").fill("150");
await page
  .locator("#crmDialog [name=notes]")
  .fill("Asked about workshop timings; brochure shared.");
await page.getByRole("button", { name: "Save call", exact: true }).click();
await page.locator("#crmDialog").waitFor({ state: "hidden" });
await page
  .locator("#crmLeadRows")
  .getByRole("button", { name: "Open", exact: true })
  .click();
await page
  .getByRole("button", { name: "Add activity note", exact: true })
  .click();
await page
  .locator("#crmDialog [name=text]")
  .fill("Follow-up message prepared.");
await page.getByRole("button", { name: "Save note", exact: true }).click();
await page.locator("#crmDialog").waitFor({ state: "hidden" });
await page
  .locator("#crmLeadRows")
  .getByRole("button", { name: "Open", exact: true })
  .click();
await page
  .getByRole("button", { name: "Record purchase", exact: true })
  .click();
assert.equal(
  await page.locator("#crmDialog [name=amount]").inputValue(),
  "2500",
);
assert.equal(await page.locator("#crmDialog [name=nutritionist]").count(), 0);
await page.locator("#crmDialog [name=received]").fill("500");
await page
  .getByRole("button", { name: "Record purchase", exact: true })
  .click();
await page.locator("#crmDialog").waitFor({ state: "hidden" });
await page
  .getByRole("button", { name: "Review purchase", exact: true })
  .click();
page.once("dialog", (d) => d.accept());
await page
  .getByRole("button", { name: "Confirm purchase", exact: true })
  .click();
await page.locator("#crmDialog").waitFor({ state: "hidden" });
await page
  .locator("#crmLeadRows")
  .getByRole("button", { name: "Open", exact: true })
  .click();
await page.getByRole("button", { name: "Record payment", exact: true }).click();
await page.locator("#crmDialog [name=amount]").fill("1000");
await page.locator("#crmDialog [name=note]").fill("QA balance payment");
await page.getByRole("button", { name: "Save payment", exact: true }).click();
await page.locator("#crmDialog").waitFor({ state: "hidden" });
await page.getByRole("link", { name: "Sales Reports", exact: true }).click();
await page.getByRole("button", { name: "Services", exact: true }).click();
await page
  .locator("#reportTable")
  .getByText("Workshop QA", { exact: true })
  .waitFor();
assert.match(await page.locator("#reportTable").innerText(), /2m 30s/);
await page.screenshot({
  path: path.join(output, "pdc-reports-desktop.png"),
  fullPage: true,
});
for (const tab of ["Salespeople", "Lead sources", "Lead effort", "Call log"]) {
  await page.getByRole("button", { name: tab, exact: true }).click();
  await page.locator("#reportTable").waitFor();
}
const downloadEvent = page.waitForEvent("download");
await page.getByRole("button", { name: "Export current table" }).click();
const download = await downloadEvent;
await download.saveAs(path.join(output, "pdc-call-log.csv"));
for (const name of [
  "Overview",
  "Clients",
  "Payments",
  "History",
  "Reminders",
  "Team",
  "Services",
  "CRM",
]) {
  await page.getByRole("link", { name, exact: true }).click();
  await page.locator(".page-section.active").waitFor();
}
await page.getByRole("button", { name: "Import leads", exact: true }).click();
await page
  .locator("#crmDialog [name=serviceId]")
  .selectOption({ label: "Workshop QA" });
await page
  .locator("#leadCSV")
  .setInputFiles({
    name: "leads.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      'name,phone,source,notes\n"QA Import, Lead",9998887775,Referral,"Asked for details"\n',
    ),
  });
await page.getByText("1 leads ready to import.").waitFor();
await page
  .locator("#crmDialog")
  .getByRole("button", { name: "Import leads", exact: true })
  .click();
await page.locator("#crmDialog").waitFor({ state: "hidden" });
await page.locator("#crmSearch").fill("QA Import");
assert.equal(await page.locator("#crmLeadRows tr").count(), 1);
await page.reload();
await page.locator("body[data-role=admin]").waitFor();
await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole("link", { name: "Services", exact: true }).click();
await page.getByRole("button", { name: "+ Add service", exact: true }).click();
await page.screenshot({
  path: path.join(output, "pdc-mobile-form.png"),
  fullPage: true,
});
await page.getByRole("button", { name: "Cancel", exact: true }).click();
await page.getByRole("link", { name: "Sales Reports", exact: true }).click();
await page.getByRole("button", { name: "Lead effort", exact: true }).click();
await page.screenshot({
  path: path.join(output, "pdc-reports-mobile.png"),
  fullPage: true,
});
assert.ok(
  await page.evaluate(
    () => document.documentElement.scrollWidth <= innerWidth + 1,
  ),
  "mobile page overflow",
);
assert.deepEqual(errors, []);
console.log(
  "PASS: admin services, salesperson, lead, call, note, purchase, approval, payment, all report tables, export, import, navigation, reload, mobile; no page errors.",
);
await browser.close();
