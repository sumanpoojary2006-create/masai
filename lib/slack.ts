import { DateTime } from "luxon";

import { TASK_LABELS } from "@/lib/constants";
import { getAppTimezone, getAutomationEnv } from "@/lib/env";
import { ComplianceAlertEvent } from "@/lib/types";

type PendingDigestItem = Pick<ComplianceAlertEvent, "lecture" | "taskType" | "deadline">;

function sortAlerts(left: ComplianceAlertEvent, right: ComplianceAlertEvent) {
  const dateCompare = left.lecture.lecture_date.localeCompare(right.lecture.lecture_date);
  if (dateCompare !== 0) {
    return dateCompare;
  }

  const batchCompare = left.lecture.batch_name.localeCompare(right.lecture.batch_name);
  if (batchCompare !== 0) {
    return batchCompare;
  }

  const lectureCompare = left.lecture.lecture_name.localeCompare(right.lecture.lecture_name);
  if (lectureCompare !== 0) {
    return lectureCompare;
  }

  return left.taskType.localeCompare(right.taskType);
}

function groupedAlertLines(alerts: ComplianceAlertEvent[]) {
  const groupedByBatch = alerts
    .sort(sortAlerts)
    .reduce<Map<string, ComplianceAlertEvent[]>>((accumulator, alert) => {
      const current = accumulator.get(alert.lecture.batch_name) ?? [];
      current.push(alert);
      accumulator.set(alert.lecture.batch_name, current);
      return accumulator;
    }, new Map());

  const lines: string[] = [];

  for (const [batchName, batchAlerts] of groupedByBatch.entries()) {
    lines.push(batchName);
    lines.push(...batchAlerts.map(alertLine));
    lines.push("");
  }

  return lines;
}

function sortPendingItems(left: PendingDigestItem, right: PendingDigestItem) {
  const dateCompare = left.lecture.lecture_date.localeCompare(right.lecture.lecture_date);
  if (dateCompare !== 0) {
    return dateCompare;
  }

  const batchCompare = left.lecture.batch_name.localeCompare(right.lecture.batch_name);
  if (batchCompare !== 0) {
    return batchCompare;
  }

  const lectureCompare = left.lecture.lecture_name.localeCompare(right.lecture.lecture_name);
  if (lectureCompare !== 0) {
    return lectureCompare;
  }

  return left.taskType.localeCompare(right.taskType);
}

function alertLine(event: ComplianceAlertEvent) {
  const label = TASK_LABELS[event.taskType];
  const timezone = getAppTimezone();
  const deadline = DateTime.fromISO(event.deadline, { zone: timezone });
  const deadlineLabel =
    deadline.isValid &&
    deadline.hasSame(DateTime.now().setZone(timezone), "day")
      ? `due by ${deadline.toFormat("hh:mm a")} today`
      : deadline.isValid
        ? `due by ${deadline.toFormat("dd LLL hh:mm a")}`
        : "pending";

  if (event.alertType === "completed") {
    const isLate =
      Boolean(event.completedAt) &&
      Boolean(event.deadline) &&
      new Date(event.completedAt!).getTime() > new Date(event.deadline).getTime() + 60_000;

    return isLate
      ? `• 🟡 ${event.lecture.lecture_name} | ${label} uploaded late`
      : `• ✅ ${event.lecture.lecture_name} | ${label} uploaded`;
  }

  if (event.alertType === "missed") {
    return `• 🚨 ${event.lecture.lecture_name} | ${label} missed deadline`;
  }

  if (event.alertType === "reminder_30m") {
    return `• ⚠️ ${event.lecture.lecture_name} | ${label} WARNING — upload before 03:00 PM`;
  }

  return `• ⏳ ${event.lecture.lecture_name} | ${label} ${deadlineLabel}`;
}

function morningStatusLine(event: ComplianceAlertEvent) {
  const label = TASK_LABELS[event.taskType];
  if (event.statusAtSend === "completed") {
    return `• ✅ ${event.lecture.lecture_name} | ${label} completed`;
  }
  return `• ⏳ ${event.lecture.lecture_name} | ${label} pending`;
}

function strictWarningLine(event: ComplianceAlertEvent) {
  const label = TASK_LABELS[event.taskType];
  return `• 🚨 ${event.lecture.lecture_name} | ${label} still missing`;
}

function pendingLine(item: PendingDigestItem) {
  return `• 🕒 ${item.lecture.lecture_name} | ${TASK_LABELS[item.taskType]} pending`;
}

function section(title: string, alerts: ComplianceAlertEvent[]) {
  if (alerts.length === 0) {
    return [];
  }

  return [title, ...groupedAlertLines(alerts)];
}

function pendingSection(title: string, items: PendingDigestItem[]) {
  if (items.length === 0) {
    return [];
  }

  const groupedByBatch = items
    .sort(sortPendingItems)
    .reduce<Map<string, PendingDigestItem[]>>((accumulator, item) => {
      const current = accumulator.get(item.lecture.batch_name) ?? [];
      current.push(item);
      accumulator.set(item.lecture.batch_name, current);
      return accumulator;
    }, new Map());

  const lines = [title];

  for (const [batchName, batchItems] of groupedByBatch.entries()) {
    lines.push(batchName);
    lines.push(...batchItems.map(pendingLine));
    lines.push("");
  }

  return lines;
}

export async function sendSlackAlerts(
  alerts: ComplianceAlertEvent[],
  options?: {
    pendingItems?: PendingDigestItem[];
    mentionUserId?: string | null;
  }
) {
  const pendingItems = options?.pendingItems ?? [];

  if (alerts.length === 0 && pendingItems.length === 0) {
    return 0;
  }

  const { slackWebhookUrl, timezone } = getAutomationEnv();
  const message = buildSlackDigest(alerts, pendingItems, timezone, options?.mentionUserId);
  await postSlackMessage(slackWebhookUrl, message);

  return 1;
}

function buildSlackDigest(
  alerts: ComplianceAlertEvent[],
  pendingItems: PendingDigestItem[],
  timezone: string,
  mentionUserId?: string | null
) {
  const morningSnapshotAlerts = alerts.filter((alert) => alert.alertType === "reminder_10h");
  const noonReminderAlerts    = alerts.filter((alert) => alert.alertType === "reminder_2h");
  const strictWarningAlerts   = alerts.filter((alert) => alert.alertType === "reminder_30m");
  const completedAlerts = alerts.filter((alert) => alert.alertType === "completed");
  const reminderAlerts = alerts.filter(
    (alert) => alert.alertType.startsWith("reminder_") && alert.alertType !== "reminder_10h" && alert.alertType !== "reminder_2h" && alert.alertType !== "reminder_30m"
  );
  const missedAlerts = alerts.filter((alert) => alert.alertType === "missed");
  const dateSource = morningSnapshotAlerts.length > 0 ? morningSnapshotAlerts : strictWarningAlerts.length > 0 ? strictWarningAlerts : alerts;
  const lectureDates = dateSource
    .map((alert) =>
      DateTime.fromISO(alert.lecture.lecture_date, { zone: timezone }).toFormat("dd LLL yyyy")
    )
    .concat(
      pendingItems.map((item) =>
        DateTime.fromISO(item.lecture.lecture_date, { zone: timezone }).toFormat("dd LLL yyyy")
      )
    )
    .filter((value, index, array) => array.indexOf(value) === index)
    .join(", ");

  const mention = mentionUserId ? `<@${mentionUserId}>` : null;

  const groupedByBatch = <T extends ComplianceAlertEvent>(items: T[], lineBuilder: (item: T) => string) => {
    const grouped = items
      .sort(sortAlerts)
      .reduce<Map<string, T[]>>((accumulator, item) => {
        const current = accumulator.get(item.lecture.batch_name) ?? [];
        current.push(item);
        accumulator.set(item.lecture.batch_name, current);
        return accumulator;
      }, new Map());

    const lines: string[] = [];
    for (const [batchName, batchItems] of grouped.entries()) {
      lines.push(batchName);
      lines.push(...batchItems.map(lineBuilder));
      lines.push("");
    }
    return lines;
  };

  if (morningSnapshotAlerts.length > 0) {
    const completedToday = morningSnapshotAlerts.filter((alert) => alert.statusAtSend === "completed");
    const pendingToday = morningSnapshotAlerts.filter((alert) => alert.statusAtSend === "pending");

    return [
      mention,
      "🌤️ 11:00 AM Masai Resource Tracker Status",
      lectureDates ? `🗓️ Due today: ${lectureDates}` : null,
      "Compliance check completed. Here is today's completed and pending list.",
      "",
      ...(completedToday.length > 0 ? ["✅ Completed", ...groupedByBatch(completedToday, morningStatusLine)] : []),
      ...(pendingToday.length > 0 ? ["⏳ Pending", ...groupedByBatch(pendingToday, morningStatusLine)] : []),
    ]
      .filter((line): line is string => line !== null)
      .join("\n")
      .trim();
  }

  if (noonReminderAlerts.length > 0) {
    const lectureDatesNoon = noonReminderAlerts
      .map((a) => DateTime.fromISO(a.lecture.lecture_date, { zone: timezone }).toFormat("dd LLL yyyy"))
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .join(", ");
    return [
      mention,
      "⏰ 1:00 PM Reminder — Resources Still Pending",
      lectureDatesNoon ? `🗓️ Due today: ${lectureDatesNoon}` : null,
      "The following resources have not been uploaded yet. Deadline is 3:00 PM.",
      "",
      "⏳ Still pending",
      ...groupedByBatch(noonReminderAlerts, (a) => {
        const label = TASK_LABELS[a.taskType];
        return `• ⏳ ${a.lecture.lecture_name} | ${label} — upload before 03:00 PM today`;
      }),
    ]
      .filter((line): line is string => line !== null)
      .join("\n")
      .trim();
  }

  if (strictWarningAlerts.length > 0) {
    return [
      mention,
      "🚨 Final Alert: Missing Resources",
      lectureDates ? `🗓️ Due today: ${lectureDates}` : null,
      "Compliance check completed. These resources are still missing and need immediate action.",
      "",
      "🚨 Still missing",
      ...groupedByBatch(strictWarningAlerts, strictWarningLine)
    ]
      .filter((line): line is string => line !== null)
      .join("\n")
      .trim();
  }

  const message = [
    mention,
    "📣 Masai Resource Tracker Update",
    lectureDates ? `🗓️ Lecture dates: ${lectureDates}` : null,
    "",
    ...section("✅ Completed", completedAlerts),
    ...section("⏳ Pending / Upcoming", reminderAlerts),
    ...pendingSection("🕒 Pending now", pendingItems),
    ...section("🚨 Missed", missedAlerts)
  ]
    .filter((line): line is string => line !== null)
    .join("\n")
    .trim();

  return message;
}

async function postSlackMessage(slackWebhookUrl: string, message: string) {
  const response = await fetch(slackWebhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text: message
    })
  });

  if (!response.ok) {
    throw new Error(`Slack webhook failed with ${response.status}`);
  }
}

/**
 * Sends a Slack notification to the LO channel once LO analysis is complete.
 * Only fires when at least one lecture has been analysed (status = "analyzed").
 * The message is focused: lecture name + covered/missed LOs only.
 * Mentions the user's Slack ID just like the resource tracker does.
 */
export async function sendLoSyncSlackNotification(params: {
  analyzeResults: Array<{
    lectureName: string;
    status: string;
    coveredCount?: number;
    missingCount?: number;
    reason?: string;
  }>;
  slackMemberId?: string | null;
}) {
  const webhookUrl = process.env.LO_SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("[lo-slack] LO_SLACK_WEBHOOK_URL not set — skipping Slack notification");
    return;
  }

  // Only notify once analysis is actually done — skip if nothing was analysed
  const analyzed = params.analyzeResults.filter((r) => r.status === "analyzed");
  if (analyzed.length === 0) {
    console.log("[lo-slack] No completed analyses — skipping notification");
    return;
  }

  const mention = params.slackMemberId ? `<@${params.slackMemberId}>` : null;
  const lines: string[] = [];

  if (mention) lines.push(mention);
  lines.push("📚 *LO Analysis Complete*");
  lines.push("");

  for (const r of analyzed) {
    const covered = r.coveredCount ?? 0;
    const missing = r.missingCount ?? 0;
    const total = covered + missing;

    if (total === 0) {
      lines.push(`⚪ *${r.lectureName}* — No LOs tracked`);
    } else if (missing === 0) {
      lines.push(`🟢 *${r.lectureName}* — All LOs covered`);
    } else {
      const pct = Math.round((covered / total) * 100);
      const bar = pct >= 60 ? "🟡" : "🔴";
      lines.push(`${bar} *${r.lectureName}* — ${covered} LO${covered !== 1 ? "s" : ""} covered, ${missing} Missed`);
    }

    if (r.reason) lines.push(`   _${r.reason}_`);
  }

  await postSlackMessage(webhookUrl, lines.join("\n"));
  console.log("[lo-slack] Notification sent.");
}

export async function sendLoMorningReport(params: {
  rows: Array<{
    lecture_name: string;
    batch_name: string;
    lecture_date: string;
    learning_objective: string;
    lo_report: {
      status: string;
      covered_los: string[];
      missing_los: string[];
      fallback?: boolean;
    } | null;
  }>;
  email: string;
}) {
  const webhookUrl = process.env.LO_SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("[lo-slack] LO_SLACK_WEBHOOK_URL not set — skipping morning report");
    return;
  }

  const timezone = process.env.APP_TIMEZONE ?? getAppTimezone();
  const today = DateTime.now().setZone(timezone).toFormat("dd LLL yyyy");

  // Only look at yesterday's lectures that have LOs set
  const yesterday = DateTime.now().setZone(timezone).minus({ days: 1 }).toISODate()!;
  const recent = params.rows.filter(
    (r) => r.lecture_date === yesterday && r.learning_objective?.trim()
  );

  if (recent.length === 0) {
    console.log("[lo-slack] No lectures from yesterday with LOs — skipping morning report");
    return;
  }

  // Only send if at least one lecture has missing LOs
  const hasMissingLOs = recent.some(
    (r) => r.lo_report?.status === "completed" && (r.lo_report.missing_los?.length ?? 0) > 0
  );

  if (!hasMissingLOs) {
    console.log("[lo-slack] All yesterday's LOs covered — no report needed 🎉");
    return;
  }

  // Group by batch, sorted alphabetically
  const byBatch = recent.reduce<Map<string, typeof recent>>((acc, r) => {
    acc.set(r.batch_name, [...(acc.get(r.batch_name) ?? []), r]);
    return acc;
  }, new Map([...new Set(recent.map((r) => r.batch_name))].sort().map((b) => [b, []])));

  const yesterdayLabel = DateTime.fromISO(yesterday, { zone: timezone }).toFormat("dd LLL yyyy");

  const lines: string[] = [
    `🚨 *Missing LOs — ${yesterdayLabel}*`,
    `👤 ${params.email}`,
    ""
  ];

  let totalCovered = 0;
  let totalLOs = 0;

  for (const [batchName, lectures] of byBatch.entries()) {
    if (lectures.length === 0) continue;
    lines.push(`*${batchName}*`);

    for (const row of lectures) {
      const report = row.lo_report;
      const date = DateTime.fromISO(row.lecture_date, { zone: timezone }).toFormat("dd LLL");

      if (!report || report.status !== "completed") {
        const badge = !report ? "⬜" : "⏳";
        lines.push(`  ${badge} ${row.lecture_name} _(${date})_ — not analysed yet`);
        continue;
      }

      const covered = report.covered_los?.length ?? 0;
      const missing = report.missing_los?.length ?? 0;
      const total = covered + missing;
      const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
      const bar = pct === 100 ? "🟢" : pct >= 60 ? "🟡" : "🔴";
      const fallbackNote = report.fallback ? " _(keyword match)_" : "";

      totalCovered += covered;
      totalLOs += total;

      lines.push(`  ${bar} *${row.lecture_name}* _(${date})_ — ${covered}/${total} LOs covered (${pct}%)${fallbackNote}`);

      if (missing > 0) {
        (report.missing_los ?? []).forEach((lo) => lines.push(`     • ✗ ${lo}`));
      }
    }
    lines.push("");
  }

  // Overall summary line
  const overallPct = totalLOs > 0 ? Math.round((totalCovered / totalLOs) * 100) : 0;
  lines.push(`📊 *Overall (last 7 days): ${totalCovered}/${totalLOs} LOs covered (${overallPct}%)*`);

  await postSlackMessage(webhookUrl, lines.join("\n"));
  console.log("[lo-slack] Morning report sent.");
}

/**
 * Sends a targeted Slack notification to the CC who just clicked Sync Up.
 * Reports only newly completed tasks and tasks pending today.
 * Fires only if there's at least one newly completed or pending-today item.
 * Uses the resource-tracker webhook and @-mentions the CC by their Slack member ID.
 */
export async function sendSyncUpdateAlert(params: {
  newlyCompleted: Array<{ lectureName: string; batchName: string; taskType: string; completedAt?: string | null }>;
  pendingToday: Array<{ lectureName: string; batchName: string; taskType: string; deadline?: string }>;
  slackMemberId?: string | null;
}) {
  const { newlyCompleted, pendingToday, slackMemberId } = params;

  if (newlyCompleted.length === 0 && pendingToday.length === 0) {
    console.log("[sync-alert] Nothing to report — skipping Slack notification");
    return;
  }

  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("[sync-alert] SLACK_WEBHOOK_URL not set — skipping Slack notification");
    return;
  }

  const timezone = getAppTimezone();
  const now = DateTime.now().setZone(timezone);
  const mention = slackMemberId ? `<@${slackMemberId}>` : null;

  const lines: string[] = [];
  if (mention) lines.push(mention);
  lines.push("📣 *Sync Update*");
  lines.push("");

  if (newlyCompleted.length > 0) {
    lines.push("✅ *Newly Completed*");
    const byBatch = newlyCompleted.reduce<Map<string, typeof newlyCompleted>>((acc, item) => {
      acc.set(item.batchName, [...(acc.get(item.batchName) ?? []), item]);
      return acc;
    }, new Map());

    for (const [batch, items] of byBatch) {
      lines.push(batch);
      for (const item of items) {
        const label = TASK_LABELS[item.taskType as keyof typeof TASK_LABELS] ?? item.taskType;
        const timeStr = item.completedAt
          ? ` _(${DateTime.fromISO(item.completedAt, { zone: timezone }).toFormat("hh:mm a")})_`
          : "";
        lines.push(`• ✅ ${item.lectureName} | ${label} uploaded${timeStr}`);
      }
      lines.push("");
    }
  }

  if (pendingToday.length > 0) {
    lines.push("⏳ *Pending Today*");
    const byBatch = pendingToday.reduce<Map<string, typeof pendingToday>>((acc, item) => {
      acc.set(item.batchName, [...(acc.get(item.batchName) ?? []), item]);
      return acc;
    }, new Map());

    for (const [batch, items] of byBatch) {
      lines.push(batch);
      for (const item of items) {
        const label = TASK_LABELS[item.taskType as keyof typeof TASK_LABELS] ?? item.taskType;
        const deadlineStr = item.deadline
          ? ` — due by ${DateTime.fromISO(item.deadline, { zone: timezone }).toFormat("hh:mm a")}`
          : "";
        lines.push(`• 🕒 ${item.lectureName} | ${label} pending${deadlineStr}`);
      }
      lines.push("");
    }
  }

  lines.push(`_Synced at ${now.toFormat("hh:mm a, dd LLL yyyy")}_`);

  await postSlackMessage(webhookUrl, lines.join("\n").trim());
  console.log(`[sync-alert] Notification sent to ${slackMemberId ?? "channel"}`);
}

export async function sendManualPendingDigest(
  pendingItems: PendingDigestItem[],
  options?: { mentionUserId?: string | null }
) {
  if (pendingItems.length === 0) {
    return 0;
  }

  const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!slackWebhookUrl) {
    throw new Error("Missing required environment variable: SLACK_WEBHOOK_URL");
  }

  const timezone = process.env.APP_TIMEZONE ?? getAppTimezone();
  const message = buildSlackDigest([], pendingItems, timezone, options?.mentionUserId);
  await postSlackMessage(slackWebhookUrl, message);

  return 1;
}
