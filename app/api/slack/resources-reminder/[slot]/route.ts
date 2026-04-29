import { NextRequest, NextResponse } from "next/server";
import { DateTime } from "luxon";

import { computeDeadline } from "@/lib/deadlines";
import { getAppTimezone } from "@/lib/env";
import { evaluateScheduledRunWindow } from "@/lib/scheduled-run";
import { createServerSupabase } from "@/lib/supabase";

const TASK_LABELS: Record<string, string> = {
  preread: "Pre-read",
  notes: "Notes",
  assignment: "Assignment"
};

const SLOT_HEADERS: Record<string, string> = {
  "11am":  "🌤️ *11:00 AM — Today's Resource Status*",
  "1pm":   "⏰ *1:00 PM — Pending Resources Reminder*",
  "230pm": "🚨 *2:30 PM — Final Alert: Missing Resources*"
};

const SLOT_WINDOWS: Record<string, { hour: number; minute: number }> = {
  "11am":  { hour: 11, minute: 0 },
  "1pm":   { hour: 13, minute: 0 },
  "230pm": { hour: 14, minute: 30 }
};

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

function isForceRun(request: NextRequest) {
  return request.nextUrl.searchParams.get("force") === "1";
}

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

function buildMessage(slot: string, dateLabel: string, bucket: CoordinatorBucket): string | null {
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
    if (bucket.completed.length === 0 && bucket.pending.length === 0) return null;
  } else {
    if (bucket.pending.length === 0) return null;
    const bullet = slot === "230pm" ? "• 🚨" : "• ⏳";
    const sectionHeader =
      slot === "230pm"
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
    return NextResponse.json(
      { message: `Invalid slot: ${slot}. Use 11am, 1pm, or 230pm.` },
      { status: 400 }
    );
  }

  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json({ message: "SLACK_WEBHOOK_URL is not configured" }, { status: 500 });
  }

  const timezone = getAppTimezone();

  if (!isForceRun(request)) {
    const slotWindow = SLOT_WINDOWS[slot];
    const schedule = evaluateScheduledRunWindow({
      timezone,
      hour: slotWindow.hour,
      minute: slotWindow.minute,
      maxDelayMinutes: 30,
      allowedWeekdays: [1, 2, 3, 4, 5, 6]
    });
    if (!schedule.shouldRun) {
      return NextResponse.json({ message: schedule.reason, slot, now: schedule.now.toISO() });
    }
  }

  const supabase = createServerSupabase();
  const today = DateTime.now().setZone(timezone);
  const todayDate = today.toISODate()!;
  const dateLabel = today.toFormat("dd LLL yyyy, cccc");

  // Load all CC assignments
  const { data: assignments, error: assignError } = await supabase
    .from("cc_batch_assignments")
    .select("cc_user_id, batch_id, batch_name");

  if (assignError) return NextResponse.json({ message: assignError.message }, { status: 500 });
  if (!assignments || assignments.length === 0) {
    return NextResponse.json({ message: "No CC batch assignments configured", slot });
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

  // Load lectures in current Mon→next-Mon window
  const weekStart = today.startOf("week").toISO()!;
  const weekEnd = today.startOf("week").plus({ days: 8 }).toISO()!;
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
    return NextResponse.json({ message: "No lectures in current window", slot });
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

  // Bucket items by CC for resources whose deadline is today
  const RESOURCE_TYPES = [
    { key: "preread" as const,     uploadedField: "preread_uploaded" as const },
    { key: "notes" as const,       uploadedField: "notes_uploaded" as const },
    { key: "assignment" as const,  uploadedField: "assignment_uploaded" as const }
  ];

  const buckets = new Map<string, CoordinatorBucket>();

  for (const lecture of lectures) {
    const dt = DateTime.fromISO(lecture.schedule as string).setZone(timezone);
    const lectureDate = dt.toISODate()!;
    const startTime = dt.toFormat("HH:mm:ss");
    const endTime = DateTime.fromISO(lecture.concludes as string).setZone(timezone).toFormat("HH:mm:ss");
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
    return NextResponse.json({ message: "No resource deadlines fall today", today: todayDate, slot });
  }

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [, bucket] of buckets) {
    const message = buildMessage(slot, dateLabel, bucket);
    if (!message) { skipped++; continue; }

    try {
      await postToSlack(webhookUrl, message);
      console.log(`[slack-reminder] Sent ${slot} to ${bucket.email}`);
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

  return NextResponse.json({ message: "Done", slot, today: todayDate, sent, skipped, errors });
}
