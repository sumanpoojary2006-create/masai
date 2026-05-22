export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { DateTime } from "luxon";

import { getCurrentUser } from "@/lib/auth";
import { syncAssignedBatchesCache, syncTaskStatusesFromLms } from "@/lib/automation";
import { getAppTimezone } from "@/lib/env";
import { sendProxySyncNotification } from "@/lib/slack";
import { createServerSupabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { message: "Please log in first." },
        { status: 401 }
      );
    }

    // Parse optional proxy target
    let targetCcId: string | null = null;
    try {
      const body = (await request.json()) as { target_cc_id?: string };
      targetCcId = body.target_cc_id ?? null;
    } catch {
      // No body — normal self-sync
    }

    const isProxySync = Boolean(targetCcId && targetCcId !== user.id);

    if (isProxySync) {
      // Validate: current user must be the designated cover for targetCcId today
      const supabase = createServerSupabase();
      const today = DateTime.now().setZone(getAppTimezone()).toISODate()!;

      const { data: coverage } = await supabase
        .from("cc_leave_coverage")
        .select("id")
        .eq("on_leave_cc_id", targetCcId)
        .eq("covering_cc_id", user.id)
        .eq("coverage_date", today)
        .maybeSingle();

      if (!coverage) {
        return NextResponse.json(
          { message: "Not authorized to sync on behalf of this CC today." },
          { status: 403 }
        );
      }
    }

    const effectiveUserId = isProxySync ? targetCcId! : user.id;

    // Sync task statuses for the effective user
    const syncResult = await syncTaskStatusesFromLms(effectiveUserId);

    // Sync lms_lecture_cache for the effective user's batch assignments
    const supabase = createServerSupabase();
    const { data: ccAssignments } = await supabase
      .from("cc_batch_assignments")
      .select("batch_id")
      .eq("cc_user_id", effectiveUserId);
    const ccBatchIds = [...new Set((ccAssignments ?? []).map((a) => a.batch_id as number))];
    if (ccBatchIds.length > 0) {
      await syncAssignedBatchesCache(ccBatchIds);
    }

    // Dispatch GitHub Actions compliance workflow — non-fatal
    const githubToken = process.env.GITHUB_WORKFLOW_TOKEN;
    if (githubToken) {
      const githubRepo = process.env.GITHUB_REPO ?? "sumanpoojary2006-create/masai";
      const githubWorkflowId = process.env.GITHUB_WORKFLOW_ID ?? "compliance-check.yml";
      const githubRef = process.env.GITHUB_WORKFLOW_REF ?? "main";
      const [owner, repo] = githubRepo.split("/");

      if (owner && repo) {
        try {
          const ghResponse = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${githubWorkflowId}/dispatches`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${githubToken}`,
                Accept: "application/vnd.github+json",
                "Content-Type": "application/json",
                "X-GitHub-Api-Version": "2022-11-28",
              },
              body: JSON.stringify({ ref: githubRef }),
            }
          );

          if (!ghResponse.ok) {
            console.error("[compliance/sync] GitHub dispatch failed:", await ghResponse.text());
          }
        } catch (ghError) {
          console.error("[compliance/sync] GitHub dispatch error:", ghError);
        }
      }
    }

    // Send Slack notification to the on-leave CC (X) when synced by proxy
    if (isProxySync) {
      const { data: targetProfile } = await supabase
        .from("user_profiles")
        .select("slack_member_id")
        .eq("user_id", effectiveUserId)
        .maybeSingle();

      // Get covering CC's display name for the notification message
      const { data: coveringUserData } = await supabase.auth.admin.getUserById(user.id);
      const coveringName =
        (coveringUserData?.user?.user_metadata?.full_name as string) ||
        coveringUserData?.user?.email ||
        "Your colleague";

      await sendProxySyncNotification({
        targetSlackMemberId: (targetProfile as { slack_member_id?: string | null } | null)?.slack_member_id ?? null,
        coveringCcName: coveringName,
        checkedLectures: syncResult.checkedLectures,
        updatedTasks: syncResult.updatedTasks,
      });
    }

    return NextResponse.json({
      result: {
        checkedLectures: syncResult.checkedLectures,
        trackedResources: 0,
        updatedTasks: syncResult.updatedTasks,
      },
      message: isProxySync
        ? "Dashboard synced on behalf of the on-leave CC. They have been notified."
        : "Dashboard updated with latest LMS state.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Compliance workflow failed.",
      },
      { status: 500 }
    );
  }
}
