# All About Worksheets

## Managing Worksheets

The website reads published worksheet data from the Supabase API. Google Sheets is the editor-friendly source of truth; visitors never access Google Sheets directly.

### Add one worksheet

1. Create the worksheet PDF.
2. Upload the PDF and thumbnail to the `worksheets` Supabase Storage bucket. Copy their public URLs.
3. Add one row to the Google Sheet using these exact columns: `ID`, `Title`, `Subject`, `Class`, `Level`, `Topic`, `Description`, `PDF URL`, `Thumbnail URL`, `Published Date`, `Status`, `Featured`, `Tags`.
4. Set `Level` to `Easy`, `Medium`, or `Hard`.
5. Set `Status` to `Draft` until it is ready, then use `Published`.
6. Set `Featured` to `TRUE` or `FALSE`.
7. Trigger a sync. Only rows with valid data are imported; errors are returned and stored in `worksheet_sync_logs`.
8. Confirm the worksheet appears at `worksheets.html` and that both URLs work.

Use a stable, unique `ID`. It may contain letters, numbers, hyphens, and underscores. Do not change it after publishing.

### Edit or remove a worksheet

Edit any metadata, URL, featured flag, or status in the Sheet, then sync again. Use `Archived` to remove it from public results while retaining its record. Removing a previously-synced row also archives it on the next sync.

### Bulk upload

Upload PDFs/thumbnails in batches, then paste 50–100 rows into the Sheet. Give every row a unique ID and URLs before syncing. Resolve reported invalid rows and rerun the sync; valid rows are never blocked by invalid rows.

### Sync manually

Call the protected function from a terminal or an automation tool. Never place the secret in browser JavaScript:

```powershell
Invoke-RestMethod -Method Post `
  -Uri "https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-worksheets" `
  -Headers @{ "x-sync-secret" = "YOUR_SYNC_SECRET" }
```

For automatic sync, schedule the same POST request daily using GitHub Actions, Supabase Cron, or an external scheduler. Daily is sufficient for this content type.

## Google Sheets setup

1. Create a Google Sheet and name its first tab `Worksheets`.
2. Put the thirteen exact column names above in row 1.
3. In Google Cloud Console, create a project, enable **Google Sheets API**, and create a **Service Account**.
4. Create a JSON key for that service account. Treat it as a password.
5. Share the Google Sheet with the service account `client_email` as **Viewer**.
6. Copy the Sheet ID from its URL (the part between `/d/` and `/edit`).
7. Put the JSON as a one-line value in the `GOOGLE_SERVICE_ACCOUNT_JSON` Supabase secret. Do not commit it.

## Supabase setup

1. Create a Supabase project.
2. In SQL Editor, run `supabase/migrations/20260731_create_worksheets.sql`.
3. Create a public Storage bucket named `worksheets`; store PDFs under `pdfs/` and thumbnails under `thumbnails/`.
4. Install the Supabase CLI, log in, link the project, then deploy:

```powershell
supabase functions deploy worksheets
supabase functions deploy sync-worksheets
```

5. Set each value in `.env.example` as a Supabase Edge Function secret:

```powershell
supabase secrets set GOOGLE_SHEET_ID="..." GOOGLE_SHEET_TAB="Worksheets" SYNC_SECRET="..." ALLOWED_ORIGIN="https://www.yourdomain.com"
supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are server-only Edge Function values. Never expose the service-role key in `js/config.js`.

6. Set `apiUrl` in `js/config.js` to `https://YOUR_PROJECT_REF.supabase.co/functions/v1/worksheets`.
7. Deploy the static website normally. The UI requests only nine matching records per page.

## Migrating the existing catalogue

Run the migration helper to create CSV rows from the old JSON, then paste it into the Sheet:

```powershell
node scripts/export-legacy-worksheets.mjs > worksheets-migration.csv
```

Replace placeholder Drive IDs with real PDF URLs before the first sync. Verify the 20 imported records in Supabase, test their PDF URLs and thumbnails, then set `js/config.js` to the API URL.

## API

`GET /functions/v1/worksheets?page=1&pageSize=9&class=Grade%201&subject=Math&level=Easy&sort=newest`

The API accepts only Class, Subject, and Level filters. It supports `newest` and `alphabetical` sorting, does database-side filtering/pagination, and caches successful listing responses for five minutes at shared caches.
