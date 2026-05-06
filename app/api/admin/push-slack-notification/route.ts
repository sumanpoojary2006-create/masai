export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { DateTime } from "luxon";

import { hasAdminAccess } from "@/lib/admin-access";
import { getCurrentUser } from "@/lib/auth";
import { computeDeadline } from "@/lib/deadlines";
import { getAppTimezone } from "@/lib/env";
import { checkLmsTasksForLecture } from "@/lib/lms-db";
import { createServerSupabase } from "@/lib/supabase";

const TASK_LABELS: Record<string, string> = {
  preread: "Pre-read",
  notes: "Notes",
  assignment: "Assignment"
};

type ResourceItem = { batch: string; lecture: string; type: string };
type CoordinatorBucket = {
  slackMemberId: string | null;
  email: string;
  completed: ResourceItem[];
  pending: ResourceItem[];
};

function renderBatchGroup(items: ResourceItem[], bullet: string): string[] {
  const byBatch = items.reduce((map, item) => {
    const list = map.get(item.batch) ?? [];
    list.push(item);
    map.set(item.batch, list);
    return map;
  }, new Map<string, ResourceItem[]>());

  const lines: string[] = [];
  for (const [batch, batchItems] of byBatch) {
    lines.push(`*${batch}*`);
    for (const item of batchItems) {
      lines.push(`${bullet} ${item.lecture} | ${TASK_LABELS[item.type] ?? item.type}`);
    }
    lines.push("");
  }
  return lines;
}

function buildMessage(dateLabel: string, bucket: CoordinatorBucket): string | null {
  if (bucket.completed.length === 0 && bucket.pending.length === 0) return null;

  const mention = bucket.slackMemberId ? `<@${bucket.slackMemberId}>` : `*${bucket.email}*`;
  const lines: string[] = [
    mention,
    "📋 *Masai Resource Status — Admin Push*",
    `🗓️ ${dateLabel}`,
    ""
  ];

  if (bucket.completed.length > 0) {
    lines.push("✅ *Completed*");
    lines.push(...renderBatchGroup(bucket.completed, "• ✅"));
  }
  if (bucket.pending.length > 0) {
    lines.push("⏳ *Pending*");
    lines.push(...renderBatchGroup(bucket.pending, "• ⏳"));
  }

  return lines.join("\n").trim();
}

async function postToSlack(webhookUrl: string, text: string) {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Slack webhook failed: ${res.status} — ${body}`);
  }
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

    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
      return NextResponse.json({ message: "SLACK_WEBHOOK_URL is not configured." }, { status: 500 });
    }

    const supabase = createServerSupabase();
    const timezone = getAppTimezone();
    const now = DateTime.now().setZone(timezone);
    const todayDate = now.toISODate()!;
    const dateLabel = now.toFormat("dd LLL yyyy, cccc");

    // ── Step 1: Load all CC assignments ────────────────────────────────────────
    const { data: assignments, error: assignError } = await supabase
      .from("cc_batch_assignments")
      .select("cc_user_id, batch_id, batch_name");

    if (assignError) return NextResponse.json({ message: assignError.message }, { status: 500 });
    if (!assignments || assignments.length === 0) {
      return NextResponse.json({ message: "No CC batch assignments configured." });
    }

    // batch_id → batch_name (for dedup keying)
    const batchNameById = new Map<number, string>(
      assignments.map((a) => [a.batch_id as number, a.batch_name as string])
    );

    // batch_name → [cc_user_id] (multiple CCs can share a batch)
    const ccsByBatchName = new Map<string, string[]>();
    for (const a of assignments) {
      const name = a.batch_name as string;
      const list = ccsByBatchName.get(name) ?? [];
      if (!list.includes(a.cc_user_id as string)) list.push(a.cc_user_id as string);
      ccsByBatchName.set(name, list);
    }

    // ── Step 2: Load CC profiles ───────────────────────────────────────────────
    const ccUserIds = [...new Set(assignments.map((a) => a.cc_user_id as string))];
    const { data: profiles, error: profileError } = await supabase
      .from("user_profiles")
      .select("user_id, email, slack_member_id")
      .in("user_id", ccUserIds);

    if (profileError) return NextResponse.json({ message: profileError.message }, { status: 500 });

    const profileMap = new Map(
      (profiles ?? []).map((p) => [
        p.user_id as string,
        { email: p.email as string, slackMemberId: p.slack_member_id as string | null }
      ])
    );

    // ── Step 3: Fetch cache rows in ±2-day window ──────────────────────────────
    // Widen range to catch all deadline types that fall today:
    //   • pre-read deadline = day before lecture  → tomorrow's lecture
    //   • notes/assignment deadline = day after   → yesterday's lecture
    const rangeStart = `${now.minus({ days: 2 }).toISODate()!}T00:00:00+00:00`;
    const rangeEnd   = `${now.plus({ days: 2 }).toISODate()!}T00:00:00+00:00`;
    const batchIds = [...new Set(assignments.map((a) => a.batch_id as number))];

    const { data: cacheRows, error: cacheError } = await supabase
      .from("lms_lecture_cache")
      .select("batch_id, lecture_id, title, schedule, concludes, preread_uploaded, notes_uploaded, assignment_uploaded")
      .in("batch_id", batchIds)
      .neq("module", "general")
      .or("title.ilike.Faculty Session%,title.ilike.IM Session%,title.ilike.Academic Session%")
      .gte("schedule", rangeStart)
      .lt("schedule", rangeEnd);

    if (cacheError) return NextResponse.json({ message: cacheError.message }, { status: 500 });
    if (!cacheRows || cacheRows.length === 0) {
      return NextResponse.json({ message: "No lectures found in the current window." });
    }

    // ── Step 4: Deduplicate by (batch_name, title, schedule) ──────────────────
    // A parent batch (e.g. IITR-PM-2512) can have many section sub-batches
    // (sections 01, 02, 03…) each with their own batch_id in lms_lecture_cache.
    // Iterating by batch_id produces one entry per section → duplicates.
    // We key by (batch_name, title, schedule) and collect ALL section batch_ids
    // so the live LMS check can probe each one.
    type CacheRow = NonNullable<typeof cacheRows>[number];
    type DedupEntry = {
      row: CacheRow;
      batchName: string;
      sectionBatchIds: number[];
    };

    const dedupMap = new Map<string, DedupEntry>();

    for (const row of cacheRows) {
      const batchName = batchNameById.get(row.batch_id as number);
      if (!batchName) continue; // batch not assigned to any CC — skip

      const key = `${batchName}::${row.schedule}::${row.title}`;
      const existing = dedupMap.get(key);

      if (!existing) {
        dedupMap.set(key, { row, batchName, sectionBatchIds: [row.batch_id as number] });
      } else {
        // Collect this section's batch_id and merge upload flags (true wins)
        existing.sectionBatchIds.push(row.batch_id as number);
        existing.row = {
          ...existing.row,
          preread_uploaded:    existing.row.preread_uploaded    || row.preread_uploaded,
          notes_uploaded:      existing.row.notes_uploaded      || row.notes_uploaded,
          assignment_uploaded: existing.row.assignment_uploaded || row.assignment_uploaded,
        };
      }
    }

    // ── Step 5: Live LMS DB check + bucket per CC ──────────────────────────────
    const buckets = new Map<string, CoordinatorBucket>();

    const RESOURCE_TYPES = [
      { key: "preread"    as const, uploadedField: "preread_uploaded"    as const },
      { key: "notes"      as const, uploadedField: "notes_uploaded"      as const },
      { key: "assignment" as const, uploadedField: "assignment_uploaded" as const },
    ];

    for (const { row, batchName, sectionBatchIds } of dedupMap.values()) {
      if (!row.schedule) continue;

      const schedDt = DateTime.fromISO((row.schedule as string).slice(0, 19), { zone: timezone });
      if (!schedDt.isValid) continue;

      const lectureDate = schedDt.toISODate()!;
      const startTime   = schedDt.toFormat("HH:mm:ss");
      const concludesDt = row.concludes
        ? DateTime.fromISO((row.concludes as string).slice(0, 19), { zone: timezone })
        : schedDt.plus({ hours: 1 });
      const endTime = concludesDt.isValid ? concludesDt.toFormat("HH:mm:ss") : startTime;

      // Live LMS check — probe every section batch so cross-section uploads are found.
      // This is the DB check: it queries the LMS MySQL DB for actual upload state.
      let prereadUploaded    = Boolean(row.preread_uploaded);
      let notesUploaded      = Boolean(row.notes_uploaded);
      let assignmentUploaded = Boolean(row.assignment_uploaded);

      for (const batchId of sectionBatchIds) {
        if (prereadUploaded && notesUploaded && assignmentUploaded) break;
        try {
          const check = await checkLmsTasksForLecture(batchId, row.title as string, lectureDate);
          prereadUploaded    = prereadUploaded    || check.preread;
          notesUploaded      = notesUploaded      || check.notes;
          assignmentUploaded = assignmentUploaded || check.assignment;

          // Promote cache flags false→true as a side effect so the dashboard stays fresh.
          const patch: Record<string, boolean> = {};
          if (check.preread    && !row.preread_uploaded)    patch.preread_uploaded    = true;
          if (check.notes      && !row.notes_uploaded)      patch.notes_uploaded      = true;
          if (check.assignment && !row.assignment_uploaded) patch.assignment_uploaded = true;
          if (Object.keys(patch).length > 0) {
            await supabase
              .from("lms_lecture_cache")
              .update(patch)
              .eq("batch_id", batchId)
              .eq("lecture_id", row.lecture_id as number);
          }
        } catch (err) {
          console.warn(
            `[push-slack] Live LMS check failed for "${row.title}" batch=${batchId}:`,
            err instanceof Error ? err.message : err
          );
        }
      }

      const uploadState: Record<string, boolean> = {
        preread:    prereadUploaded,
        notes:      notesUploaded,
        assignment: assignmentUploaded,
      };

      // Find the CCs responsible for this batch
      const ccIds = ccsByBatchName.get(batchName) ?? [];
      if (ccIds.length === 0) continue;

      for (const { key, uploadedField: _ } of RESOURCE_TYPES) {
        const deadlineIso = computeDeadline(key, lectureDate, startTime, endTime);
        const deadlineDay = DateTime.fromISO(deadlineIso).setZone(timezone).toISODate()!;
        if (deadlineDay !== todayDate) continue; // only resources due today

        const uploaded = uploadState[key];
        const item: ResourceItem = { batch: batchName, lecture: row.title as string, type: key };

        for (const userId of ccIds) {
          const profile = profileMap.get(userId);
          if (!profile) continue;

          if (!buckets.has(userId)) {
            buckets.set(userId, {
              slackMemberId: profile.slackMemberId,
              email: profile.email,
              completed: [],
              pending: []
            });
          }

          const bucket = buckets.get(userId)!;
          if (uploaded) bucket.completed.push(item);
          else          bucket.pending.push(item);
        }
      }
    }

    if (buckets.size === 0) {
      return NextResponse.json({ message: "No resource deadlines fall today — nothing to notify." });
    }

    // ── Step 6: Send one Slack message per CC ─────────────────────────────────
    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const [, bucket] of buckets) {
      const message = buildMessage(dateLabel, bucket);
      if (!message) { skipped++; continue; }

      try {
        await postToSlack(webhookUrl, message);
        sent++;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        errors.push(`${bucket.email}: ${reason}`);
      }
    }

    if (errors.length > 0 && sent === 0) {
      return NextResponse.json(
        { message: `All Slack posts failed: ${errors.join("; ")}` },
        { status: 502 }
      );
    }

    return NextResponse.json({
      message: `Slack notification sent to ${sent} coordinator(s).${skipped > 0 ? ` ${skipped} skipped (no deadlines today).` : ""}`,
      sent,
      skipped
    });
  } catch (error) {
    console.error("[push-slack-notification] Error:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to send notification." },
      { status: 500 }
    );
  }
}
