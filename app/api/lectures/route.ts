export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

import { getDashboardData } from "@/lib/queries";
import { TaskStatus } from "@/lib/types";

export async function GET(request: NextRequest) {
  try {
    const batch = request.nextUrl.searchParams.get("batch") ?? undefined;
    const status = (request.nextUrl.searchParams.get("status") as TaskStatus | "all" | null) ?? "all";

    const lectures = await getDashboardData({
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

