import { DateTime } from "luxon";

import { TASK_LABELS } from "@/lib/constants";
import { getAutomationEnv } from "@/lib/env";
import { ComplianceAlertEvent } from "@/lib/types";

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

function alertLine(event: ComplianceAlertEvent) {
  const label = TASK_LABELS[event.taskType];

  if (event.alertType === "completed") {
    return `• ${event.lecture.lecture_name} | ${label} uploaded`;
  }

  if (event.alertType === "missed") {
    return `• ${event.lecture.lecture_name} | ${label} missed deadline`;
  }

  if (event.alertType === "reminder_2h") {
    return `• ${event.lecture.lecture_name} | ${label} due in 2 hours`;
  }

  if (event.alertType === "reminder_30m") {
    return `• ${event.lecture.lecture_name} | ${label} due in 30 minutes`;
  }

  if (event.alertType === "reminder_6h") {
    return `• ${event.lecture.lecture_name} | ${label} due in 6 hours`;
  }

  if (event.alertType === "reminder_10h") {
    return `• ${event.lecture.lecture_name} | ${label} due in 10 hours`;
  }

  return `• ${event.lecture.lecture_name} | ${label} due in 6 hours`;
}

function section(title: string, alerts: ComplianceAlertEvent[]) {
  if (alerts.length === 0) {
    return [];
  }

  return [title, ...groupedAlertLines(alerts)];
}

export async function sendSlackAlerts(alerts: ComplianceAlertEvent[]) {
  if (alerts.length === 0) {
    return 0;
  }

  const { slackWebhookUrl, timezone } = getAutomationEnv();
  const completedAlerts = alerts.filter((alert) => alert.alertType === "completed");
  const reminderAlerts = alerts.filter(
    (alert) => alert.alertType.startsWith("reminder_")
  );
  const missedAlerts = alerts.filter((alert) => alert.alertType === "missed");
  const lectureDates = alerts
    .map((alert) =>
      DateTime.fromISO(alert.lecture.lecture_date, { zone: timezone }).toFormat("dd LLL yyyy")
    )
    .filter((value, index, array) => array.indexOf(value) === index)
    .join(", ");

  const message = [
    "Masai Resource Tracker Update",
    lectureDates ? `Lecture dates: ${lectureDates}` : null,
    "",
    ...section("Completed", completedAlerts),
    ...section("Pending / Upcoming", reminderAlerts),
    ...section("Missed", missedAlerts)
  ]
    .filter((line): line is string => line !== null)
    .join("\n")
    .trim();

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

  return 1;
}
