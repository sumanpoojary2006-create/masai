export const runtime = "nodejs";
export const maxDuration = 60; // seconds — compliance sync can take 20-30 s

import { NextResponse } from "next/server";
import { DateTime } from "luxon";

import { getCurrentUser } from "@/lib/auth";
import { syncAssignedBatchesCache, syncTaskStatusesFromLms } from "@/lib/automation";
import { getAppTimezone } from "@/lib/env";
import { sendProxySyncNotification, sendSyncUpdateAlert } from "@/lib/slack";
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

    // Parse optional proxy target — if absent this is a normal self-sync
    let targetCcId: string | null = null;
    try {
      const body = (await request.json()) as { target_cc_id?: string };
      targetCcId = body.target_cc_id ?? null;
    } catch {
      // No JSON body — normal self-sync
    }

    const isProxySync = Boolean(targetCcId && targetCcId !== user.id);

    if (isProxySync) {
      // Validate: current user must be the admin-designated cover for targetCcId today
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

    // Fetch CC batch assignments and profile in parallel so we can refresh the
    // cache schedule BEFORE computing deadlines in syncTaskStatusesFromLms.
    // Order matters: if a session was rescheduled, syncAssignedBatchesCache must
    // update lms_lecture_cache.schedule first so the deadline computation below
    // uses the new lecture date and doesn't report stale "pending today" items.
    const supabase = createServerSupabase();
    const [{ data: ccAssignments }, { data: profileRow }] = await Promise.all([
      supabase.from("cc_batch_assignments").select("batch_id").eq("cc_user_id", effectiveUserId),
      supabase.from("user_profiles").select("slack_member_id").eq("user_id", effectiveUserId).single(),
    ]);

    const ccBatchIds = [...new Set((ccAssignments ?? []).map((a) => a.batch_id as number))];

    // Snapshot the pre-sync upload flags so syncTaskStatusesFromLms can detect
    // newly-completed Path B tasks. syncAssignedBatchesCache updates these flags
    // before syncTaskStatusesFromLms runs, which would otherwise make every just-
    // completed admin-batch task appear "already completed" and hide it from the
    // Slack "Newly Completed" section.
    let preSyncCompletedKeys = new Set<string>();
    if (ccBatchIds.length > 0) {
      const { data: preSync } = await supabase
        .from("lms_lecture_cache")
        .select("batch_id, lecture_id, preread_uploaded, notes_uploaded, assignment_uploaded")
        .in("batch_id", ccBatchIds);

      for (const row of preSync ?? []) {
        if (row.preread_uploaded)    preSyncCompletedKeys.add(`${row.batch_id}:${row.lecture_id}:preread`);
        if (row.notes_uploaded)      preSyncCompletedKeys.add(`${row.batch_id}:${row.lecture_id}:notes`);
        if (row.assignment_uploaded) preSyncCompletedKeys.add(`${row.batch_id}:${row.lecture_id}:assignment`);
      }

      await syncAssignedBatchesCache(ccBatchIds);
    }

    // Sync LMS state into both the tasks table (CC-configured lectures) and
    // lms_lecture_cache (admin-batch lectures) so the digest reflects live LMS state.
    // Runs after syncAssignedBatchesCache so schedule dates are current.
    const syncResult = await syncTaskStatusesFromLms(effectiveUserId, { preSyncCompletedKeys });

    const slackMemberId = (profileRow as { slack_member_id?: string | null } | null)?.slack_member_id ?? null;

    if (isProxySync) {
      // Notify the on-leave CC (X) that Y synced on their behalf
      const { data: coveringUserData } = await supabase.auth.admin.getUserById(user.id);
      const coveringName =
        (coveringUserData?.user?.user_metadata?.full_name as string) ||
        coveringUserData?.user?.email ||
        "Your colleague";

      await sendProxySyncNotification({
        targetSlackMemberId: slackMemberId,
        coveringCcName: coveringName,
        checkedLectures: syncResult.checkedLectures,
        updatedTasks: syncResult.updatedTasks,
      }).catch((err) => {
        console.error("[compliance/sync] Proxy Slack notification failed:", err);
      });
    } else {
      // Normal self-sync: send targeted digest to this CC
      await sendSyncUpdateAlert({
        newlyCompleted: syncResult.newlyCompleted,
        pendingToday: syncResult.pendingToday,
        slackMemberId,
      }).catch((err) => {
        console.error("[compliance/sync] Slack notification failed:", err);
      });
    }

    // Dispatch GitHub Actions compliance workflow — non-fatal so sync succeeds
    // even when the token is missing (e.g. local dev or staging environments).
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
