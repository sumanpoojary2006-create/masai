export const runtime = "nodejs";
export const maxDuration = 300; // up to 5 min for multiple lectures

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
      return NextResponse.json({ message: "No profile found.", fetched: 0 });
    }

    let totalFetched = 0;
    for (const profile of profiles) {
      const fetched = await fetchAndAnalyzePendingSummaries(profile);
      totalFetched += fetched;
    }

    return NextResponse.json({
      message:
        totalFetched > 0
          ? `Fetched and analysed ${totalFetched} lecture summary(s).`
          : "No new summaries to fetch. All eligible lectures are up to date.",
      fetched: totalFetched
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Sync failed." },
      { status: 500 }
    );
  }
}
