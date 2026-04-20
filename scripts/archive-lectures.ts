import { DateTime } from "luxon";

import { getAppTimezone } from "../lib/env";
import { createServerSupabase } from "../lib/supabase";

/**
 * Returns the label for the ISO week that contains `lectureDate`.
 * Examples:
 *   "13 - 19 Apr"     (same month)
 *   "27 Apr - 3 May"  (spans months)
 */
function computeWeekLabel(lectureDate: string, timezone: string): string {
  const dt = DateTime.fromISO(lectureDate, { zone: timezone });
  const monday = dt.startOf("week"); // Luxon: ISO week, Monday = day 1
  const sunday = monday.plus({ days: 6 });

  if (monday.month === sunday.month) {
    return `${monday.day} - ${sunday.day} ${sunday.toFormat("LLL")}`;
  }
  return `${monday.day} ${monday.toFormat("LLL")} - ${sunday.day} ${sunday.toFormat("LLL")}`;
}

async function main() {
  const timezone = getAppTimezone();
  const supabase = createServerSupabase();

  // Archive all non-archived lectures whose lecture_date is strictly before
  // the start of the current ISO week (i.e. last week and older).
  const currentWeekMonday = DateTime.now()
    .setZone(timezone)
    .startOf("week")
    .toISODate()!;

  console.log(`[archive] Current week starts: ${currentWeekMonday}`);
  console.log(`[archive] Archiving lectures with lecture_date < ${currentWeekMonday}`);

  // Fetch candidates
  const { data: lectures, error: fetchError } = await supabase
    .from("lectures")
    .select("id, lecture_date")
    .is("archived_at", null)
    .lt("lecture_date", currentWeekMonday);

  if (fetchError) {
    console.error("[archive] Fetch error:", fetchError.message);
    process.exit(1);
  }

  if (!lectures || lectures.length === 0) {
    console.log("[archive] No lectures to archive.");
    return;
  }

  console.log(`[archive] Found ${lectures.length} lecture(s) to archive.`);

  const now = new Date().toISOString();
  let archived = 0;

  for (const lecture of lectures) {
    const weekLabel = computeWeekLabel(lecture.lecture_date, timezone);

    const { error: updateError } = await supabase
      .from("lectures")
      .update({ archived_at: now, week_label: weekLabel })
      .eq("id", lecture.id);

    if (updateError) {
      console.error(`[archive] Failed to archive lecture ${lecture.id}:`, updateError.message);
    } else {
      console.log(`[archive] ✓ ${lecture.id} → week "${weekLabel}"`);
      archived++;
    }
  }

  console.log(`\n[archive] Done. Archived ${archived}/${lectures.length} lectures.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
