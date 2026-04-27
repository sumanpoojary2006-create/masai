export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase";

async function isAdmin(userId: string): Promise<boolean> {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .single();
  return data?.role === "admin";
}

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }
    if (!(await isAdmin(user.id))) {
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
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/compliance-check.yml/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28"
        },
        // No target_user_id → compliance check runs for all users + Slack notifications sent
        body: JSON.stringify({ ref: githubRef, inputs: { target_user_id: "" } })
      }
    );

    if (!response.ok) {
      const failure = await response.text();
      return NextResponse.json(
        { message: `Failed to dispatch compliance check: ${failure || response.statusText}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message:
        "Compliance check dispatched for all users. Slack notifications will be sent as statuses resolve (~2 minutes)."
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Compliance dispatch failed." },
      { status: 500 }
    );
  }
}
