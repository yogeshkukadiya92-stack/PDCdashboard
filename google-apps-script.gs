const SHEET_NAME = "PDC Dashboard";

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = getDashboardSheet_();
    const payload = JSON.parse(e.postData.contents || "{}");
    const client = payload.client || {};
    const extra = payload.extra || {};

    sheet.appendRow([
      new Date(),
      payload.eventType || "",
      client.id || "",
      client.name || "",
      client.phone || "",
      client.status || "",
      client.planMonths || "",
      client.startDate || "",
      client.endDate || "",
      client.nextMeetingDate || "",
      client.followUpDate || "",
      client.serviceAmount || 0,
      client.receivedAmount || 0,
      client.pendingAmount || 0,
      client.paymentMode || "",
      client.notes || "",
      JSON.stringify(extra)
    ]);

    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: error.message })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function getDashboardSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "Synced At",
      "Event Type",
      "Client ID",
      "Client Name",
      "Phone",
      "Status",
      "Plan Months",
      "Start Date",
      "End Date",
      "Next Meeting Date",
      "Follow-up Date",
      "Service Amount",
      "Received Amount",
      "Pending Amount",
      "Payment Mode",
      "Notes",
      "Extra JSON"
    ]);
    sheet.getRange(1, 1, 1, 17).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  return sheet;
}
