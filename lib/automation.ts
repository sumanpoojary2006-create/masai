import { DateTime } from "luxon";

import { TASK_LABELS } from "@/lib/constants";
import { getAutomationEnv } from "@/lib/env";
import { deriveAssignmentBatchUrl } from "@/lib/lms-batch-urls";
import { analyzeLosFromTranscript } from "@/lib/lo-analyzer";
import { scrapeLectureSummary, scrapeLmsResources } from "@/lib/lms-scraper";
import { getAutomationLectures, getAutomationProfiles } from "@/lib/queries";
import { sendSlackAlerts } from "@/lib/slack";
import { createServerSupabase } from "@/lib/supabase";
import {
  AlertType,
  AutomationProfile,
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
  const resourceFound =
    Boolean(tracking?.found) ||
    task.status === "completed" ||
    stickyCompletedTaskIds.has(task.id);

  // Resource was uploaded — completed regardless of when (before or after deadline)
  if (resourceFound) {
    return {
      status: "completed" as TaskStatus,
      completedAt: tracking?.uploadedAt ?? task.completed_at ?? now.toUTC().toISO()
    };
  }

  // Deadline passed and resource never uploaded — missed
  if (DateTime.fromISO(task.deadline) <= now) {
    return {
      status: "missed" as TaskStatus,
      completedAt: null
    };
  }

  // Deadline not yet passed and not uploaded — pending
  return {
    status: "pending" as TaskStatus,
    completedAt: null
  };
}

function chooseAlertType(
  task: TaskRecord,
  nextTaskStatus: TaskStatus,
  now: DateTime,
  sentAlertTypes: Set<AlertType>
) {
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

  const eligibleReminder = reminderSchedule.reduce<AlertType | null>((current, reminder) => {
    const target = deadline.minus({ minutes: reminder.offsetMinutes });
    if (now >= target && now < deadline && !sentAlertTypes.has(reminder.type)) {
      return reminder.type;
    }

    return current;
  }, null);

  if (eligibleReminder) {
    return eligibleReminder;
  }

  return null;
}

function describeRun(summary: ComplianceRunSummary) {
  return `Checked ${summary.checkedLectures} lectures, tracked ${summary.trackedResources} LMS resources, updated ${summary.updatedTasks} tasks, and sent ${summary.alertsSent} Slack message(s).`;
}

/**
 * For a given profile, finds all lectures that:
 *  - have a session_link
 *  - ended more than 1.5 hours ago
 *  - do NOT yet have a completed lo_report with transcript
 *
 * Then scrapes the LMS summary tab and (if learning_objective is set)
 * auto-runs the Gemini LO analysis — fully hands-free.
 */
export async function fetchAndAnalyzePendingSummaries(
  profile: Pick<AutomationProfile, "user_id" | "lms_username" | "lms_password" | "email">
): Promise<number> {
  const supabase = createServerSupabase();
  const timezone = getAutomationEnv().timezone;
  const now = DateTime.now().setZone(timezone);

  const lectures = await getAutomationLectures(profile.user_id);

  // Lectures that ended > 1.5 hours ago and have a session link
  const eligible = lectures.filter((lecture) => {
    const sessionLink = lecture.session_link;
    if (!sessionLink?.trim()) return false;

    const lectureEnd = DateTime.fromISO(
      `${lecture.lecture_date}T${lecture.end_time}`,
      { zone: timezone }
    ).plus({ hours: 1, minutes: 30 });

    return now >= lectureEnd;
  });

  if (eligible.length === 0) return 0;

  // Get existing lo_reports for these lectures
  const { data: existingReports } = await supabase
    .from("lo_reports")
    .select("lecture_id, status, transcript")
    .in("lecture_id", eligible.map((l) => l.id));

  const reportMap = new Map(
    ((existingReports ?? []) as Array<{ lecture_id: string; status: string; transcript: string }>)
      .map((r) => [r.lecture_id, r])
  );

  // Only process lectures that don't have a completed report with transcript yet
  const toProcess = eligible.filter((lecture) => {
    const report = reportMap.get(lecture.id);
    return !report || report.status !== "completed" || !report.transcript?.trim();
  });

  if (toProcess.length === 0) return 0;

  let processed = 0;

  for (const lecture of toProcess) {
    try {
      console.log(`[lo-auto] Fetching summary for "${lecture.lecture_name}"…`);

      const summary = await scrapeLectureSummary(lecture.session_link, {
        username: profile.lms_username,
        password: profile.lms_password
      });

      const learningObjective = lecture.learning_objective?.trim() ?? "";

      if (learningObjective) {
        // Save transcript + run LO analysis in one step
        const result = await analyzeLosFromTranscript(learningObjective, summary);

        await supabase.from("lo_reports").upsert(
          {
            lecture_id: lecture.id,
            user_id: profile.user_id,
            transcript: summary,
            covered_los: result.covered_los,
            missing_los: result.missing_los,
            status: "completed",
            generated_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          { onConflict: "lecture_id" }
        );

        console.log(
          `[lo-auto] "${lecture.lecture_name}" → ${result.covered_los.length} covered, ${result.missing_los.length} missing`
        );
      } else {
        // No LOs yet — store transcript only, mark pending analysis
        await supabase.from("lo_reports").upsert(
          {
            lecture_id: lecture.id,
            user_id: profile.user_id,
            transcript: summary,
            covered_los: [],
            missing_los: [],
            status: "pending",
            generated_at: null,
            updated_at: new Date().toISOString()
          },
          { onConflict: "lecture_id" }
        );

        console.log(`[lo-auto] "${lecture.lecture_name}" → transcript stored, no LOs to analyse`);
      }

      processed++;
    } catch (err) {
      console.error(`[lo-auto] Failed for "${lecture.lecture_name}":`, err);
    }
  }

  return processed;
}

export async function runComplianceCheck(options?: {
  userId?: string;
}): Promise<ComplianceRunSummary> {
  const env = getAutomationEnv();
  const now = DateTime.now().setZone(env.timezone);
  const supabase = createServerSupabase();
  const profiles = await getAutomationProfiles(options?.userId);
  const summary: ComplianceRunSummary = {
    checkedLectures: 0,
    trackedResources: 0,
    updatedTasks: 0,
    alertsSent: 0
  };

  for (const profile of profiles) {
    const lectures = await getAutomationLectures(profile.user_id);

    if (lectures.length === 0) {
      continue;
    }

    const batchUrlOverrides = Object.fromEntries(
      profile.batch_configs.map((config) => [
        config.batch_name,
        {
          lectures: config.lecture_batch_url,
          assignments:
            config.assignment_batch_url ||
            deriveAssignmentBatchUrl(config.lecture_batch_url)
        }
      ])
    );

    const trackingRecords = await scrapeLmsResources(
      lectures,
      {
        username: profile.lms_username,
        password: profile.lms_password
      },
      {
        batchUrls: batchUrlOverrides
      }
    );

    const lectureIds = lectures.map((lecture) => lecture.id);
    const taskIds = lectures.flatMap((lecture) => lecture.tasks.map((task) => task.id));

    const [
      { data: existingTrackingRows, error: existingTrackingError },
      { data: existingAlerts, error: alertError }
    ] = await Promise.all([
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

    const existingTrackingMap = new Map(
      (existingTrackingRows ?? []).map((row) => [
        trackingKey(row.lecture_id, row.resource_type as TaskType),
        row
      ])
    );

    const scrapedTrackingMap = new Map(
      trackingRecords.map((record) => [
        trackingKey(record.lectureId, record.resourceType),
        record
      ])
    );

    const mergedTrackingRecords = lectures.flatMap((lecture) =>
      lecture.tasks.map((task) => {
        const key = trackingKey(lecture.id, task.type);
        const record = scrapedTrackingMap.get(key);
        const existingRow = existingTrackingMap.get(key);
        const stickyCompleted =
          task.status === "completed" || stickyCompletedTaskIds.has(task.id);

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
      const sentAlertTypes = new Set(
        (existingAlerts ?? [])
          .filter((alert) => alert.task_id === task.id)
          .map((alert) => alert.alert_type as AlertType)
      );
      const alertType = chooseAlertType(
        task as TaskRecord,
        task.status as TaskStatus,
        now,
        sentAlertTypes
      );

      if (!alertType) {
        return [];
      }

      if (alertType === "completed" && previousTask?.status === "completed") {
        return [];
      }

      return [
        {
          taskId: task.id,
          lecture: {
            id: lecture.id,
            user_id: lecture.user_id,
            batch_name: lecture.batch_name,
            module_name: lecture.module_name,
            lecture_name: lecture.lecture_name,
            learning_objective: (lecture as Record<string, unknown>).learning_objective as string ?? "",
            session_link: (lecture as Record<string, unknown>).session_link as string ?? "",
            lecture_date: lecture.lecture_date,
            start_time: lecture.start_time,
            end_time: lecture.end_time
          },
          taskType: task.type as TaskType,
          alertType,
          deadline: task.deadline,
          completedAt: task.completed_at
        }
      ];
    });

    const sentKeys = new Set(
      (existingAlerts ?? []).map((alert) => `${alert.task_id}:${alert.alert_type}`)
    );

    const alertsToSend = candidateAlerts.filter(
      (alert) => !sentKeys.has(`${alert.taskId}:${alert.alertType}`)
    );

    const alertsSent = await sendSlackAlerts(alertsToSend, {
      mentionUserId: profile.slack_member_id
    });

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

    // Auto-fetch LMS summaries + run LO analysis for concluded lectures
    try {
      const summariesFetched = await fetchAndAnalyzePendingSummaries(profile);
      if (summariesFetched > 0) {
        console.log(`[lo-auto] Auto-fetched and analysed ${summariesFetched} lecture summary(s) for ${profile.email}`);
      }
    } catch (err) {
      console.error("[lo-auto] Summary fetch step failed:", err);
    }

    summary.checkedLectures += lectures.length;
    summary.trackedResources += mergedTrackingRecords.length;
    summary.updatedTasks += updatedTasks.length;
    summary.alertsSent += alertsSent;

    console.log(
      `${profile.email} (${profile.batch_configs.map((config) => config.batch_name).join(", ")}) => ${describeRun({
        checkedLectures: lectures.length,
        trackedResources: mergedTrackingRecords.length,
        updatedTasks: updatedTasks.length,
        alertsSent
      })}`
    );
    console.log(
      alertsToSend.map((alert) => `${TASK_LABELS[alert.taskType]} => ${alert.alertType}`).join(", ")
    );
  }

  console.log(describeRun(summary));
  return summary;
}
