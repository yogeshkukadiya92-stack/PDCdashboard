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

The dashboard now runs a Node.js 24+ server with a shared SQLite database. Browser-only authentication has been replaced with server-verified accounts, hashed passwords, HttpOnly sessions and role permissions. CRM features include lead assignment, phone-and-service deduplication, call histories, follow-up queues, purchase approval, automatic PDC client creation, salesperson reports, CSV exports and an audit trail.

### Coolify deployment

Before switching production to this version:

1. In the **existing browser/profile** used for PDC, log in to the old dashboard and **Export** the existing clients. Keep that JSON backup. Do not clear browser storage.
2. Use the application's existing Dockerfile build and keep its internal port at **80**.
3. Add a **persistent named volume** mounted at **`/app/data`**. This is required: SQLite, accounts and sessions live there. Use one running application replica; SQLite is local to this volume.
4. Add runtime environment variables **`ADMIN_EMAIL`** (your admin email) and **`ADMIN_PASSWORD`** (a new password of at least 5 characters). Optional: `ADMIN_NAME`. The initial account is created only when the database is empty. Later password changes use My password or Team → Reset password.
5. Deploy this version, then log in with those new credentials. The previous password embedded in the website no longer applies.
6. From the original browser, click **Back up & import existing clients**. A backup is downloaded before migration. This copies browser client records without removing the original browser backup. Alternatively use the existing client JSON Import control. Imported records persist on the server after a successful save.
7. In **Team**, create each salesperson's account. Assign leads in **CRM**. Nutritionist accounts can use their own names; they appear in the assignment lists and can read only clients assigned to that name.

**Backup and rollback:** export CRM & clients in Team and back up the persistent `/app/data` volume using your server's volume-backup process. The JSON export contains business records but not password hashes or sessions. To roll back, redeploy the previous image and retain the database volume; the old application uses browser storage, so the predeployment export is required for restoring its client state. New CRM records are only available in this version.

### Workflows and reporting

- Salespeople see and update only their assigned leads. Admins see all records and manage users; nutritionists cannot access sales data.
- Calls are manually logged. The server records the signed-in caller and timestamp; dial links open the device's calling app. Automatic telephony/recording is not integrated.
- Salespeople record a pending purchase. An admin verifies it before it counts as a confirmed sale. PDC services create a PDC client; general services remain in CRM with their own payment tracking. A purchase can only be confirmed once.
- Received amounts changed through PDC payments update the related CRM purchase and reporting balance.
- Reports use Asia/Kolkata dates. Assigned leads use lead creation dates; attempts use call dates; confirmed buyers use purchase-confirmation dates. Distinct connected leads are separate from attempt counts. Conversion rates compare purchases with the relevant lead/call cohort within the selected period; current pending follow-ups and collection balances are labeled separately.
- Client writes check record revisions to avoid silently overwriting another admin's work. Lead forms check the last update timestamp. Refresh after a conflict.
- Legacy Google Sheet sync remains an explicit admin workflow. It is not the CRM database.

### Local development and verification

Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and optionally `PORT` / `DATA_DIR`, then run `npm start`. No third-party server packages are required. Do not commit passwords or the data directory.

Run `npm test` for the lead/call/purchase flow, duplicate prevention, account restrictions, payment reporting, session revocation, origin protection, optimistic client updates, and IST/distinct-person report calculations.

### Adding salespeople and reviewing performance

Admins can click **+ Add salesperson** directly in CRM or Sales Reports, or use **Team → Add team member**. Enter a name, unique email and initial password. Each salesperson uses that email and password on the same dashboard login page; their assigned leads and personal reports are available after login. Admins can reset passwords or disable accounts in Team.

Assign leads in CRM, then use **Log call** to record each attempt and outcome. Sales Reports compares each salesperson's connected calls, unanswered calls, switched-off numbers, invalid numbers, connection rate, distinct connected leads, confirmed buyers and collections. Date and salesperson filters apply to the report and CSV export. Disabled salespeople remain available in report filters for historical analysis. Calls must be logged manually.


## Multi-service operations update

See [the workflow guide](docs/WORKFLOW-GUIDE.md) and [QA coverage report](docs/QA-REPORT.md).

- **Services:** create/edit/archive offerings, set default price and duration, and name a delivery leader. Choose PDC counselling only for services requiring a nutritionist and monthly meeting schedule; choose General service for other offerings.
- **CRM intake:** manually enter any source/campaign or import CSV (up to 500 rows / 1 MB per upload). The same phone can have different service opportunities. A duplicate within the same service rejects the import without partial writes.
- **Lead work:** assignment, calls, outcomes, stage, optional duration, discussion, reasons, follow-ups and activity notes. Historical calls retain their service/source attribution after lead edits.
- **Approvals:** review all pending purchases, confirm once, or cancel an incorrect pending purchase with a reason. Reassigning a pending purchase requires cancelling it first.
- **Collections:** PDC installments stay in the existing client payment workflow. General-service installments are entered from the confirmed lead detail and cannot exceed the balance. Retried payment requests with the same request ID are not applied twice.
- **Reports:** salesperson, service, source, lead effort and full call-log tables with date/service/source/salesperson filters and CSV export. Unique confirmed people are distinct from the count of service purchases. Activity-only work appears in Lead effort even when no call occurred in the period.
- **Team:** individual salesperson and nutritionist accounts, password reset, disable/enable. Salespeople see only assigned lead details and personal analytics; their historical totals remain after reassignment.

Existing SQLite records migrate on startup. Legacy service names are retained; legacy services use PDC behavior to preserve existing purchase/client links. The migration is idempotent. Back up the existing database volume before deploying. The existing Dockerfile and single persistent volume remain valid. No production deployment is performed by the tests.

### Browser regression checks

```sh
npm ci
npx playwright install chromium
npm run test:browser
```

For installed Google Chrome on macOS, use `PDC_BROWSER_CHANNEL=chrome npm run test:browser`. Tests create a temporary database and synthetic accounts, launch the app on a free local port, exercise three browser workflows, and remove the temporary database. Screenshots and test exports are saved in `qa/artifacts/` (ignored by Git). `npm test` runs the API/domain/migration suites without browser dependencies. CI runs both suites.

Incoming leads are supported through manual entry and CSV. Live Instagram/WhatsApp/ad-platform ingestion requires connecting those accounts separately. Calling is manually logged in the browser; the existing CallFlow connector can sync device events. Audio recording/transcription is not part of this dashboard.

## Sales operations

See [Operations guide](docs/OPERATIONS-GUIDE.md) for Excel import, automatic assignment, team leaders, targets, follow-up escalation, delivery, renewals, commission and connection setup. Runtime dependencies now install with `npm ci --omit=dev`; Docker installs these from the lockfile. External messaging and AI remain disconnected until configured.
