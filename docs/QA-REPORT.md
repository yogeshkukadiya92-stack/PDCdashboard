# Dashboard audit and remediation — 21 October 2026

## Readiness

**Local release candidate: READY for deployment review. Production rollout: NOT TESTED / not deployed.**

The requested manual/CSV lead → assigned salesperson → call/activity → pending purchase → admin approval → service/payment/report flow is implemented and exercised locally. The existing PDC client workflow remains available. This is not a claim that every external integration or production environment has been validated.

Environment: Node 26.4.0, SQLite, installed Google Chrome driven by Playwright 1.64.1; isolated temporary databases and synthetic admin, salesperson and nutritionist accounts. Desktop 1440×900, small desktop 1280×800 and mobile 390×844. Tests do not touch the live site's records. CI is configured for Node 24 and bundled Chromium, but this report does not claim a remote CI run.

## Findings and changes

All root causes below were **CONFIRMED** from source and targeted execution. Each was FOUND, FIXED, and RETESTED — PASS as described. Severity totals: P0: 0; P1: 2; P2: 5; P3: 3. Product enhancements are included where the old behavior could not support the requested workflow.

| ID | Severity | Category | Finding / reproduction | Fix and evidence |
|---|---|---|---|---|
| QA-01 | P1 | BUSINESS LOGIC | Every sale required one of two nutritionists and created a PDC client, even for other services. | Persistent service catalog with PDC/general types, defaults and delivery leader. General purchase/approval/installment browser workflow and API test verify no PDC client is created. |
| QA-02 | P1 | DATA CONSISTENCY | Mark the first monthly meeting Done, then normalize/save again: the next meeting date became the schedule anchor and could drop/shift prior history. | Anchor to existing schedule, retain IDs/dates/status/notes and reschedule pending meetings explicitly. Browser verifies history after installments, reload and rescheduling. |
| QA-03 | P2 | BUSINESS LOGIC | The same phone could not have a lead for two different services. | Duplicate key is normalized phone + service. API verifies both opportunities, duplicate rejection, and atomic CSV rollback. |
| QA-04 | P2 | UX | No service/source breakdown, per-lead work report or general-service approval/collection workflow. | Five report tables, historical attribution, call duration/reason, activity notes, approval queue and general installments. API reconciles two purchases with one unique buyer; browser exercises all tables and exports. |
| QA-05 | P2 | PERMISSION | Nutritionist creation and assignment were hardcoded to two names. | Configured nutritionists appear in assignment lists; original names remain. Browser verifies a new provider sees only their client; API preserves write restrictions. |
| QA-06 | P2 | DATA CONSISTENCY | CRM reports could remain stale after client payments until a separate refresh. | Entering CRM/reports/team/services refreshes authoritative state. Browser payment and report navigation exercised. |
| QA-07 | P2 | FORM VALIDATION | Loose date parsing accepted impossible calendar dates; generic payment requests needed duplicate protection. | Strict calendar/report-range validation, balance checks, payment request deduplication and client payment-total checks. API covers invalid dates, overpayment and replay. |
| QA-08 | P3 | ACCESSIBILITY | Mobile navigation hid all text labels, leaving unnamed links. | Visible labels in a three-column mobile menu. Mobile browser navigates Services/Reports and interacts with forms. |
| QA-09 | P3 | NAVIGATION | Navigation replaced history; an unknown hash could show no active section. | Browser history records view changes and unknown sections fall back to an allowed view. Back navigation and direct invalid URLs tested. |
| QA-10 | P3 | FORM VALIDATION | Existing client/payment forms used novalidate and bypassed native required/range checks. | Explicit form validity checks before saving; server validates date/duration/amount constraints. Valid client/instalment paths retested in browser. |

For QA-01/03/04, the practical reproduction was attempting to model a second service and record its activity/purchase with the original fixed PDC schema. The new workflow was tested using a synthetic workshop and a counselling purchase. For QA-02, assertions compare all displayed meeting dates before and after save/reload and verify the first meeting remains Done. For QA-07, API assertions check rejection status and unchanged balances, including a replay of a final payment. Regression risk is concentrated in shared client normalization, service migration and reporting; these have dedicated tests.

## Coverage ledger

PASS indicates exercised behavior, not merely a handler found in source. WARN means partial coverage described here. There are nine dashboard sections, plus authentication and shared dialogs.

| Surface / role | Status | Exercised interactions and states | Remaining coverage |
|---|---|---|---|
| Login/logout, all three roles | PASS | Separate login, logout, role navigation, session revocation in API tests, restricted URLs | Production password recovery/email is not integrated |
| Overview, admin/nutritionist | PASS | Navigation, configured provider filter, client counts, sales summary rendering | External notification and WhatsApp actions not executed |
| Clients, admin/nutritionist | WARN | Create/edit, payment state, export/import, assignment, read-only provider, reload | Client deletion/lifecycle bucket toggles not exercised in browser |
| Payments, admin | PASS | Installments, payment deletion, mark fully paid, aggregate display and server reconciliation | Real payment provider callbacks not present/tested |
| History, admin/nutritionist | PASS | Done/Missed/Pending, history persistence, provider access, pending rescheduling | Prompt-based note edits/weight/goal variants not exhaustively exercised |
| Reminders, admin/nutritionist | WARN | Navigation and rendering with saved client data | WhatsApp send, notification permission and print output not tested |
| CRM, admin/salesperson | PASS | Create lead, service/source/assignment, search, call outcome/duration/discussion, notes, purchase, confirm, general payment, CSV preview/import, reload | Phone dial link not used to place real calls; bulk import error exercised at API level |
| Sales Reports, admin/salesperson | PASS | All five tables, service/source/person/date logic, invalid range recovery, unique people vs purchases, CSV download, historical archived service | Large production-scale data/response-time testing not performed |
| Services, admin | PASS | Create/edit/archive; archived option excluded from new lead form; history retained | Concurrent update conflict exercised at API level |
| Team, admin | PASS | Salesperson/nutritionist accounts, reset password, disable/enable, CRM backup download | Profile-name/email edits are not part of the current feature set |
| Shared dialogs/mobile | PASS | Open/save/cancel, single-column mobile form, labeled navigation, horizontal table containment | Full WCAG audit, Safari/Firefox and screen readers not tested |
| CallFlow adapter | WARN | Existing automated Android contract tests; attribution fields and note history retained | No physical Android device/live call was used |
| Google Sheets settings/sync/import | NOT TESTED | Source mapped; existing explicit workflow preserved | Requires a configured live Sheet; no external writes performed |
| Production / Coolify | NOT TESTED | Existing Docker build inputs and persistent volume design inspected | Live build, deployment, real-data acceptance and rollback remain to be performed |

Browser page errors: none in the passing workflows. The role/client regression workflow also asserts no unexpected API failures. Expected initial unauthenticated state responses are excluded. No load, security certification, accessibility certification or exhaustive cross-browser claim is made.

## Automated checks and evidence

- `npm test`: 11 passing tests across domain/reporting, CRM API, multi-service operations, legacy migration/restart and CallFlow contract behavior.
- `PDC_BROWSER_CHANNEL=chrome npm run test:browser`: three passing browser workflows. Runner creates and deletes its own database and uses a free local port.
- Syntax checks: server, client and connector JavaScript.
- Screenshots and synthetic exports: `qa/artifacts/` (ignored by Git). Includes desktop reports, mobile service form, mobile salesperson reports and final mobile service report.
- Reproducible scenarios: `qa/admin-flow.mjs`, `qa/roles-flow.mjs`, `qa/admin-controls.mjs`.

Two test-harness issues found during development (ambiguous button selector and duplicate dialog acceptance) were corrected; they were not application defects. The final passing run includes those controls.

## Operational limits and next steps

1. Back up the existing database volume, deploy this version using the existing Dockerfile and retain the persistent volume; the startup migration preserves legacy records and is tested twice for idempotence.
2. Confirm the real service list, prices, delivery leaders and team accounts through Services/Team. No real accounts or business data were invented by this work.
3. Perform live acceptance with an authorized disposable lead, then begin operational use.
4. Connect social/ad/form sources separately if automatic intake is wanted. Current intake supports manual entry and CSV; source labels alone do not fetch external leads.
5. Browser calls are manually logged; no audio recording/transcription is implemented. The existing CallFlow connector is optional.
6. CRM JSON backup contains business data; database-volume backup is required for full recovery including accounts. A full CRM JSON restore screen is not implemented. Existing top-bar client JSON import is tested.

No UI features were removed. The report tables consolidate analytics into five selectable views; general purchases stay in CRM while PDC clients retain their established meeting/payment workflow. Remaining release risk is external configuration, live data volume and production rollout, rather than a known failing local core workflow.
