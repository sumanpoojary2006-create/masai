export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { runComplianceCheck } from "@/lib/automation";

export async function POST() {
  try {
    const result = await runComplianceCheck();

    return NextResponse.json({
      message: "Compliance workflow completed.",
      result
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Compliance workflow failed."
      },
      {
        status: 500
      }
    );
  }
}

