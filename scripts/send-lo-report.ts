import { getLoTrackerData, getAutomationProfiles } from "../lib/queries";
import { getAppTimezone } from "../lib/env";
import { evaluateScheduledRunWindow } from "../lib/scheduled-run";
import { sendLoMorningReport } from "../lib/slack";

async function main() {
  if (process.env.FORCE_LO_REPORT !== "true") {
    const schedule = evaluateScheduledRunWindow({
      timezone: getAppTimezone(),
      hour: 9,
      minute: 0,
      maxDelayMinutes: 60,
      allowedWeekdays: [1, 2, 3, 4, 5, 6]
    });

    if (!schedule.shouldRun) {
      console.log(`[lo-report] ${schedule.reason}`);
      return;
    }
  }

  const profiles = await getAutomationProfiles();

  if (profiles.length === 0) {
    console.log("No profiles found.");
    return;
  }

  for (const profile of profiles) {
    console.log(`\nSending morning LO report for: ${profile.email}`);

    const rows = await getLoTrackerData(profile.user_id);

    await sendLoMorningReport({
      rows,
      email: profile.email
    });
  }

  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
