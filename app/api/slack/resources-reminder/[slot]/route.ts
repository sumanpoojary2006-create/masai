import { NextRequest, NextResponse } from "next/server";
import { DateTime } from "luxon";

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
type ResourceItem = { batch: string; lecture: string; type: string };

function groupByBatch(items: ResourceItem[]): Map<string, ResourceItem[]> {
  return items.reduce((map, item) => {
    const list = map.get(item.batch) ?? [];
    list.push(item);
    map.set(item.batch, list);
    return map;
  }, new Map<string, ResourceItem[]>());
}

function renderGroup(items: ResourceItem[], bullet: string): string[] {
  const lines: string[] = [];
  for (const [batch, batchItems] of groupByBatch(items)) {
    lines.push(`*${batch}*`);
    for (const item of batchItems) {
      lines.push(`${bullet} ${item.lecture} | ${TASK_LABELS[item.type] ?? item.type}`);
    }
    lines.push("");
  }
  return lines;
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

  const { data: lectures, error } = await supabase
    .from("lectures")
    .select("id, batch_name, lecture_name, tasks(id, type, status, deadline, completed_at)")
    .eq("lecture_date", today)
    .is("archived_at", null)
    .order("batch_name", { ascending: true })
    .order("lecture_name", { ascending: true });

  if (error) {
    console.error("[slack-reminder] Supabase error:", error.message);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  const completed: ResourceItem[] = [];
  const pending: ResourceItem[] = [];

  for (const lecture of lectures ?? []) {
    const taskMap = new Map<string, TaskRow>(
      ((lecture.tasks ?? []) as TaskRow[]).map((t) => [t.type, t])
    );

    for (const type of TASK_TYPES) {
      const task = taskMap.get(type);
      if (!task) continue;

      if (task.status === "completed") {
        completed.push({ batch: lecture.batch_name, lecture: lecture.lecture_name, type });
      } else {
        pending.push({ batch: lecture.batch_name, lecture: lecture.lecture_name, type });
      }
    }
  }

  const lines: string[] = [SLOT_HEADERS[slot], `🗓️ ${dateLabel}`, ""];

  if (slot === "11am") {
    // Show both completed and pending
    if (completed.length > 0) {
      lines.push("✅ *Completed*");
      lines.push(...renderGroup(completed, "• ✅"));
    }
    if (pending.length > 0) {
      lines.push("⏳ *Pending — upload before 3:00 PM today*");
      lines.push(...renderGroup(pending, "• ⏳"));
    }
    if (completed.length === 0 && pending.length === 0) {
      lines.push("ℹ️ No lectures are tracked for today.");
    }
  } else {
    // 1pm and 2:30pm — only show pending
    if (pending.length === 0) {
      lines.push("✅ *All resources uploaded! Nothing is pending.*");
    } else {
      const bullet = slot === "230pm" ? "• 🚨" : "• ⏳";
      const sectionHeader = slot === "230pm"
        ? "🚨 *Still missing — immediate action required*"
        : "⏳ *Still pending — upload before 3:00 PM today*";
      lines.push(sectionHeader);
      lines.push(...renderGroup(pending, bullet));
    }
  }

  const message = lines.join("\n").trim();

  console.log(`[slack-reminder] Posting ${slot} digest — ${completed.length} completed, ${pending.length} pending`);

  const slackRes = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: message })
  });

  if (!slackRes.ok) {
    const body = await slackRes.text();
    console.error(`[slack-reminder] Slack webhook failed: ${slackRes.status} — ${body}`);
    return NextResponse.json({ message: `Slack webhook failed: ${slackRes.status}` }, { status: 502 });
  }

  return NextResponse.json({
    message: "Slack notification sent",
    slot,
    today,
    completed: completed.length,
    pending: pending.length
  });
}
