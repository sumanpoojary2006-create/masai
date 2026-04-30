import { getAutomationProfiles, getAutomationLectures } from "../lib/queries";
import { checkLmsTasksForLecture, closeLmsDb } from "../lib/lms-db";

function extractBatchIdFromUrl(url: string): number | null {
  try {
    const decoded = decodeURIComponent(url);
    const match = decoded.match(/"id"\s*:\s*(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  } catch {
    return null;
  }
}

async function main() {
  const targetUserId = process.env.TARGET_USER_ID?.trim() || undefined;
  const profiles = await getAutomationProfiles(targetUserId);

  if (profiles.length === 0) {
    console.log("No profiles found.");
    return;
  }

  for (const profile of profiles) {
    console.log(`\nProfile: ${profile.email}`);
    console.log("Batch configs:", profile.batch_configs.map(c => `${c.batch_name}: ${c.lecture_batch_url}`));

    const lectures = await getAutomationLectures(profile.user_id);

    if (lectures.length === 0) {
      console.log("No lectures found for this profile.");
      continue;
    }

    console.log(`Found ${lectures.length} lectures to check.`);

    for (const lecture of lectures) {
      const batchConfig = profile.batch_configs.find(c => c.batch_name === lecture.batch_name);
      if (!batchConfig) {
        console.log(`No batch config for ${lecture.batch_name}`);
        continue;
      }

      const batchId = extractBatchIdFromUrl(batchConfig.lecture_batch_url);
      if (!batchId) {
        console.log(`Could not extract batch_id from URL: ${batchConfig.lecture_batch_url}`);
        continue;
      }

      console.log(`\nChecking lecture: ${lecture.lecture_name} (${lecture.lecture_date})`);
      console.log(`Batch: ${lecture.batch_name}, Batch ID: ${batchId}`);

      try {
        const result = await checkLmsTasksForLecture(batchId, lecture.lecture_name, lecture.lecture_date);
        console.log("LMS DB check result:", result);

        // Check current task status
        const prereadTask = lecture.tasks.find(t => t.type === 'preread');
        if (prereadTask) {
          console.log(`Current preread task status: ${prereadTask.status}, completed_at: ${prereadTask.completed_at}`);
        } else {
          console.log("No preread task found for this lecture");
        }

      } catch (err) {
        console.error(`Error checking lecture ${lecture.lecture_name}:`, err instanceof Error ? err.message : err);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(() => {
  closeLmsDb();
});