export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { DateTime } from "luxon";

import { hasAdminAccess } from "@/lib/admin-access";
import { getCurrentUser } from "@/lib/auth";
import { computeDeadline } from "@/lib/deadlines";
import { getAppTimezone } from "@/lib/env";
import { syncAssignedBatchesCache } from "@/lib/automation";
import { sendManualPendingDigest } from "@/lib/slack";
import { createServerSupabase } from "@/lib/supabase";
import { LectureRecord, TaskType } from "@/lib/types";

/**
 * Build pending digest items from lms_lecture_cache.
 * Only includes resources whose deadline has already passed and the resource
 * is still not uploaded — i.e. the CC has missed or is late on the deadline.
 */
async function getPendingItemsFromCache() {
  const supabase = createServerSupabase();
  const timezone = getAppTimezone();
  const now = DateTime.now().setZone(timezone);

  // Batch id → name map
  const { data: assignments, error: aErr } = await supabase
    .from("cc_batch_assignments")
    .select("batch_id, batch_name");
  if (aErr) throw new Error(aErr.message);

  const batchNameById = new Map<number, string>(
    (assignments ?? []).map((a) => [a.batch_id as number, a.batch_name as string])
  );

  // Cache rows that have at least one resource still pending
  const { data: cacheRows, error: cErr } = await supabase
    .from("lms_lecture_cache")
    .select("batch_id, lecture_id, title, schedule, preread_uploaded, notes_uploaded, assignment_uploaded")
    .or("preread_uploaded.eq.false,notes_uploaded.eq.false,assignment_uploaded.eq.false");

  if (cErr) throw new Error(cErr.message);

  const pendingItems: Array<{ lecture: Pick<LectureRecord, "lecture_name" | "lecture_date" | "batch_name">; taskType: TaskType; deadline: string }> = [];

  for (const row of cacheRows ?? []) {
    if (!row.schedule) continue;

    const schedDt = DateTime.fromISO(row.schedule as string, { zone: timezone });
    if (!schedDt.isValid) continue;

    const lectureDate = schedDt.toISODate()!;
    const startTime = schedDt.toFormat("HH:mm:ss");
    const batchName = batchNameById.get(row.batch_id as number) ?? `Batch ${row.batch_id}`;

    const lectureInfo = {
      lecture_name: row.title as string,
      lecture_date: lectureDate,
      batch_name: batchName
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
      // Only include if deadline is today (not old missed items — those would flood Slack)
      if (deadlineDt.isValid && deadlineDt.hasSame(now, "day")) {
        pendingItems.push({ lecture: lectureInfo, taskType: type, deadline });
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

    // Step 1: Re-sync lms_lecture_cache from live LMS data
    const supabase = createServerSupabase();
    const { data: assignments, error: assignError } = await supabase
      .from("cc_batch_assignments")
      .select("batch_id")
      .order("batch_id", { ascending: true });
    if (assignError) throw new Error(assignError.message);
    const batchIds = [...new Set((assignments ?? []).map((a) => a.batch_id as number))];
    const syncResult = await syncAssignedBatchesCache(batchIds);
    console.log(`[sync-up] Cache synced: ${syncResult.batchesSynced} batches, ${syncResult.lecturesSynced} lectures`);

    // Step 2: Build pending digest from the freshly-synced cache
    const pendingItems = await getPendingItemsFromCache();
    console.log(`[sync-up] Pending items with passed deadlines: ${pendingItems.length}`);

    // Step 3: Send Slack notification for pending items
    let slackSent = false;
    if (pendingItems.length > 0) {
      try {
        await sendManualPendingDigest(
          // Cast: Slack functions only read lecture_name, lecture_date, batch_name
          pendingItems as Parameters<typeof sendManualPendingDigest>[0],
          { mentionUserId: null }
        );
        slackSent = true;
        console.log(`[sync-up] Slack notification sent with ${pendingItems.length} pending item(s)`);
      } catch (slackErr) {
        console.error("[sync-up] Slack send failed:", slackErr);
      }
    }

    // Step 4: Dispatch GitHub Actions for the deeper compliance check (tasks table)
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
        ? `Synced ${syncResult.lecturesSynced} lectures across ${syncResult.batchesSynced} batches. Slack notification sent for ${pendingItems.length} pending item(s).`
        : `Synced ${syncResult.lecturesSynced} lectures across ${syncResult.batchesSynced} batches. No overdue pending items — all resources are on track!`,
      ...syncResult,
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
