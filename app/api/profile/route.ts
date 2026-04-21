export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { parseCurriculumWorkbook } from "@/lib/importer";
import { deriveAssignmentBatchUrl } from "@/lib/lms-batch-urls";
import { createServerSupabase } from "@/lib/supabase";

export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        {
          message: "Please log in first."
        },
        {
          status: 401
        }
      );
    }

    const formData = await request.formData();
    const email = String(formData.get("email") ?? "");
    const lmsUsername = String(formData.get("lms_username") ?? "").trim();
    const lmsPassword = String(formData.get("lms_password") ?? "").trim();
    const slackMemberId = String(formData.get("slack_member_id") ?? "").trim() || null;

    let parsedConfigs: Record<string, unknown>[] = [];
    try {
      const batchConfigsStr = formData.get("batch_configs");
      if (typeof batchConfigsStr === "string") {
        parsedConfigs = JSON.parse(batchConfigsStr);
      }
    } catch {
      // Ignore parse errors
    }

    const batchConfigs = Array.isArray(parsedConfigs)
      ? parsedConfigs
        .map((entry, index) => {
          const config = (entry ?? {}) as Record<string, unknown>;
          const batchName = String(config.batch_name ?? "").trim();
          const lectureBatchUrl = String(config.lecture_batch_url ?? "").trim();
          const assignmentBatchUrl = String(
            config.assignment_batch_url || deriveAssignmentBatchUrl(lectureBatchUrl)
          ).trim();

          const file = formData.get(`curriculum_file_${index}`);

          return {
            batch_name: batchName,
            lecture_batch_url: lectureBatchUrl,
            assignment_batch_url: assignmentBatchUrl,
            curriculum_file: file instanceof File ? file : null
          };
        })
        .filter(
          (config) =>
            config.batch_name || config.lecture_batch_url || config.assignment_batch_url
        )
      : [];

    if (!lmsUsername || !lmsPassword || batchConfigs.length === 0) {
      return NextResponse.json(
        {
          message: "LMS username, LMS password, and at least one batch configuration are required."
        },
        {
          status: 400
        }
      );
    }

    const invalidBatchConfig = batchConfigs.find(
      (config) => !config.batch_name || !config.lecture_batch_url
    );

    if (invalidBatchConfig) {
      return NextResponse.json(
        {
          message: "Each batch needs a batch name and lecture batch URL."
        },
        {
          status: 400
        }
      );
    }

    const duplicateBatchNames = batchConfigs
      .map((config) => config.batch_name)
      .filter((batchName, index, values) => values.indexOf(batchName) !== index);

    if (duplicateBatchNames.length > 0) {
      return NextResponse.json(
        {
          message: `Duplicate batch names are not allowed: ${[...new Set(duplicateBatchNames)].join(", ")}`
        },
        {
          status: 400
        }
      );
    }

    const supabase = createServerSupabase();
    const primaryBatch = batchConfigs[0];
    const { error } = await supabase.from("user_profiles").upsert(
      {
        user_id: user.id,
        email: user.email ?? "",
        lms_username: lmsUsername,
        lms_password: lmsPassword,
        batch_name: primaryBatch.batch_name,
        lecture_batch_url: primaryBatch.lecture_batch_url,
        assignment_batch_url: primaryBatch.assignment_batch_url,
        onboarding_complete: true,
        slack_member_id: slackMemberId
      },
      {
        onConflict: "user_id"
      }
    );

    if (error) {
      throw new Error(error.message);
    }

    const { error: configError } = await supabase.from("user_batch_configs").upsert(
      batchConfigs.map((config) => ({
        user_id: user.id,
        batch_name: config.batch_name,
        lecture_batch_url: config.lecture_batch_url,
        assignment_batch_url: config.assignment_batch_url
      })),
      {
        onConflict: "user_id,batch_name"
      }
    );

    if (configError) {
      throw new Error(configError.message);
    }

    const submittedBatchNames = new Set(batchConfigs.map((config) => config.batch_name));
    const { data: existingConfigs, error: existingConfigsError } = await supabase
      .from("user_batch_configs")
      .select("id, batch_name")
      .eq("user_id", user.id);

    if (existingConfigsError) {
      throw new Error(existingConfigsError.message);
    }

    const configIdsToDelete = (existingConfigs ?? [])
      .filter((config) => !submittedBatchNames.has(config.batch_name))
      .map((config) => config.id);

    if (configIdsToDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from("user_batch_configs")
        .delete()
        .in("id", configIdsToDelete);

      if (deleteError) {
        throw new Error(deleteError.message);
      }
    }

    // Process curriculum files if uploaded
    for (const config of batchConfigs) {
      const file = config.curriculum_file;
      if (file && typeof file === "object" && "arrayBuffer" in file && (file as File).size > 0) {
        try {
          const fileBuffer = Buffer.from(await (file as File).arrayBuffer());
          const curriculums = parseCurriculumWorkbook(fileBuffer);

          if (curriculums.length > 0) {
            const curriculumPayload = curriculums.map((c) => ({
              user_id: user.id,
              batch_name: config.batch_name,
              lecture_name: c.lecture_name,
              learning_objective: c.learning_objective
            }));

            const { error: curriculumError } = await supabase
              .from("batch_curriculums")
              .upsert(curriculumPayload, {
                onConflict: "user_id,batch_name,lecture_name"
              });

            if (curriculumError) {
              console.error("Error upserting curriculum:", curriculumError);
              throw new Error("Database error while saving curriculum: " + curriculumError.message);
            }
          } else {
            throw new Error(`The uploaded curriculum file for batch '${config.batch_name}' does not contain recognized columns. Ensure it has "lecture_name" and "learning_objective".`);
          }
        } catch (e) {
          console.error("Failed to parse curriculum file for batch:", config.batch_name, e);
          return NextResponse.json(
            { message: e instanceof Error ? e.message : "Failed to process curriculum file." },
            { status: 400 }
          );
        }
      }
    }

    return NextResponse.json({
      message: "Profile saved."
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Unable to save your profile."
      },
      {
        status: 500
      }
    );
  }
}
