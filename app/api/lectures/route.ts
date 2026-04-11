export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/queries";
import { TaskStatus } from "@/lib/types";

export async function GET(request: NextRequest) {
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

    const batch = request.nextUrl.searchParams.get("batch") ?? undefined;
    const status = (request.nextUrl.searchParams.get("status") as TaskStatus | "all" | null) ?? "all";

    const lectures = await getDashboardData({
      userId: user.id,
      batch,
      status
    });

    return NextResponse.json({
      lectures
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Unable to fetch lectures."
      },
      {
        status: 500
      }
    );
  }
}
