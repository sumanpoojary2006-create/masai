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

  return `• ⏳ ${event.lecture.lecture_name} | ${label} ${deadlineLabel}`;
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
  const completedAlerts = alerts.filter((alert) => alert.alertType === "completed");
  const reminderAlerts = alerts.filter(
    (alert) => alert.alertType.startsWith("reminder_")
  );
  const missedAlerts = alerts.filter((alert) => alert.alertType === "missed");
  const lectureDates = alerts
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

export async function sendLoSyncSlackNotification(params: {
  fetchResults: Array<{ lectureName: string; status: string; reason?: string }>;
  analyzeResults: Array<{ lectureName: string; status: string; coveredCount?: number; missingCount?: number; reason?: string }>;
  email: string;
}) {
  const webhookUrl = process.env.LO_SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("[lo-slack] LO_SLACK_WEBHOOK_URL not set — skipping Slack notification");
    return;
  }

  const timezone = process.env.APP_TIMEZONE ?? getAppTimezone();
  const now = DateTime.now().setZone(timezone).toFormat("dd LLL yyyy, hh:mm a");

  const lines: string[] = [
    `📚 *LO Sync Report* — ${now}`,
    `👤 ${params.email}`,
    ""
  ];

  // ── Transcript fetch results ──
  const fetched = params.fetchResults.filter((r) => r.status === "fetched");
  const fetchErrors = params.fetchResults.filter((r) => r.status === "error");
  const fetchSkipped = params.fetchResults.filter((r) => r.status === "skipped");

  lines.push("*📥 Transcripts Fetched*");
  if (fetched.length === 0 && fetchErrors.length === 0) {
    lines.push("  — No new transcripts");
  } else {
    fetched.forEach((r) => lines.push(`  ✅ ${r.lectureName}${r.reason ? ` _(${r.reason})_` : ""}`));
    fetchErrors.forEach((r) => lines.push(`  ❌ ${r.lectureName} — ${r.reason ?? "failed"}`));
  }
  if (fetchSkipped.length > 0) {
    lines.push(`  _${fetchSkipped.length} skipped (already done or no session link)_`);
  }

  lines.push("");

  // ── LO analysis results ──
  const analyzed = params.analyzeResults.filter((r) => r.status === "analyzed");
  const analyzeErrors = params.analyzeResults.filter((r) => r.status === "error");
  const analyzeSkipped = params.analyzeResults.filter((r) => r.status === "skipped");

  lines.push("*🧠 LO Analysis*");
  if (analyzed.length === 0 && analyzeErrors.length === 0) {
    lines.push("  — No pending reports to analyse");
  } else {
    analyzed.forEach((r) => {
      const total = (r.coveredCount ?? 0) + (r.missingCount ?? 0);
      const pct = total > 0 ? Math.round(((r.coveredCount ?? 0) / total) * 100) : 0;
      const bar = pct === 100 ? "🟢" : pct >= 60 ? "🟡" : "🔴";
      lines.push(`  ${bar} *${r.lectureName}* — ${r.coveredCount ?? 0}/${total} LOs covered (${pct}%)`);
      if (r.reason) lines.push(`     _${r.reason}_`);
    });
    analyzeErrors.forEach((r) => lines.push(`  ❌ ${r.lectureName} — ${r.reason ?? "failed"}`));
  }
  if (analyzeSkipped.length > 0) {
    lines.push(`  _${analyzeSkipped.length} skipped (no LOs set)_`);
  }

  const message = lines.join("\n");
  await postSlackMessage(webhookUrl, message);
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
