export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { hasAdminAccess } from "@/lib/admin-access";
import { getCurrentUser } from "@/lib/auth";
import { getDomainResourcesReportData } from "@/lib/domain-resource-report";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }

    if (!(await hasAdminAccess(user.id))) {
      return NextResponse.json({ message: "Admin access required." }, { status: 403 });
    }

    return NextResponse.json(await getDomainResourcesReportData());
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Failed to load domain resources report."
      },
      { status: 500 }
    );
  }
}
