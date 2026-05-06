export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { DateTime } from "luxon";

import { hasAdminAccess } from "@/lib/admin-access";
import { getCurrentUser } from "@/lib/auth";
import { computeDeadline } from "@/lib/deadlines";
import { getAppTimezone } from "@/lib/env";
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
  if (bucket.completed.length === 0 && bucket.pending.length === 0) return null;

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
    const today = DateTime.now().setZone(timezone);
    const todayDate = today.toISODate()!;
    const dateLabel = today.toFormat("dd LLL yyyy, cccc");

    // Load all CC assignments
    const { data: assignments, error: assignError } = await supabase
      .from("cc_batch_assignments")
      .select("cc_user_id, batch_id, batch_name");

    if (assignError) return NextResponse.json({ message: assignError.message }, { status: 500 });
    if (!assignments || assignments.length === 0) {
      return NextResponse.json({ message: "No CC batch assignments configured." });
    }

    // Load CC profiles (email + Slack ID)
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

    // Fetch lectures for the current week window
    const weekStartDate = today.startOf("week").toISODate()!;
    const weekEndDate = today.startOf("week").plus({ days: 8 }).toISODate()!;
    const weekStart = `${weekStartDate}T00:00:00+00:00`;
    const weekEnd = `${weekEndDate}T00:00:00+00:00`;
    const batchIds = [...new Set(assignments.map((a) => a.batch_id as number))];

    const { data: lectures, error: lectureError } = await supabase
      .from("lms_lecture_cache")
      .select("lecture_id, batch_id, title, schedule, concludes, preread_uploaded, notes_uploaded, assignment_uploaded")
      .in("batch_id", batchIds)
      .neq("module", "general")
      .or("title.ilike.Faculty Session%,title.ilike.IM Session%,title.ilike.Academic Session%")
      .gte("schedule", weekStart)
      .lte("schedule", weekEnd);

    if (lectureError) return NextResponse.json({ message: lectureError.message }, { status: 500 });
    if (!lectures || lectures.length === 0) {
      return NextResponse.json({ message: "No lectures found in current window." });
    }

    // batch_id → [cc_user_id] and batch_id → batch_name maps
    const batchToCCs = new Map<number, string[]>();
    const batchNameMap = new Map<number, string>();
    for (const a of assignments) {
      const id = a.batch_id as number;
      batchNameMap.set(id, a.batch_name as string);
      const list = batchToCCs.get(id) ?? [];
      list.push(a.cc_user_id as string);
      batchToCCs.set(id, list);
    }

    const RESOURCE_TYPES = [
      { key: "preread" as const,    uploadedField: "preread_uploaded" as const },
      { key: "notes" as const,      uploadedField: "notes_uploaded" as const },
      { key: "assignment" as const, uploadedField: "assignment_uploaded" as const }
    ];

    // Bucket completed and pending items by CC for resources whose deadline is today
    const buckets = new Map<string, CoordinatorBucket>();

    for (const lecture of lectures) {
      const dt = DateTime.fromISO((lecture.schedule as string).slice(0, 19), { zone: timezone });
      const lectureDate = dt.toISODate()!;
      const startTime = dt.toFormat("HH:mm:ss");
      const endTime = DateTime.fromISO((lecture.concludes as string).slice(0, 19), { zone: timezone }).toFormat("HH:mm:ss");
      const batchId = lecture.batch_id as number;
      const batchName = batchNameMap.get(batchId) ?? `Batch ${batchId}`;
      const ccIds = batchToCCs.get(batchId) ?? [];

      for (const { key, uploadedField } of RESOURCE_TYPES) {
        const deadlineIso = computeDeadline(key, lectureDate, startTime, endTime);
        const deadlineDay = DateTime.fromISO(deadlineIso).setZone(timezone).toISODate()!;
        if (deadlineDay !== todayDate) continue;

        const uploaded = Boolean(lecture[uploadedField]);
        const item: ResourceItem = { batch: batchName, lecture: lecture.title as string, type: key };

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
          else bucket.pending.push(item);
        }
      }
    }

    if (buckets.size === 0) {
      return NextResponse.json({ message: "No resource deadlines fall today — nothing to notify." });
    }

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
      return NextResponse.json({ message: `All Slack posts failed: ${errors.join("; ")}` }, { status: 502 });
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
