export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { getCurrentUser, getUserProfile } from "@/lib/auth";
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

    const profile = await getUserProfile(user.id);

    if (!profile?.onboarding_complete) {
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
      expectedBatchName: profile.batch_name
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
