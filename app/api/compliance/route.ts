export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { runComplianceCheck } from "@/lib/automation";

export async function POST() {
  try {
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
          "Compliance workflow dispatched to GitHub Actions. Reminders and status updates will follow when that run completes.",
        mode: "github_dispatch"
      });
    }

    const result = await runComplianceCheck();

    return NextResponse.json({
      message: "Compliance workflow completed.",
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
