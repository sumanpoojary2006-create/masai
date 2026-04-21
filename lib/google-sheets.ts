import { createServerSupabase } from "./supabase";
import { LoReport } from "./types";

/**
 * Pushes a lecture's LO coverage report to a Google Spreadsheet via an Apps Script web app.
 *
 * This approach doesn't require Google Cloud Service Accounts.
 * The Apps Script script handles the sheet manipulation using the user's account.
 */
export async function pushLoReportToSheet(lectureId: string) {
  const supabase = createServerSupabase();

  // 1. Fetch lecture details with LO report
  const { data: lecture, error } = await supabase
    .from("lectures")
    .select(`
      *,
      lo_report:lo_reports(*)
    `)
    .eq("id", lectureId)
    .single();

  if (error || !lecture) throw new Error("Lecture not found");

  const loReport = (lecture as any).lo_report as LoReport | null;
  if (!loReport || loReport.status !== "completed") {
    throw new Error("No completed LO report found for this lecture");
  }

  // 2. Prepare payload
  // We send the data structured so the Apps Script can easily parse it.
  const sheetName = lecture.batch_name;
  const payload = {
    batch: lecture.batch_name,
    lectureName: lecture.lecture_name,
    date: lecture.lecture_date,
    covered: loReport.covered_los?.join("\n") || "None",
    missing: loReport.missing_los?.join("\n") || "None",
    status: "Completed",
    syncedAt: new Date().toISOString()
  };

  // 3. Trigger Apps Script
  const url = process.env.GOOGLE_APPS_SCRIPT_URL?.trim();
  if (!url) {
    throw new Error("GOOGLE_APPS_SCRIPT_URL environment variable is missing.");
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "follow" // Essential for Apps Script redirects
    });

    const result = await response.json() as { success?: boolean; error?: string };

    if (!response.ok || result.error) {
      throw new Error(result.error || `Apps Script error: ${response.statusText}`);
    }

    return { success: true, result };
  } catch (err: any) {
    console.error("[google-sheets] Apps Script push failed:", err);
    throw new Error(`Failed to push to Topic Coverage Tracker: ${err.message}`);
  }
}
