# CallFlow → PDC connector

Base URL: `https://pdc.yogeshaihub.in/api/callflow/`
Connector ID: `pdc-dashboard`

Use an active PDC Team account with the admin or salesperson role. Login uses the team email and password. Nutritionist accounts cannot connect. No shared API key is embedded in the app. Password changes and account disabling revoke mobile access and refresh tokens.

## Connect the Android app

The existing CallFlow project is `/Users/yogeshaihub/Documents/ChatGPT/Call Android` (GitHub `yogeshkukadiya92-stack/Callapp`). Its `CrmEndpoint` supports a custom connection before the first login. Existing installations lock their original connection to protect pending records. Use the separate PDC APK to keep the CFL workspace and its data intact.

Build a separate controlled team APK:

```sh
./gradlew assembleDebug \
  -Pcallflow.applicationId=com.callflow.pdc \
  -Pcallflow.apiBaseUrl=https://pdc.yogeshaihub.in/api/callflow/ \
  -Pcallflow.dashboardConnectorId=pdc-dashboard \
  -Pcallflow.useFakeBackend=false
```

For a new compatible installation, Login → CRM connection accepts the same base URL and connector ID. Create salespeople in PDC Team, create leads in Sales CRM and assign them. Sign into CallFlow with the salesperson's PDC email/password. Android stores tokens in its existing encrypted session store.

## Implemented contract

All routes require `X-CallFlow-Connector: pdc-dashboard`. Protected requests also require `Authorization: Bearer <accessToken>`.

| Route under the base URL | Access / behavior |
| --- | --- |
| `POST auth/login` | `identity`, `password`, `installId`; active admin/salesperson only |
| `POST auth/refresh` | Rotates a refresh token; old access and refresh tokens stop working |
| `POST auth/logout` | Revokes this mobile session |
| `POST devices/register` | Returns the authenticated device ID |
| `GET crm/status` | Connector identity and supported capabilities |
| `GET sync/changes` | Full authorized snapshot, compatible DTOs and assignment-removal tombstones |
| `POST sync/batch` | Up to 100 events; authenticates device, validates ownership and receipts |
| `GET/POST availability` | Stores the device's accepting-leads setting; assignment stays manual |
| `GET performance/today` | IST daily call attempts, connected attempts, talk time, confirmed sales and follow-ups |
| `GET engagement/config` | PDC message and note templates |

Access tokens expire after one hour; refresh/offline validity lasts seven days. Tokens are stored only as hashes. Mobile sessions bind to the account password hash, so password resets invalidate them immediately.

Supported outbox entities: `CALL` CREATE/UPDATE, `CALL_DISPOSITION` CREATE, `NOTE` CREATE, `LEAD` UPDATE and `FOLLOW_UP` CREATE/UPDATE/CANCEL. Payloads support Android's `payload.raw` JSON string. Accepted IDs are event UUIDs. Event receipts make retries idempotent and reject UUID reuse with different content. Each event applies atomically; rejected events remain in Android's outbox.

Calls must belong to an assigned CRM lead. An imported phone call without a lead ID can match exactly one authorized lead by normalized phone number; unmatched personal calls are rejected. Times and duration come from the app's metadata. Salesperson identity comes from the authenticated account, never the payload. Caller notes and dispositions update the dashboard call timeline and reports. Use Apply filters or Refresh to retrieve new reports/call activity.

The pull currently returns full snapshots rather than paginated incremental changes; this is suitable for the current small team. Removal tombstones persist across pull retries. Normalized Indian phone formats match the dashboard. Purchase-like mobile statuses become Proposal Sent; only the existing admin purchase-confirmation flow creates a PDC client and confirmed revenue.

Shift attendance, GPS check-in, campaign automation, call recordings, quotas and leaderboard ranking are not implemented by this connector. Unsupported routes return an error; daily target values are zero rather than invented targets. Duration capture depends on the existing Android call permissions/device support. Manual calling and notes continue to work.

## Validation

`npm test` checks the Android login/DTO contract, role scoping, assigned-lead pull, phone matching, call/note/disposition/follow-up push, retries, rescheduling/cancellation, duplicate prevention, revenue confirmation separation, reports, token rotation, credential revocation and assignment removals across retries. The PDC Android APK is compiled using the actual project and the configuration above. A real phone sign-in/call still needs the team's credentials and device.

Keep the `/app/data` persistent volume and back up the SQLite database. The connector stores its sessions, event receipts, notes and follow-ups in that database. Rolling back the code leaves that data intact.
