import { analyzePendingLoReports, fetchAndAnalyzePendingSummaries } from "../lib/automation";
import { getAutomationProfiles } from "../lib/queries";
import { sendLoSyncSlackNotification } from "../lib/slack";

async function main() {
  const profiles = await getAutomationProfiles();

  if (profiles.length === 0) {
    console.log("No profiles found.");
    return;
  }

  for (const profile of profiles) {
    console.log(`\n════════════════════════════════════`);
    console.log(`Processing: ${profile.email}`);
    console.log(`════════════════════════════════════`);

    // Step 1 — Scrape LMS and fetch any new transcripts + run analysis on them
    console.log("\n[Step 1] Fetching transcripts from LMS…");
    const fetchResults = await fetchAndAnalyzePendingSummaries(profile);

    if (fetchResults.length === 0) {
      console.log("  No eligible lectures to scrape.");
    } else {
      for (const r of fetchResults) {
        const icon = r.status === "fetched" ? "✓" : r.status === "error" ? "✗" : "—";
        console.log(`  ${icon} ${r.lectureName}: ${r.status}${r.reason ? ` (${r.reason})` : ""}`);
      }
    }

    // Step 2 — Analyse any reports that have a transcript but no completed analysis
    console.log("\n[Step 2] Analysing pending LO reports…");
    const analyzeResults = await analyzePendingLoReports(profile.user_id);

    if (analyzeResults.length === 0) {
      console.log("  No pending reports to analyse.");
    } else {
      for (const r of analyzeResults) {
        const icon = r.status === "analyzed" ? "✓" : r.status === "error" ? "✗" : "—";
        const detail = r.status === "analyzed"
          ? `${r.coveredCount} covered / ${r.missingCount} missing`
          : (r.reason ?? "");
        console.log(`  ${icon} ${r.lectureName}: ${detail}`);
      }
    }

    // Step 3 — Send Slack notification to the LO channel
    console.log("\n[Step 3] Sending Slack notification…");
    try {
      await sendLoSyncSlackNotification({
        fetchResults,
        analyzeResults,
        email: profile.email
      });
    } catch (err) {
      console.error("[Step 3] Slack notification failed:", err);
    }
  }

  console.log("\nDone.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
