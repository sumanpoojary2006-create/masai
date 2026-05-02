export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { DateTime } from "luxon";

import { hasAdminAccess } from "@/lib/admin-access";
import { getCurrentUser } from "@/lib/auth";
import { computeDeadline } from "@/lib/deadlines";
import { getAppTimezone } from "@/lib/env";
import { sendManualPendingDigest } from "@/lib/slack";
import { createServerSupabase } from "@/lib/supabase";
import { LectureRecord, TaskType } from "@/lib/types";

type PendingDigestItemWithCC = {
  lecture: Pick<LectureRecord, "lecture_name" | "lecture_date" | "batch_name">;
  taskType: TaskType;
  deadline: string;
  cc_user_id: string;
};

/**
 * Build pending digest items from lms_lecture_cache, tagged with the CC user
 * responsible for each batch so the caller can mention them in Slack.
 * Only includes resources whose deadline falls today and is still not uploaded.
 */
async function getPendingItemsFromCache(): Promise<PendingDigestItemWithCC[]> {
  const supabase = createServerSupabase();
  const timezone = getAppTimezone();
  const now = DateTime.now().setZone(timezone);

  // Batch id → { batch_name, cc_user_id }
  const { data: assignments, error: aErr } = await supabase
    .from("cc_batch_assignments")
    .select("batch_id, batch_name, cc_user_id");
  if (aErr) throw new Error(aErr.message);

  const batchInfoById = new Map<number, { batchName: string; ccUserId: string }>(
    (assignments ?? []).map((a) => [
      a.batch_id as number,
      { batchName: a.batch_name as string, ccUserId: a.cc_user_id as string }
    ])
  );

  // Scope to current week — same ±8-day window as getCacheLecturesForProfile — to
  // avoid scanning thousands of historical rows with pending flags never flipped.
  const weekStart = `${now.startOf("week").toISODate()!}T00:00:00+00:00`;
  const weekEnd = `${now.startOf("week").plus({ days: 8 }).toISODate()!}T00:00:00+00:00`;

  // Cache rows that have at least one resource still pending
  const { data: cacheRows, error: cErr } = await supabase
    .from("lms_lecture_cache")
    .select("batch_id, lecture_id, title, schedule, preread_uploaded, notes_uploaded, assignment_uploaded")
    .or("preread_uploaded.eq.false,notes_uploaded.eq.false,assignment_uploaded.eq.false")
    .gte("schedule", weekStart)
    .lte("schedule", weekEnd);

  if (cErr) throw new Error(cErr.message);

  const pendingItems: PendingDigestItemWithCC[] = [];

  for (const row of cacheRows ?? []) {
    if (!row.schedule) continue;

    const schedDt = DateTime.fromISO(row.schedule as string, { zone: timezone });
    if (!schedDt.isValid) continue;

    const lectureDate = schedDt.toISODate()!;
    const startTime = schedDt.toFormat("HH:mm:ss");
    const batchInfo = batchInfoById.get(row.batch_id as number);
    if (!batchInfo) continue;

    const lectureInfo = {
      lecture_name: row.title as string,
      lecture_date: lectureDate,
      batch_name: batchInfo.batchName
    };

    const types: Array<{ type: TaskType; uploaded: boolean }> = [
      { type: "preread", uploaded: Boolean(row.preread_uploaded) },
      { type: "notes", uploaded: Boolean(row.notes_uploaded) },
      { type: "assignment", uploaded: Boolean(row.assignment_uploaded) }
    ];

    for (const { type, uploaded } of types) {
      if (uploaded) continue;
      const deadline = computeDeadline(type, lectureDate, startTime, startTime);
      const deadlineDt = DateTime.fromISO(deadline, { zone: timezone });
      if (deadlineDt.isValid && deadlineDt.hasSame(now, "day")) {
        pendingItems.push({ lecture: lectureInfo, taskType: type, deadline, cc_user_id: batchInfo.ccUserId });
      }
    }
  }

  return pendingItems;
}

function dispatchGitHubActions(token: string, repo: string, ref: string) {
  const [owner, repoName] = repo.split("/");
  return fetch(
    `https://api.github.com/repos/${owner}/${repoName}/actions/workflows/compliance-check.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: JSON.stringify({ ref, inputs: { target_user_id: "" } })
    }
  );
}

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
    }
    if (!(await hasAdminAccess(user.id))) {
      return NextResponse.json({ message: "Admin access required." }, { status: 403 });
    }

    const supabase = createServerSupabase();

    // Step 1: Build pending digest from the existing cache (scoped to current week).
    // Cache is kept fresh by the weekly auto-sync and the "Sync All Lectures" button —
    // re-syncing here caused sequential MySQL queries for every assigned batch and
    // routinely timed out the Vercel function before any response was sent.
    const pendingItems = await getPendingItemsFromCache();
    console.log(`[sync-up] Pending items with passed deadlines: ${pendingItems.length}`);

    // Step 2: Send per-CC Slack notifications so each CC is @mentioned with their own items
    let slackSent = false;
    if (pendingItems.length > 0) {
      const itemsByCC = new Map<string, PendingDigestItemWithCC[]>();
      for (const item of pendingItems) {
        const list = itemsByCC.get(item.cc_user_id) ?? [];
        list.push(item);
        itemsByCC.set(item.cc_user_id, list);
      }

      const { data: ccProfiles } = await supabase
        .from("user_profiles")
        .select("user_id, slack_member_id")
        .in("user_id", [...itemsByCC.keys()]);
      const slackIdByUser = new Map<string, string | null>(
        (ccProfiles ?? []).map((p) => [p.user_id as string, p.slack_member_id as string | null])
      );

      for (const [ccUserId, items] of itemsByCC) {
        const mentionUserId = slackIdByUser.get(ccUserId) ?? null;
        try {
          await sendManualPendingDigest(
            items as unknown as Parameters<typeof sendManualPendingDigest>[0],
            { mentionUserId }
          );
          slackSent = true;
          console.log(`[sync-up] Slack sent for CC ${ccUserId} (mention: ${mentionUserId ?? "none"}) — ${items.length} item(s)`);
        } catch (slackErr) {
          console.error(`[sync-up] Slack send failed for CC ${ccUserId}:`, slackErr);
        }
      }
    }

    // Step 3: Dispatch GitHub Actions for the deeper compliance check (tasks table)
    const githubToken = process.env.GITHUB_WORKFLOW_TOKEN;
    const githubRepo = process.env.GITHUB_REPO ?? "sumanpoojary2006-create/masai";
    const githubRef = process.env.GITHUB_WORKFLOW_REF ?? "main";

    if (githubToken) {
      const ghRes = await dispatchGitHubActions(githubToken, githubRepo, githubRef);
      if (!ghRes.ok) {
        const body = await ghRes.text();
        console.error(`[sync-up] GitHub Actions dispatch failed: ${body}`);
      } else {
        console.log("[sync-up] GitHub Actions compliance check dispatched");
      }
    }

    return NextResponse.json({
      message: slackSent
        ? `Compliance check complete. Slack notification sent for ${pendingItems.length} pending item(s).`
        : "Compliance check complete. No overdue pending items — all resources are on track!",
      pendingCount: pendingItems.length,
      slackSent
    });
  } catch (error) {
    console.error("[sync-up] Error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Sync Up failed." },
      { status: 500 }
    );
  }
}
