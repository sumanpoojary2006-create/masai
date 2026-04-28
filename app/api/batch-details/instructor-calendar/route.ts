export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { hasAdminAccess } from "@/lib/admin-access";
import { getCurrentUser } from "@/lib/auth";
import { getInstructorCalendarData } from "@/lib/instructor-calendar";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }

    if (!(await hasAdminAccess(user.id))) {
      return NextResponse.json({ message: "Admin access required." }, { status: 403 });
    }

    const data = await getInstructorCalendarData();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Failed to load instructor calendar data."
      },
      { status: 500 }
    );
  }
}
