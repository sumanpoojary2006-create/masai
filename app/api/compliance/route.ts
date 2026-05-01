export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { DateTime } from "luxon";

import { getCurrentUser, getUserProfile } from "@/lib/auth";
import { runComplianceCheck, syncAssignedBatchesCache, syncTaskStatusesFromLms } from "@/lib/automation";
import { getAppTimezone } from "@/lib/env";
import { getCCLectures } from "@/lib/queries";
import { sendManualPendingDigest } from "@/lib/slack";
import { createServerSupabase } from "@/lib/supabase";
import { TASK_TYPES } from "@/lib/constants";

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

    const timezone = getAppTimezone();
    const today = DateTime.now().setZone(timezone).toISODate();

    // Sync LMS state into both the tasks table (CC-configured lectures) and
    // lms_lecture_cache (admin-batch lectures) so the digest reflects live LMS state.
    await syncTaskStatusesFromLms(user.id);

    // Also sync lms_lecture_cache for admin-batch assignments so dashboard status
    // reflects reality without waiting for the nightly admin sync.
    const supabase = createServerSupabase();
    const { data: ccAssignments } = await supabase
      .from("cc_batch_assignments")
      .select("batch_id")
      .eq("cc_user_id", user.id);
    const ccBatchIds = [...new Set((ccAssignments ?? []).map((a) => a.batch_id as number))];
    if (ccBatchIds.length > 0) {
      await syncAssignedBatchesCache(ccBatchIds);
    }

    // getCCLectures reads from lms_lecture_cache (covers both CC-configured and
    // admin-batch lectures), so the pending digest includes all admin-batch tasks.
    const [lectures, userProfile] = await Promise.all([
      getCCLectures(user.id),
      getUserProfile(user.id)
    ]);
    const pendingItems = lectures.flatMap((lecture) =>
      TASK_TYPES.flatMap((taskType) => {
        const task = lecture.tasks[taskType];

        if (!task || task.status !== "pending") {
          return [];
        }

        const deadlineDate = DateTime.fromISO(task.deadline, { zone: timezone }).toISODate();

        if (today && deadlineDate !== today) {
          return [];
        }

        return [
          {
            lecture: {
              id: lecture.id,
              user_id: lecture.user_id,
              batch_name: lecture.batch_name,
              module_name: lecture.module_name,
              lecture_name: lecture.lecture_name,
              learning_objective: lecture.learning_objective ?? "",
              session_link: lecture.session_link ?? "",
              lecture_date: lecture.lecture_date,
              start_time: lecture.start_time,
              end_time: lecture.end_time
            },
            taskType,
            deadline: task.deadline
          }
        ];
      })
    );

    const pendingDigestSent = await sendManualPendingDigest(pendingItems, {
      mentionUserId: userProfile?.slack_member_id
    });

    const githubToken = process.env.GITHUB_WORKFLOW_TOKEN;
    const githubRepo = process.env.GITHUB_REPO ?? "sumanpoojary2006-create/masai";
    const githubWorkflowId = process.env.GITHUB_WORKFLOW_ID ?? "compliance-check.yml";
    const githubRef = process.env.GITHUB_WORKFLOW_REF ?? "main";

    if (githubToken) {
      const [owner, repo] = githubRepo.split("/");

      if (!owner || !repo) {
        return NextResponse.json(
          {
            message: "Invalid GitHub repository configuration for compliance dispatch."
          },
          {
            status: 500
          }
        );
      }

      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${githubWorkflowId}/dispatches`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${githubToken}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2022-11-28"
          },
          body: JSON.stringify({
            ref: githubRef
          })
        }
      );

      if (!response.ok) {
        const failure = await response.text();

        return NextResponse.json(
          {
            message: `Unable to dispatch GitHub compliance workflow. ${failure || response.statusText}`
          },
          {
            status: 500
          }
        );
      }

      return NextResponse.json({
        message:
          pendingDigestSent > 0
            ? "Manual pending reminder sent to Slack. Compliance workflow dispatched to GitHub Actions and status updates will follow when that run completes."
            : "Compliance workflow dispatched to GitHub Actions. No pending manual reminder was needed, and status updates will follow when that run completes.",
        mode: "github_dispatch"
      });
    }

    const result = await runComplianceCheck({
      userId: user.id
    });

    return NextResponse.json({
      message:
        pendingDigestSent > 0
          ? "Manual pending reminder sent to Slack. Compliance workflow completed."
          : "Compliance workflow completed.",
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
