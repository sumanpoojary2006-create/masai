/**
 * Google Sheets integration via Apps Script web-app webhook.
 *
 * No service account or OAuth credentials needed.
 * The Apps Script runs as the sheet owner's Google account.
 *
 * Required env var:
 *   GOOGLE_APPS_SCRIPT_URL — the /exec URL from your deployed Apps Script web app
 */

export interface SheetBatch {
  name: string;   // tab title (batch name)
  rows: string[][]; // first element is the header row
}

export interface PushSheetPayload {
  batches: SheetBatch[];
}

/**
 * POST the coverage data to the Google Apps Script webhook.
 * Returns the parsed JSON response from the script.
 */
export async function pushToGoogleSheet(payload: PushSheetPayload): Promise<{ success?: boolean; error?: string }> {
  const url = process.env.GOOGLE_APPS_SCRIPT_URL?.trim();
  if (!url) {
    throw new Error(
      "GOOGLE_APPS_SCRIPT_URL is not configured. " +
        "Deploy the Apps Script web app in your spreadsheet and paste the /exec URL here."
    );
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain" }, // Apps Script ignores Content-Type but needs a body
    body: JSON.stringify(payload),
    redirect: "follow"
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apps Script responded with ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = await res.json() as { success?: boolean; error?: string };
  if (json.error) throw new Error(`Apps Script error: ${json.error}`);
  return json;
}
