export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { hasAdminAccess } from "@/lib/admin-access";
import { getCurrentUser } from "@/lib/auth";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }
    if (!(await hasAdminAccess(user.id))) {
      return NextResponse.json({ message: "Admin access required." }, { status: 403 });
    }

    const githubToken = process.env.WORKFLOW_DISPATCH_TOKEN;
    const githubRepo = process.env.GITHUB_REPO ?? "sumanpoojary2006-create/masai";
    const githubRef = process.env.GITHUB_WORKFLOW_REF ?? "main";

    if (!githubToken) {
      return NextResponse.json(
        { message: "WORKFLOW_DISPATCH_TOKEN is not set." },
        { status: 400 }
      );
    }

    const [owner, repo] = githubRepo.split("/");
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/sync-lectures.yml/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28"
        },
        // No target_user_id → syncs all users
        body: JSON.stringify({ ref: githubRef })
      }
    );

    if (!response.ok) {
      const failure = await response.text();
      return NextResponse.json(
        { message: `Failed to dispatch sync: ${failure || response.statusText}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "This week's lecture sync started for all users. Sessions will update in ~2 minutes."
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Sync failed." },
      { status: 500 }
    );
  }
}
