export const runtime = "nodejs";
export const maxDuration = 60; // seconds — compliance sync can take 20-30 s

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { syncAssignedBatchesCache, syncTaskStatusesFromLms } from "@/lib/automation";
import { sendSyncUpdateAlert } from "@/lib/slack";
import { createServerSupabase } from "@/lib/supabase";

export async function POST() {
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

    // Fetch CC batch assignments and profile in parallel so we can refresh the
    // cache schedule BEFORE computing deadlines in syncTaskStatusesFromLms.
    // Order matters: if a session was rescheduled, syncAssignedBatchesCache must
    // update lms_lecture_cache.schedule first so the deadline computation below
    // uses the new lecture date and doesn't report stale "pending today" items.
    const supabase = createServerSupabase();
    const [{ data: ccAssignments }, { data: profileRow }] = await Promise.all([
      supabase.from("cc_batch_assignments").select("batch_id").eq("cc_user_id", user.id),
      supabase.from("user_profiles").select("slack_member_id").eq("user_id", user.id).single(),
    ]);

    const ccBatchIds = [...new Set((ccAssignments ?? []).map((a) => a.batch_id as number))];
    if (ccBatchIds.length > 0) {
      await syncAssignedBatchesCache(ccBatchIds);
    }

    // Sync LMS state into both the tasks table (CC-configured lectures) and
    // lms_lecture_cache (admin-batch lectures) so the digest reflects live LMS state.
    // Runs after syncAssignedBatchesCache so schedule dates are current.
    const syncResult = await syncTaskStatusesFromLms(user.id);

    // Send targeted Slack notification only to this CC — newly completed + pending today.
    const slackMemberId = (profileRow as { slack_member_id?: string | null } | null)?.slack_member_id ?? null;
    await sendSyncUpdateAlert({
      newlyCompleted: syncResult.newlyCompleted,
      pendingToday: syncResult.pendingToday,
      slackMemberId,
    }).catch((err) => {
      console.error("[compliance/sync] Slack notification failed:", err);
    });

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
                "X-GitHub-Api-Version": "2022-11-28"
              },
              body: JSON.stringify({ ref: githubRef })
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
        updatedTasks: syncResult.updatedTasks
      },
      message: "Dashboard updated with latest LMS state."
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
