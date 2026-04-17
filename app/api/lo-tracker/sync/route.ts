export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { fetchAndAnalyzePendingSummaries } from "@/lib/automation";
import { getAutomationProfiles } from "@/lib/queries";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: "Please log in first." }, { status: 401 });
    }

    const profiles = await getAutomationProfiles(user.id);
    if (profiles.length === 0) {
      return NextResponse.json({ message: "No profile found.", results: [] });
    }

    const allResults = [];
    for (const profile of profiles) {
      const results = await fetchAndAnalyzePendingSummaries(profile);
      allResults.push(...results);
    }

    const fetched = allResults.filter((r) => r.status === "fetched");
    const errors  = allResults.filter((r) => r.status === "error");
    const skipped = allResults.filter((r) => r.status === "skipped");

    return NextResponse.json({ results: allResults, fetched: fetched.length, errors: errors.length, skipped: skipped.length });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Sync failed.", results: [] },
      { status: 500 }
    );
  }
}
