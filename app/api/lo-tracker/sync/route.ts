export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: "Please log in first." }, { status: 401 });
    }

    const githubToken = process.env.GITHUB_WORKFLOW_TOKEN;
    const githubRepo = process.env.GITHUB_REPO ?? "sumanpoojary2006-create/masai";
    const githubRef = process.env.GITHUB_WORKFLOW_REF ?? "main";

    if (!githubToken) {
      return NextResponse.json(
        {
          message:
            "GITHUB_WORKFLOW_TOKEN is not set. Add it in Vercel environment variables to enable Sync Transcripts.",
          results: []
        },
        { status: 400 }
      );
    }

    const [owner, repo] = githubRepo.split("/");
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/lo-sync.yml/dispatches`,
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

    if (!response.ok) {
      const failure = await response.text();
      return NextResponse.json(
        { message: `Failed to dispatch LO sync workflow: ${failure || response.statusText}`, results: [] },
        { status: 500 }
      );
    }

    return NextResponse.json({
      dispatched: true,
      message:
        "LO sync workflow dispatched to GitHub Actions. It will fetch summaries and run LO analysis. Check back in 2–3 minutes."
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Sync failed.", results: [] },
      { status: 500 }
    );
  }
}
