export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { matchLearningObjectiveAI } from "@/lib/lo-matcher";
import { createServerSupabase } from "@/lib/supabase";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: "Please log in first." }, { status: 401 });
    }

    const supabase = createServerSupabase();

    // 1. Fetch curriculum — include both user-specific AND global (admin-uploaded, user_id IS NULL)
    const { data: curriculums, error: curriculumError } = await supabase
      .from("batch_curriculums")
      .select("batch_name, lecture_name, learning_objective")
      .or(`user_id.eq.${user.id},user_id.is.null`);

    if (curriculumError) {
      throw new Error("Unable to fetch curriculums: " + curriculumError.message);
    }

    if (!curriculums || curriculums.length === 0) {
      return NextResponse.json(
        { message: "No curriculum uploaded. Ask admin to upload a curriculum for your batch first." },
        { status: 400 }
      );
    }

    // 2. Get ALL non-archived lectures for this user
    const { data: lectures, error: lectureError } = await supabase
      .from("lectures")
      .select("id, batch_name, lecture_name")
      .eq("user_id", user.id)
      .is("archived_at", null);

    if (lectureError) {
      throw new Error("Unable to fetch lectures: " + lectureError.message);
    }

    if (!lectures || lectures.length === 0) {
      return NextResponse.json({ message: "No lectures found.", count: 0 });
    }

    // Group curriculum by batch — user-specific entries take priority over global ones
    const curriculumByBatch: Record<string, { lecture_name: string; learning_objective: string }[]> = {};

    // Insert global (user_id=null) entries first, then user-specific overrides on top
    const sorted = [...curriculums].sort((a, b) => {
      const aIsGlobal = (a as Record<string, unknown>).user_id == null ? 1 : 0;
      const bIsGlobal = (b as Record<string, unknown>).user_id == null ? 1 : 0;
      return aIsGlobal - bIsGlobal; // user-specific (0) comes after global (1) so it overwrites
    });

    for (const c of sorted) {
      if (!curriculumByBatch[c.batch_name]) curriculumByBatch[c.batch_name] = [];
      // Replace existing entry for the same lecture name (user-specific beats global)
      const idx = curriculumByBatch[c.batch_name].findIndex(
        (e) => e.lecture_name === c.lecture_name
      );
      if (idx >= 0) {
        curriculumByBatch[c.batch_name][idx] = {
          lecture_name: c.lecture_name,
          learning_objective: c.learning_objective
        };
      } else {
        curriculumByBatch[c.batch_name].push({
          lecture_name: c.lecture_name,
          learning_objective: c.learning_objective
        });
      }
    }

    let updatedCount = 0;
    let skippedCount = 0;

    // 3. Re-match ALL lectures against curriculum and overwrite learning_objective
    for (const lecture of lectures) {
      const batchCurriculum = curriculumByBatch[lecture.batch_name] ?? [];
      if (batchCurriculum.length === 0) {
        skippedCount++;
        continue; // no curriculum for this batch
      }

      const matchedObjective = await matchLearningObjectiveAI(lecture.lecture_name, batchCurriculum);

      if (matchedObjective) {
        const { error: updateError } = await supabase
          .from("lectures")
          .update({ learning_objective: matchedObjective })
          .eq("id", lecture.id);

        if (!updateError) updatedCount++;
      }
    }

    return NextResponse.json({
      message: `Matched ${updatedCount} learning objective(s) from curriculum.${skippedCount > 0 ? ` (${skippedCount} lecture(s) skipped — no curriculum for their batch)` : ""}`,
      count: updatedCount
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "AI Matching failed." },
      { status: 500 }
    );
  }
}
