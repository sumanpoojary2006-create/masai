export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { DateTime } from "luxon";

import { runComplianceCheck } from "@/lib/automation";
import { getAppTimezone } from "@/lib/env";
import { getDashboardData } from "@/lib/queries";
import { sendManualPendingDigest } from "@/lib/slack";
import { TASK_TYPES } from "@/lib/constants";

export async function POST() {
  try {
    const timezone = getAppTimezone();
    const today = DateTime.now().setZone(timezone).toISODate();
    const lectures = await getDashboardData();
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
              batch_name: lecture.batch_name,
              module_name: lecture.module_name,
              lecture_name: lecture.lecture_name,
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

    const pendingDigestSent = await sendManualPendingDigest(pendingItems);

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

    const result = await runComplianceCheck();

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
