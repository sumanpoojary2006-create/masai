import { google } from "googleapis";

/**
 * Returns an authenticated Google Sheets API client.
 *
 * Requires two env vars:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL  — service account email
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY — private key (PEM, with literal \n for newlines)
 */
export function getSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "";
  // Support both real newlines and escaped \n (common when pasting into env files)
  const key = rawKey.replace(/\\n/g, "\n");

  if (!email || !key) {
    throw new Error(
      "Google Sheets credentials not configured. " +
        "Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY in your environment."
    );
  }

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });

  return google.sheets({ version: "v4", auth });
}

/** The spreadsheet ID from GOOGLE_SHEETS_ID env var. */
export function getSpreadsheetId(): string {
  const id = process.env.GOOGLE_SHEETS_ID?.trim();
  if (!id) {
    throw new Error(
      "GOOGLE_SHEETS_ID is not configured. " +
        "Set it to the ID from your Google Sheets URL (the long alphanumeric string)."
    );
  }
  return id;
}

/**
 * Sanitise a batch name so it can be used as a Google Sheet tab title.
 * Rules: max 100 chars, no [ ] * ? : / \ characters.
 */
export function sanitiseSheetTitle(name: string): string {
  return name
    .replace(/[\[\]*?:/\\]/g, "-")
    .slice(0, 100)
    .trim();
}
