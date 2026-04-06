import { DateTime } from "luxon";

import { TASK_LABELS } from "@/lib/constants";
import { getAutomationEnv } from "@/lib/env";
import { ComplianceAlertEvent } from "@/lib/types";

function alertLine(event: ComplianceAlertEvent) {
  const label = TASK_LABELS[event.taskType];

  if (event.alertType === "missed") {
    return `❌ ${label} missed deadline`;
  }

  if (event.alertType === "reminder_2h") {
    return `⏰ ${label} due in 2 hours`;
  }

  return `⏰ ${label} due in 6 hours`;
}

export async function sendSlackAlerts(alerts: ComplianceAlertEvent[]) {
  if (alerts.length === 0) {
    return 0;
  }

  const { slackWebhookUrl, timezone } = getAutomationEnv();
  const grouped = new Map<string, ComplianceAlertEvent[]>();

  for (const alert of alerts) {
    const key = alert.lecture.id;
    const current = grouped.get(key) ?? [];
    current.push(alert);
    grouped.set(key, current);
  }

  let sent = 0;

  for (const [lectureId, lectureAlerts] of grouped.entries()) {
    const lecture = lectureAlerts[0].lecture;
    const message = [
      "🚨 Lecture Compliance Alert",
      "",
      `Batch: ${lecture.batch_name}`,
      `Lecture: ${lecture.lecture_name}`,
      `Date: ${DateTime.fromISO(lecture.lecture_date, { zone: timezone }).toFormat("dd LLL yyyy")}`,
      "",
      ...lectureAlerts.map(alertLine)
    ].join("\n");

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

    sent += 1;
  }

  return sent;
}
