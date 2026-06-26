# PDC Client Dashboard

Open `index.html` in a browser to use the dashboard.

## Features

- Client name, phone, plan months, start date, end date, and next PDC meeting tracking
- Nutritionist assignment for Dr Luv Patel and Dt Nilesh Lakhani
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
- Data saves automatically in the browser using local storage

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
