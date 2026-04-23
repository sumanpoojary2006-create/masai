// Daily Slack digest at 2:30 PM (IST) about Completed and Pending counts
// This script uses Supabase REST API with service role key to count tasks by status
// and posts a digest to a Slack webhook.
// Environment:
// - SUPABASE_URL
// - SUPABASE_KEY (service role key recommended)
// - SLACK_WEBHOOK_URL
// - APP_TIMEZONE (optional)

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
if (!SUPABASE_URL || !SUPABASE_KEY || !SLACK_WEBHOOK_URL) {
  console.log("Missing required env vars. Skipping digest.");
  process.exit(0);
}

async function countStatus(status) {
  const url = `${SUPABASE_URL}/rest/v1/tasks?status=eq.${status}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      apikey: SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      Prefer: "count=exact",
      Accept: "application/json"
    }
  });
  if (!res.ok) {
    throw new Error(`Failed to count ${status}: ${res.status}`);
  }
  // Try to read exact count from content-range header
  const cr = res.headers.get("content-range") || "";
  let total = 0;
  if (cr.includes("/")) {
    const parts = cr.split("/");
    total = parseInt(parts[1], 10) || 0;
  }
  // Fallback: if body has data, count it
  try {
    const data = await res.json();
    if (Array.isArray(data)) total = data.length > 0 ? data.length : total;
  } catch {
    // ignore
  }
  return total;
}

async function postSlack(message) {
  const r = await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: message })
  });
  if (!r.ok) {
    throw new Error(`Slack webhook failed: ${r.status}`);
  }
}

async function main() {
  try {
    const completed = await countStatus("completed");
    const pending = await countStatus("pending");
    const message = `Daily Digest - Status: Completed ${completed}, Pending ${pending}`;
    await postSlack(message);
    console.log("Daily Slack digest sent.");
  } catch (e) {
    console.error("Digest failed:", e && e.message ? e.message : e);
  }
}

main();
