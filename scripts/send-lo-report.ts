import { getLoTrackerData, getAutomationProfiles } from "../lib/queries";
import { sendLoMorningReport } from "../lib/slack";

async function main() {
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
