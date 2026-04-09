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
    return `• ✅ ${event.lecture.lecture_name} | ${label} uploaded`;
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
  }
) {
  const pendingItems = options?.pendingItems ?? [];

  if (alerts.length === 0 && pendingItems.length === 0) {
    return 0;
  }

  const { slackWebhookUrl, timezone } = getAutomationEnv();
  const message = buildSlackDigest(alerts, pendingItems, timezone);
  await postSlackMessage(slackWebhookUrl, message);

  return 1;
}

function buildSlackDigest(
  alerts: ComplianceAlertEvent[],
  pendingItems: PendingDigestItem[],
  timezone: string
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

  const message = [
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

export async function sendManualPendingDigest(pendingItems: PendingDigestItem[]) {
  if (pendingItems.length === 0) {
    return 0;
  }

  const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!slackWebhookUrl) {
    throw new Error("Missing required environment variable: SLACK_WEBHOOK_URL");
  }

  const timezone = process.env.APP_TIMEZONE ?? getAppTimezone();
  const message = buildSlackDigest([], pendingItems, timezone);
  await postSlackMessage(slackWebhookUrl, message);

  return 1;
}
