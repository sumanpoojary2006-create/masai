export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { importLectureSheet } from "@/lib/importer";

export async function POST(request: Request) {
  try {
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
    const result = await importLectureSheet(fileBuffer);

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

