export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse } from "next/server";

import { getCurrentUser, getUserProfile } from "@/lib/auth";
import { analyzePendingLoReports, fetchAndAnalyzePendingSummaries } from "@/lib/automation";
import { sendLoSyncSlackNotification } from "@/lib/slack";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: "Please log in first." }, { status: 401 });
    }

    const profile = await getUserProfile(user.id);
    if (!profile) {
      return NextResponse.json(
        { message: "Profile not found for this account.", results: [] },
        { status: 400 }
      );
    }

    const fetchResults = await fetchAndAnalyzePendingSummaries({
      user_id: user.id,
      email: profile.email
    });
    const analyzeResults = await analyzePendingLoReports(user.id);
    const results = [...fetchResults, ...analyzeResults];

    sendLoSyncSlackNotification({
      analyzeResults: [
        ...analyzeResults,
        ...fetchResults
          .filter((result) => result.status === "fetched" && result.coveredCount !== undefined)
          .map((result) => ({
            lectureId: result.lectureId,
            lectureName: result.lectureName,
            status: "analyzed" as const,
            coveredCount: result.coveredCount,
            missingCount: result.missingCount,
            reason: result.reason
          }))
      ],
      slackMemberId: profile.slack_member_id ?? null
    }).catch((err) => console.error("[lo-sync-inline] Slack notification failed:", err));

    const fetched = fetchResults.filter((result) => result.status === "fetched").length;
    const analyzed = analyzeResults.filter((result) => result.status === "analyzed").length;

    return NextResponse.json({
      message: `Sync complete. ${fetched} transcript(s) fetched, ${analyzed} pending report(s) analyzed.`,
      results
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Sync failed.", results: [] },
      { status: 500 }
    );
  }
}
