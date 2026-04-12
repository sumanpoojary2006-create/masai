export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { getCurrentUser, getUserBatchConfigs, getUserProfile } from "@/lib/auth";
import { importLectureSheet } from "@/lib/importer";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        {
          message: "Please log in before importing lectures."
        },
        {
          status: 401
        }
      );
    }

    const [profile, batchConfigs] = await Promise.all([
      getUserProfile(user.id),
      getUserBatchConfigs(user.id)
    ]);

    if (!profile?.onboarding_complete || batchConfigs.length === 0) {
      return NextResponse.json(
        {
          message: "Complete your LMS setup before importing lectures."
        },
        {
          status: 400
        }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          message: "Attach a CSV or Excel file as `file`."
        },
        {
          status: 400
        }
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const result = await importLectureSheet(fileBuffer, {
      userId: user.id,
      allowedBatchNames: batchConfigs.map((config) => config.batch_name)
    });

    return NextResponse.json({
      message: `Imported ${result.lectureCount} lectures and created or refreshed ${result.taskCount} tasks.`
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Lecture import failed."
      },
      {
        status: 500
      }
    );
  }
}
