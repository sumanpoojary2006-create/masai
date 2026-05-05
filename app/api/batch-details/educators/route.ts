export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

import { hasAdminAccess } from "@/lib/admin-access";
import { getCurrentUser } from "@/lib/auth";
import {
  getEducatorFilterOptions,
  listEducators,
  type EducatorFilters,
} from "@/lib/educators";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }
    if (!(await hasAdminAccess(user.id))) {
      return NextResponse.json({ message: "Admin access required." }, { status: 403 });
    }

    const { searchParams } = request.nextUrl;

    if (searchParams.get("filterOptions") === "1") {
      const options = await getEducatorFilterOptions();
      return NextResponse.json(options);
    }

    const filters: EducatorFilters = {
      search: searchParams.get("search") ?? undefined,
      tier: searchParams.get("tier") ?? undefined,
      instructorType: searchParams.get("instructorType") ?? undefined,
      primaryDomain: searchParams.get("primaryDomain") ?? undefined,
      mouStatus: searchParams.get("mouStatus") ?? undefined,
      availableDay: (searchParams.get("availableDay") as EducatorFilters["availableDay"]) ?? undefined,
      page: searchParams.get("page") ? Number(searchParams.get("page")) : 1,
      pageSize: searchParams.get("pageSize") ? Number(searchParams.get("pageSize")) : 50,
    };

    const blacklistedParam = searchParams.get("blacklisted");
    if (blacklistedParam === "true") filters.blacklisted = true;
    if (blacklistedParam === "false") filters.blacklisted = false;

    const result = await listEducators(filters);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load educators." },
      { status: 500 }
    );
  }
}
