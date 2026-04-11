import { createClient } from "@supabase/supabase-js";

import { scrapeLmsResources } from "@/lib/lms-scraper";

async function main() {
  const lectureName = process.env.DEBUG_LECTURE_NAME;

  if (!lectureName) {
    throw new Error("DEBUG_LECTURE_NAME is required.");
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_KEY are required.");
  }

  if (!process.env.LMS_USERNAME || !process.env.LMS_PASSWORD) {
    throw new Error("LMS credentials are required.");
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

  const { data: lecture, error } = await supabase
    .from("lectures")
    .select(
      "id,user_id,batch_name,module_name,lecture_name,lecture_date,start_time,end_time,tasks(id,lecture_id,type,deadline,status,completed_at)"
    )
    .eq("lecture_name", lectureName)
    .single();

  if (error || !lecture) {
    throw new Error(error?.message ?? `Lecture not found: ${lectureName}`);
  }

  const result = await scrapeLmsResources([lecture], {
    username: process.env.LMS_USERNAME,
    password: process.env.LMS_PASSWORD
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
