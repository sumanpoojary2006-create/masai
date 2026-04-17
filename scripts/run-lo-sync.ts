import { fetchAndAnalyzePendingSummaries } from "../lib/automation";
import { getAutomationProfiles } from "../lib/queries";

async function main() {
  const profiles = await getAutomationProfiles();

  if (profiles.length === 0) {
    console.log("No profiles found.");
    return;
  }

  for (const profile of profiles) {
    console.log(`\nProcessing: ${profile.email}`);
    const results = await fetchAndAnalyzePendingSummaries(profile);

    if (results.length === 0) {
      console.log("  No eligible lectures.");
      continue;
    }

    for (const r of results) {
      const icon = r.status === "fetched" ? "✓" : r.status === "error" ? "✗" : "—";
      console.log(`  ${icon} ${r.lectureName}: ${r.status}${r.reason ? ` (${r.reason})` : ""}`);
    }

    console.log(JSON.stringify(results, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
