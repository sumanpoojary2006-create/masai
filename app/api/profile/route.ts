export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
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

    const payload = (await request.json()) as Record<string, unknown>;
    const lmsUsername = String(payload.lms_username ?? "").trim();
    const lmsPassword = String(payload.lms_password ?? "").trim();
    const batchConfigs = Array.isArray(payload.batch_configs)
      ? payload.batch_configs
          .map((entry) => {
            const config = (entry ?? {}) as Record<string, unknown>;
            const batchName = String(config.batch_name ?? "").trim();
            const lectureBatchUrl = String(config.lecture_batch_url ?? "").trim();
            const assignmentBatchUrl = String(
              config.assignment_batch_url || deriveAssignmentBatchUrl(lectureBatchUrl)
            ).trim();

            return {
              batch_name: batchName,
              lecture_batch_url: lectureBatchUrl,
              assignment_batch_url: assignmentBatchUrl
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
        onboarding_complete: true
      },
      {
        onConflict: "user_id"
      }
    );

    if (error) {
      throw new Error(error.message);
    }

    const { error: deleteError } = await supabase
      .from("user_batch_configs")
      .delete()
      .eq("user_id", user.id);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    const { error: configError } = await supabase.from("user_batch_configs").insert(
      batchConfigs.map((config) => ({
        user_id: user.id,
        batch_name: config.batch_name,
        lecture_batch_url: config.lecture_batch_url,
        assignment_batch_url: config.assignment_batch_url
      }))
    );

    if (configError) {
      throw new Error(configError.message);
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
