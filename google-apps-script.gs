const SHEET_NAME = "PDC Dashboard";

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || "clients";
  if (action === "clients") {
    return ContentService.createTextOutput(JSON.stringify({
      ok: true,
      clients: readClientsFromSheet_()
    })).setMimeType(ContentService.MimeType.JSON);
  }

  return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "Unsupported action" }))
    .setMimeType(ContentService.MimeType.JSON);
}

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
      JSON.stringify(extra),
      JSON.stringify(payload.clientSnapshot || client),
      client.nutritionist || ""
    ]);

    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: error.message })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function getDashboardSheet_() {
  const spreadsheet = getSpreadsheet_();
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
      "Extra JSON",
      "Client Snapshot JSON",
      "Nutritionist"
    ]);
    sheet.getRange(1, 1, 1, 19).setFontWeight("bold");
    sheet.setFrozenRows(1);
  } else if (sheet.getLastColumn() < 19) {
    if (sheet.getLastColumn() < 18) sheet.getRange(1, 18).setValue("Client Snapshot JSON");
    sheet.getRange(1, 19).setValue("Nutritionist");
  }

  return sheet;
}

function readClientsFromSheet_() {
  const sheet = getDashboardSheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0];
  const rows = values.slice(1);
  const clientsById = new Map();

  rows.forEach((row) => {
    const entry = rowToObject_(headers, row);
    const clientId = entry["Client ID"];
    if (!clientId) return;

    const eventType = entry["Event Type"] || "";
    if (eventType === "client_deleted") {
      clientsById.delete(clientId);
      return;
    }

    const snapshot = parseJson_(entry["Client Snapshot JSON"]) || {};
    const existing = clientsById.get(clientId) || {};
    const nextClient = {
      ...existing,
      ...snapshot,
      id: clientId,
      name: snapshot.name || entry["Client Name"] || existing.name || "",
      phone: snapshot.phone || entry["Phone"] || existing.phone || "",
      nutritionist: snapshot.nutritionist || entry["Nutritionist"] || snapshot.leader || existing.nutritionist || existing.leader || "Dr Luv Patel",
      status: snapshot.status || entry["Status"] || existing.status || "Active",
      planMonths: snapshot.planMonths || Number(entry["Plan Months"] || existing.planMonths || 1),
      startDate: snapshot.startDate || entry["Start Date"] || existing.startDate || "",
      endDate: snapshot.endDate || entry["End Date"] || existing.endDate || "",
      meetingDate: snapshot.meetingDate || entry["Next Meeting Date"] || existing.meetingDate || "",
      followUpDate: snapshot.followUpDate || entry["Follow-up Date"] || existing.followUpDate || "",
      serviceAmount: Number(snapshot.serviceAmount || entry["Service Amount"] || existing.serviceAmount || 0),
      receivedAmount: Number(snapshot.receivedAmount || entry["Received Amount"] || existing.receivedAmount || 0),
      paymentMode: snapshot.paymentMode || entry["Payment Mode"] || existing.paymentMode || "Online",
      notes: snapshot.notes || entry["Notes"] || existing.notes || "",
      payments: Array.isArray(snapshot.payments) ? snapshot.payments : existing.payments || [],
      meetings: Array.isArray(snapshot.meetings) ? snapshot.meetings : existing.meetings || [],
      createdAt: snapshot.createdAt || existing.createdAt || entry["Synced At"] || new Date().toISOString(),
      updatedAt: snapshot.updatedAt || entry["Synced At"] || existing.updatedAt || new Date().toISOString()
    };

    clientsById.set(clientId, nextClient);
  });

  return Array.from(clientsById.values());
}

function rowToObject_(headers, row) {
  return headers.reduce((acc, header, index) => {
    acc[header] = row[index];
    return acc;
  }, {});
}

function parseJson_(value) {
  if (!value || typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

function getSpreadsheet_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;

  const spreadsheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (spreadsheetId) return SpreadsheetApp.openById(spreadsheetId);

  throw new Error("No spreadsheet found. Bind this script to a Google Sheet or set SPREADSHEET_ID in Script Properties.");
}
