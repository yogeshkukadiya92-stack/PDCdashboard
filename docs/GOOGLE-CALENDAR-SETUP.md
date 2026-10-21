# Google Calendar meetings

Dashboard → Operations → Meetings & Calendar.

## One-time server setup

1. In Google Cloud, create/select a project and enable Google Calendar API.
2. Configure Google Auth Platform branding/audience. For testing, add every connecting account as a test user. External production apps may require Google's verification; testing-mode refresh tokens may expire after seven days.
3. Create an OAuth client of type **Web application**. Set the authorized redirect URI exactly to:
   `https://pdc.yogeshaihub.in/api/calendar/callback`
4. Set these environment variables on the PDC server, then redeploy:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI=https://pdc.yogeshaihub.in/api/calendar/callback`
   - `GOOGLE_CALENDAR_ENCRYPTION_KEY`: a random 32-byte base64 key (generate with `openssl rand -base64 32`). Keep the key backed up securely, unchanged across restarts/deployments. Rotating it requires reconnecting accounts.
5. Open Operations → Meetings & Calendar. Each dashboard user connects their own Google account and grants Google Calendar access, then chooses a writable calendar. Connect again to add another account/calendar. Use Reconnect on an existing connection to restore expired access without losing meeting links.

Never paste client secrets, tokens or encryption keys into a chat or public frontend. Tokens are encrypted with AES-256-GCM in the persistent database and excluded from JSON backups/API responses. Database backups and the encryption key must both be retained securely.

## ગુજરાતી ઉપયોગ

1. **Operations → Meetings & Calendar → Connect Google Calendar** ખોલો.
2. જોડાણનું નામ આપો, Google account પસંદ કરો અને Calendarની મંજૂરી આપો.
3. **Choose calendar** માં તમારી meeting જ્યાં ઉમેરવી હોય તે calendar પસંદ કરો.
4. **New meeting** માં title, શરૂઆત અને અંતનો સમય (IST), જરૂર હોય તો lead, location અને notes ભરો.
5. **Save & sync** દબાવો. `synced` દેખાય એટલે Google Calendarમાં meeting ઉમેરાઈ ગઈ છે.
6. **Edit** થી સમય/વિગતો બદલશો તો Googleમાં update થશે. **Cancel meeting** થી Google event દૂર થશે.
7. `failed` દેખાય તો meeting dashboardમાં સાચવાયેલી છે; **Reconnect** અથવા connection તપાસીને **Retry sync** કરો. Retry duplicate બનાવતું નથી.

## Boundaries

- One-way sync: dashboard → Google. Changes made in Google Calendar are not imported.
- No guest invitation emails, automatic Google Meet links or automatic call/follow-up conversions.
- Only the owner can change/sync their meeting. Admin can view all dashboard meetings but cannot operate another user's Google connection.
- Only user-selected writable calendars are supported; arbitrary private calendars require Google access from their owner.
- Disconnect removes the local credential and leaves Google events unchanged. Revoke app access separately in Google Account settings if needed. Disconnect blocks when meeting changes still need syncing.
- Failed syncs are durable and have a manual Retry action; there is no unattended background retry worker.
- Existing meetings keep their original calendar. Add another connection to use a new calendar.

Official references: https://developers.google.com/identity/protocols/oauth2/web-server and https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
