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

    // 1. Get lectures with missing learning objectives
    const { data: lectures, error: lectureError } = await supabase
      .from("lectures")
      .select("id, batch_name, lecture_name")
      .eq("user_id", user.id)
      .or("learning_objective.is.null,learning_objective.eq.");

    if (lectureError) {
      throw new Error("Unable to fetch lectures: " + lectureError.message);
    }

    if (!lectures || lectures.length === 0) {
      return NextResponse.json({ message: "All lectures already have learning objectives mapped.", count: 0 });
    }

    // 2. Get batch curriculums
    const batchNames = [...new Set(lectures.map((l) => l.batch_name))];
    const { data: curriculums, error: curriculumError } = await supabase
      .from("batch_curriculums")
      .select("batch_name, lecture_name, learning_objective")
      .eq("user_id", user.id)
      .in("batch_name", batchNames);

    if (curriculumError) {
      throw new Error("Unable to fetch curriculums: " + curriculumError.message);
    }

    if (!curriculums || curriculums.length === 0) {
      return NextResponse.json({ message: "No curriculum uploaded. Upload a curriculum first in Profile settings." }, { status: 400 });
    }

    // Group curriculum by batch
    const curriculumByBatch: Record<string, { lecture_name: string; learning_objective: string }[]> = {};
    for (const c of curriculums) {
      if (!curriculumByBatch[c.batch_name]) curriculumByBatch[c.batch_name] = [];
      curriculumByBatch[c.batch_name].push({
        lecture_name: c.lecture_name,
        learning_objective: c.learning_objective
      });
    }

    let updatedCount = 0;

    // 3. Process matches
    for (const lecture of lectures) {
      const batchCurriculum = curriculumByBatch[lecture.batch_name] || [];
      if (batchCurriculum.length === 0) continue;

      const matchedObjective = await matchLearningObjectiveAI(lecture.lecture_name, batchCurriculum);

      if (matchedObjective) {
        const { error: updateError } = await supabase
          .from("lectures")
          .update({ learning_objective: matchedObjective })
          .eq("id", lecture.id);

        if (!updateError) {
          updatedCount++;
        }
      }
    }

    return NextResponse.json({
      message: `Successfully mapped ${updatedCount} out of ${lectures.length} missing learning objectives.`,
      count: updatedCount
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "AI Matching failed." },
      { status: 500 }
    );
  }
}
