import { DateTime } from "luxon";

import { TASK_LABELS } from "@/lib/constants";
import { getAutomationEnv } from "@/lib/env";
import { getAutomationLectures } from "@/lib/queries";
import { scrapeLmsResources } from "@/lib/lms-scraper";
import { sendSlackAlerts } from "@/lib/slack";
import { createServerSupabase } from "@/lib/supabase";
import {
  AlertType,
  ComplianceAlertEvent,
  ComplianceRunSummary,
  LmsTrackingRecord,
  TaskRecord,
  TaskStatus,
  TaskType
} from "@/lib/types";

function trackingKey(lectureId: string, type: TaskType) {
  return `${lectureId}:${type}`;
}

function latestTimestamp(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;
}

function nextStatus(
  task: TaskRecord,
  tracking: LmsTrackingRecord | undefined,
  now: DateTime,
  stickyCompletedTaskIds: Set<string>
) {
  if (task.status === "completed" || stickyCompletedTaskIds.has(task.id)) {
    return {
      status: "completed" as TaskStatus,
      completedAt: tracking?.uploadedAt ?? task.completed_at ?? now.toUTC().toISO()
    };
  }

  if (tracking?.found) {
    return {
      status: "completed" as TaskStatus,
      completedAt: tracking.uploadedAt ?? task.completed_at ?? now.toUTC().toISO()
    };
  }

  if (DateTime.fromISO(task.deadline) <= now) {
    return {
      status: "missed" as TaskStatus,
      completedAt: null
    };
  }

  return {
    status: "pending" as TaskStatus,
    completedAt: null
  };
}

function chooseAlertType(task: TaskRecord, nextTaskStatus: TaskStatus, now: DateTime) {
  const deadline = DateTime.fromISO(task.deadline);
  const reminderSchedule = [
    { type: "reminder_10h" as AlertType, offsetMinutes: 10 * 60 },
    { type: "reminder_6h" as AlertType, offsetMinutes: 6 * 60 },
    { type: "reminder_2h" as AlertType, offsetMinutes: 2 * 60 },
    { type: "reminder_30m" as AlertType, offsetMinutes: 30 }
  ];

  if (nextTaskStatus === "missed") {
    return "missed" as AlertType;
  }

  if (nextTaskStatus === "completed") {
    return "completed" as AlertType;
  }

  for (const reminder of reminderSchedule) {
    const target = deadline.minus({ minutes: reminder.offsetMinutes });
    const windowEnds = target.plus({ minutes: 31 });

    if (now >= target && now < windowEnds) {
      return reminder.type;
    }
  }

  return null;
}

function describeRun(summary: ComplianceRunSummary) {
  return `Checked ${summary.checkedLectures} lectures, tracked ${summary.trackedResources} LMS resources, updated ${summary.updatedTasks} tasks, and sent ${summary.alertsSent} Slack message(s).`;
}

export async function runComplianceCheck(): Promise<ComplianceRunSummary> {
  const env = getAutomationEnv();
  const now = DateTime.now().setZone(env.timezone);
  const supabase = createServerSupabase();
  const lectures = await getAutomationLectures();

  if (lectures.length === 0) {
    return {
      checkedLectures: 0,
      trackedResources: 0,
      updatedTasks: 0,
      alertsSent: 0
    };
  }

  const trackingRecords = await scrapeLmsResources(lectures, {
    username: env.lmsUsername,
    password: env.lmsPassword
  });

  const lectureIds = lectures.map((lecture) => lecture.id);
  const taskIds = lectures.flatMap((lecture) => lecture.tasks.map((task) => task.id));

  const [{ data: existingTrackingRows, error: existingTrackingError }, { data: existingAlerts, error: alertError }] =
    await Promise.all([
      supabase
        .from("lms_tracking")
        .select("lecture_id, resource_type, found, uploaded_at, raw_payload")
        .in("lecture_id", lectureIds),
      supabase.from("alert_events").select("task_id, alert_type").in("task_id", taskIds)
    ]);

  if (existingTrackingError) {
    throw new Error(existingTrackingError.message);
  }

  if (alertError) {
    throw new Error(alertError.message);
  }

  const stickyCompletedTaskIds = new Set(
    (existingAlerts ?? [])
      .filter((alert) => alert.alert_type === "completed")
      .map((alert) => alert.task_id)
  );

  const taskByTrackingKey = new Map(
    lectures.flatMap((lecture) =>
      lecture.tasks.map((task) => [trackingKey(lecture.id, task.type), task] as const)
    )
  );

  const existingTrackingMap = new Map(
    (existingTrackingRows ?? []).map((row) => [
      trackingKey(row.lecture_id, row.resource_type as TaskType),
      row
    ])
  );

  const scrapedTrackingMap = new Map(
    trackingRecords.map((record) => [trackingKey(record.lectureId, record.resourceType), record] as const)
  );

  const mergedTrackingRecords = lectures.flatMap((lecture) =>
    lecture.tasks.map((task) => {
      const key = trackingKey(lecture.id, task.type);
      const record = scrapedTrackingMap.get(key);
      const existingRow = existingTrackingMap.get(key);
      const stickyCompleted = task.status === "completed" || stickyCompletedTaskIds.has(task.id);

      return {
        lectureId: lecture.id,
        resourceType: task.type,
        found: Boolean(record?.found || existingRow?.found || stickyCompleted),
        uploadedAt:
          latestTimestamp([
            record?.uploadedAt ?? null,
            existingRow?.uploaded_at ?? null,
            task.completed_at ?? null
          ]) ?? null,
        rawPayload:
          record?.rawPayload ??
          ((existingRow?.raw_payload as Record<string, unknown> | null) ?? {
            scraperMissed: true
          })
      };
    })
  );

  const trackingMap = new Map<string, LmsTrackingRecord>();
  for (const record of mergedTrackingRecords) {
    trackingMap.set(trackingKey(record.lectureId, record.resourceType), record);
  }

  const { error: trackingError } = await supabase.from("lms_tracking").upsert(
    mergedTrackingRecords.map((record) => ({
      lecture_id: record.lectureId,
      resource_type: record.resourceType,
      found: record.found,
      uploaded_at: record.uploadedAt,
      checked_at: now.toUTC().toISO(),
      raw_payload: record.rawPayload ?? {}
    })),
    {
      onConflict: "lecture_id,resource_type"
    }
  );

  if (trackingError) {
    throw new Error(trackingError.message);
  }

  const taskUpdates = lectures.flatMap((lecture) =>
    lecture.tasks.map((task) => {
      const tracking = trackingMap.get(trackingKey(task.lecture_id, task.type));
      const resolved = nextStatus(task, tracking, now, stickyCompletedTaskIds);

      return {
        id: task.id,
        lecture_id: task.lecture_id,
        type: task.type,
        deadline: task.deadline,
        status: resolved.status,
        completed_at: resolved.completedAt,
        last_checked_at: now.toUTC().toISO()
      };
    })
  );

  const previousTaskMap = new Map(
    lectures.flatMap((lecture) => lecture.tasks.map((task) => [task.id, task] as const))
  );

  const { data: updatedTasks, error: taskError } = await supabase
    .from("tasks")
    .upsert(taskUpdates, {
      onConflict: "id"
    })
    .select("id, lecture_id, type, deadline, status, completed_at");

  if (taskError || !updatedTasks) {
    throw new Error(taskError?.message ?? "Unable to update tasks");
  }

  const candidateAlerts: ComplianceAlertEvent[] = updatedTasks.flatMap((task) => {
    const lecture = lectures.find((item) => item.id === task.lecture_id);
    if (!lecture) {
      return [];
    }

    const previousTask = previousTaskMap.get(task.id);
    const alertType = chooseAlertType(task as TaskRecord, task.status as TaskStatus, now);
    if (!alertType) {
      return [];
    }

    if (alertType === "completed" && previousTask?.status === "completed") {
      return [];
    }

    const lectureRecord = {
      id: lecture.id,
      batch_name: lecture.batch_name,
      module_name: lecture.module_name,
      lecture_name: lecture.lecture_name,
      lecture_date: lecture.lecture_date,
      start_time: lecture.start_time,
      end_time: lecture.end_time
    };

    return [
      {
        taskId: task.id,
        lecture: lectureRecord,
        taskType: task.type as TaskType,
        alertType,
        deadline: task.deadline,
        completedAt: task.completed_at
      }
    ];
  });

  let alertsToSend: ComplianceAlertEvent[] = [];

  if (candidateAlerts.length > 0) {
    const sentKeys = new Set(
      (existingAlerts ?? []).map((alert) => `${alert.task_id}:${alert.alert_type}`)
    );

    alertsToSend = candidateAlerts.filter(
      (alert) => !sentKeys.has(`${alert.taskId}:${alert.alertType}`)
    );
  }

  const alertsSent = await sendSlackAlerts(alertsToSend);

  if (alertsToSend.length > 0) {
    const { error: persistAlertError } = await supabase.from("alert_events").insert(
      alertsToSend.map((alert) => ({
        task_id: alert.taskId,
        alert_type: alert.alertType
      }))
    );

    if (persistAlertError) {
      throw new Error(persistAlertError.message);
    }
  }

  const summary = {
    checkedLectures: lectures.length,
    trackedResources: mergedTrackingRecords.length,
    updatedTasks: updatedTasks.length,
    alertsSent
  };

  console.log(describeRun(summary));
  console.log(
    alertsToSend.map((alert) => `${TASK_LABELS[alert.taskType]} => ${alert.alertType}`).join(", ")
  );

  return summary;
}
