# PDC Client Dashboard

Run the dashboard with the Node.js server or deploy its Dockerfile in Coolify. See the Sales CRM deployment section below. GitHub Pages and opening index.html directly cannot run the authenticated CRM.

## Features

- Client name, phone, plan months, start date, end date, and next PDC meeting tracking
- Nutritionist assignment for Dr Luv Patel and Dt Nilesh Lakhani
- Active and old client buckets for running and expired plans
- Service amount, received amount, pending amount, and payment mode tracking
- Meeting reminder list for overdue and next 7 days
- Automatic monthly PDC meeting schedule for each plan
- Meeting history with Done, Missed, Pending, weight, goal, and notes
- Payment installment history with date, amount, mode, and note
- Renewal reminders before plan end date
- Interested client status with follow-up date reminders
- Google Sheet auto-sync through Google Apps Script Web App URL
- WhatsApp reminder message with pending amount and meeting date
- Browser notification button for today/tomorrow meetings
- Search, status filter, edit, delete, mark paid, print, import, and export
- Client and CRM data save to the shared server database; existing browser client data can be imported

## Backup

Use the `Export` button regularly. It downloads a JSON backup file. Use `Import` to restore the same file later.

## Reminder Note

Browser notifications work when the dashboard is open and notification permission is allowed. WhatsApp messages open in WhatsApp Web with the reminder text ready to send.

## Google Sheet Sync Setup

1. Create or open the Google Sheet you want to sync into.
2. Go to `Extensions` > `Apps Script`.
3. Paste the code from `google-apps-script.gs`.
4. If the script is not bound to the sheet, set `SPREADSHEET_ID` in `Project Settings` > `Script properties`.
5. Click `Deploy` > `New deployment`.
6. Select type `Web app`.
7. Set `Execute as` to `Me`.
8. Set `Who has access` to `Anyone`.
9. Deploy and copy the Web App URL.
10. Paste that URL in the dashboard's `Google Sheet` settings and click `Save URL`.

After this, saving a client, updating payments, editing meetings, and using `Sync All` will write rows to the Google Sheet automatically.
Use `Load Sheet` to pull the latest Google Sheet records back into the dashboard and merge them into the current view.

## Sales CRM (version 2)

The dashboard now runs a Node.js 24+ server with a shared SQLite database. Browser-only authentication has been replaced with server-verified accounts, hashed passwords, HttpOnly sessions and role permissions. CRM features include lead assignment, phone-number deduplication, call histories, follow-up queues, purchase approval, automatic PDC client creation, salesperson reports, CSV exports and an audit trail.

### Coolify deployment

Before switching production to this version:

1. In the **existing browser/profile** used for PDC, log in to the old dashboard and **Export** the existing clients. Keep that JSON backup. Do not clear browser storage.
2. Use the application's existing Dockerfile build and keep its internal port at **80**.
3. Add a **persistent named volume** mounted at **`/app/data`**. This is required: SQLite, accounts and sessions live there. Use one running application replica; SQLite is local to this volume.
4. Add runtime environment variables **`ADMIN_EMAIL`** (your admin email) and **`ADMIN_PASSWORD`** (a new password of at least 5 characters). Optional: `ADMIN_NAME`. The initial account is created only when the database is empty. Later password changes use My password or Team → Reset password.
5. Deploy this version, then log in with those new credentials. The previous password embedded in the website no longer applies.
6. From the original browser, click **Back up & import existing clients**. A backup is downloaded before migration. This copies browser client records without removing the original browser backup. Alternatively use the existing client JSON Import control. Imported records persist on the server after a successful save.
7. In **Team**, create each salesperson's account. Assign leads in **CRM**. A nutritionist account must use the exact configured name `Dr Luv Patel` or `Dt Nilesh Lakhani`; it can read only that nutritionist's clients.

**Backup and rollback:** export CRM & clients in Team and back up the persistent `/app/data` volume using your server's volume-backup process. The JSON export contains business records but not password hashes or sessions. To roll back, redeploy the previous image and retain the database volume; the old application uses browser storage, so the predeployment export is required for restoring its client state. New CRM records are only available in this version.

### Workflows and reporting

- Salespeople see and update only their assigned leads. Admins see all records and manage users; nutritionists cannot access sales data.
- Calls are manually logged. The server records the signed-in caller and timestamp; dial links open the device's calling app. Automatic telephony/recording is not integrated.
- Salespeople record a pending purchase. An admin verifies it before it counts as a confirmed sale and creates a PDC client. A purchase can only be confirmed once.
- Received amounts changed through PDC payments update the related CRM purchase and reporting balance.
- Reports use Asia/Kolkata dates. Assigned leads use lead creation dates; attempts use call dates; confirmed buyers use purchase-confirmation dates. Distinct connected leads are separate from attempt counts. Conversion rates compare purchases with the relevant lead/call cohort within the selected period; current pending follow-ups and collection balances are labeled separately.
- Client writes check record revisions to avoid silently overwriting another admin's work. Lead forms check the last update timestamp. Refresh after a conflict.
- Legacy Google Sheet sync remains an explicit admin workflow. It is not the CRM database.

### Local development and verification

Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and optionally `PORT` / `DATA_DIR`, then run `npm start`. No third-party server packages are required. Do not commit passwords or the data directory.

Run `npm test` for the lead/call/purchase flow, duplicate prevention, account restrictions, payment reporting, session revocation, origin protection, optimistic client updates, and IST/distinct-person report calculations.
