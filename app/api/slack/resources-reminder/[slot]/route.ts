import { NextRequest, NextResponse } from "next/server";
import { DateTime } from "luxon";

import { syncTaskStatusesFromLms } from "@/lib/automation";
import { getAppTimezone } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase";

const TASK_LABELS: Record<string, string> = {
  preread: "Pre-read",
  notes: "Notes",
  assignment: "Assignment"
};

const TASK_TYPES = ["preread", "notes", "assignment"] as const;

const SLOT_HEADERS: Record<string, string> = {
  "11am":  "🌤️ *11:00 AM — Today's Resource Status*",
  "1pm":   "⏰ *1:00 PM — Pending Resources Reminder*",
  "230pm": "🚨 *2:30 PM — Final Alert: Missing Resources*"
};

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

type TaskRow = { type: string; status: string; deadline: string | null; completed_at: string | null };

type ResourceItem = {
  batch: string;
  lecture: string;
  type: string;
};

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

function buildMessage(
  slot: string,
  dateLabel: string,
  bucket: CoordinatorBucket
): string | null {
  const mention = bucket.slackMemberId ? `<@${bucket.slackMemberId}>` : `*${bucket.email}*`;
  const header = SLOT_HEADERS[slot];
  const lines: string[] = [mention, header, `🗓️ ${dateLabel}`, ""];

  if (slot === "11am") {
    if (bucket.completed.length > 0) {
      lines.push("✅ *Completed*");
      lines.push(...renderBatchGroup(bucket.completed, "• ✅"));
    }
    if (bucket.pending.length > 0) {
      lines.push("⏳ *Pending — upload before 3:00 PM today*");
      lines.push(...renderBatchGroup(bucket.pending, "• ⏳"));
    }
    if (bucket.completed.length === 0 && bucket.pending.length === 0) {
      return null; // nothing to report for this coordinator
    }
  } else {
    // 1pm / 2:30pm — only pending
    if (bucket.pending.length === 0) return null;
    const bullet = slot === "230pm" ? "• 🚨" : "• ⏳";
    const sectionHeader = slot === "230pm"
      ? "🚨 *Still missing — immediate action required*"
      : "⏳ *Still pending — upload before 3:00 PM today*";
    lines.push(sectionHeader);
    lines.push(...renderBatchGroup(bucket.pending, bullet));
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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slot: string }> }
) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { slot } = await context.params;
  if (!(slot in SLOT_HEADERS)) {
    return NextResponse.json({ message: `Invalid slot: ${slot}. Use 11am, 1pm, or 230pm.` }, { status: 400 });
  }

  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json({ message: "SLACK_WEBHOOK_URL is not configured" }, { status: 500 });
  }

  const timezone = getAppTimezone();
  const today = DateTime.now().setZone(timezone).toISODate()!;
  const dateLabel = DateTime.fromISO(today, { zone: timezone }).toFormat("dd LLL yyyy, cccc");

  const supabase = createServerSupabase();

  // Sync latest LMS resource status into the tasks table before reading
  console.log(`[slack-reminder] Running LMS sync before ${slot} digest`);
  try {
    const syncResult = await syncTaskStatusesFromLms();
    console.log(`[slack-reminder] LMS sync complete — ${syncResult.updatedTasks} tasks updated across ${syncResult.checkedLectures} lectures`);
  } catch (err) {
    console.error("[slack-reminder] LMS sync failed, proceeding with last known status:", err);
  }

  // Fetch today's lectures with user_id and tasks
  const { data: lectures, error: lectureError } = await supabase
    .from("lectures")
    .select("id, user_id, batch_name, lecture_name, tasks(id, type, status, deadline, completed_at)")
    .eq("lecture_date", today)
    .is("archived_at", null)
    .order("batch_name", { ascending: true })
    .order("lecture_name", { ascending: true });

  if (lectureError) {
    console.error("[slack-reminder] Supabase lectures error:", lectureError.message);
    return NextResponse.json({ message: lectureError.message }, { status: 500 });
  }

  if (!lectures || lectures.length === 0) {
    return NextResponse.json({ message: "No lectures for today", today, slot });
  }

  // Fetch coordinator profiles (email + slack_member_id)
  const userIds = [...new Set(lectures.map((l) => l.user_id).filter(Boolean))];
  const { data: profiles, error: profileError } = await supabase
    .from("user_profiles")
    .select("user_id, email, slack_member_id")
    .in("user_id", userIds);

  if (profileError) {
    console.error("[slack-reminder] Supabase profiles error:", profileError.message);
    return NextResponse.json({ message: profileError.message }, { status: 500 });
  }

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.user_id, { email: p.email as string, slackMemberId: p.slack_member_id as string | null }])
  );

  // Group completed/pending items by coordinator (user_id)
  const buckets = new Map<string, CoordinatorBucket>();

  for (const lecture of lectures) {
    const userId = lecture.user_id;
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
    const taskMap = new Map<string, TaskRow>(
      ((lecture.tasks ?? []) as TaskRow[]).map((t) => [t.type, t])
    );

    for (const type of TASK_TYPES) {
      const task = taskMap.get(type);
      if (!task) continue;

      const item: ResourceItem = { batch: lecture.batch_name, lecture: lecture.lecture_name, type };
      if (task.status === "completed") {
        bucket.completed.push(item);
      } else {
        bucket.pending.push(item);
      }
    }
  }

  // Send one Slack message per coordinator
  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [userId, bucket] of buckets) {
    const message = buildMessage(slot, dateLabel, bucket);
    if (!message) {
      skipped++;
      continue;
    }

    try {
      await postToSlack(webhookUrl, message);
      console.log(`[slack-reminder] Sent ${slot} to ${bucket.email} (${bucket.completed.length} completed, ${bucket.pending.length} pending)`);
      sent++;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[slack-reminder] Failed for ${bucket.email}: ${reason}`);
      errors.push(`${bucket.email}: ${reason}`);
    }
  }

  if (errors.length > 0 && sent === 0) {
    return NextResponse.json({ message: "All Slack posts failed", errors }, { status: 502 });
  }

  return NextResponse.json({ message: "Done", slot, today, sent, skipped, errors });
}
