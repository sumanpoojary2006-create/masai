import { DateTime } from "luxon";

import { TASK_LABELS } from "@/lib/constants";
import { getAppTimezone, getAutomationEnv } from "@/lib/env";
import { BatchUrlOverrides, deriveAssignmentBatchUrl } from "@/lib/lms-batch-urls";
import { checkLmsTasksForLecture } from "@/lib/lms-db";
import { analyzeLosFromTranscript } from "@/lib/lo-analyzer";
import { resolveSessionLinks, scrapeLectureSummary } from "@/lib/lms-scraper";
import { getAutomationLectures, getAutomationProfiles } from "@/lib/queries";
import { sendSlackAlerts } from "@/lib/slack";
import { createServerSupabase } from "@/lib/supabase";
import {
  AlertType,
  AutomationLecture,
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

/** Extract the LMS numeric batch id from a stored lecture_batch_url */
function extractBatchIdFromUrl(url: string): number | null {
  try {
    const u = new URL(url);
    const raw = u.searchParams.get("batch");
    if (!raw) return null;
    const obj = JSON.parse(decodeURIComponent(raw)) as { id?: unknown };
    return typeof obj.id === "number" ? obj.id : null;
  } catch {
    return null;
  }
}

/**
 * Replace Playwright-based scrapeLmsResources with direct LMS DB checks.
 * Instant, no browser launch, no login needed.
 */
async function checkResourcesFromDb(
  lectures: AutomationLecture[],
  batchUrlOverrides: BatchUrlOverrides,
  now: DateTime
): Promise<LmsTrackingRecord[]> {
  const nowIso = now.toUTC().toISO()!;
  const records: LmsTrackingRecord[] = [];

  for (const lecture of lectures) {
    const lectureUrl = batchUrlOverrides[lecture.batch_name]?.lectures;
    const batchId = lectureUrl ? extractBatchIdFromUrl(lectureUrl) : null;

    if (!batchId) {
      console.log(`[db-check] No batch_id for "${lecture.batch_name}" — skipping`);
      // Push "not found" placeholders so tracking rows still exist
      for (const type of ["preread", "notes", "assignment"] as TaskType[]) {
        records.push({ lectureId: lecture.id, resourceType: type, found: false, uploadedAt: null, rawPayload: { source: "lms-db", skipped: true } });
      }
      continue;
    }

    let check;
    try {
      check = await checkLmsTasksForLecture(batchId, lecture.lecture_name, lecture.lecture_date);
    } catch (err) {
      console.error(`[db-check] Failed for "${lecture.lecture_name}":`, err instanceof Error ? err.message : err);
      for (const type of ["preread", "notes", "assignment"] as TaskType[]) {
        records.push({ lectureId: lecture.id, resourceType: type, found: false, uploadedAt: null, rawPayload: { source: "lms-db", error: true } });
      }
      continue;
    }

    console.log(
      `[db-check] "${lecture.lecture_name}" — preread=${check.preread}, notes=${check.notes}, assignment=${check.assignment}`
    );

    records.push({ lectureId: lecture.id, resourceType: "preread",    found: check.preread,     uploadedAt: check.preread     ? nowIso : null, rawPayload: { source: "lms-db" } });
    records.push({ lectureId: lecture.id, resourceType: "notes",      found: check.notes,       uploadedAt: check.notes       ? nowIso : null, rawPayload: { source: "lms-db" } });
    records.push({ lectureId: lecture.id, resourceType: "assignment", found: check.assignment,  uploadedAt: check.assignment  ? nowIso : null, rawPayload: { source: "lms-db" } });
  }

  return records;
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
export interface SummaryFetchResult {
  lectureId: string;
  lectureName: string;
  status: "fetched" | "skipped" | "error";
  reason?: string;
}

export async function fetchAndAnalyzePendingSummaries(
  profile: Pick<AutomationProfile, "user_id" | "lms_username" | "lms_password" | "email">
): Promise<SummaryFetchResult[]> {
  const supabase = createServerSupabase();
  const timezone = getAppTimezone();
  const now = DateTime.now().setZone(timezone);

  let lectures = await getAutomationLectures(profile.user_id);
  console.log(`[lo-sync] ${profile.email}: ${lectures.length} total lectures`);

  // ── Auto-resolve missing session links via GraphQL API ───────────────────
  const missingLink = lectures.filter((l) => !String(l.session_link ?? "").trim());
  if (missingLink.length > 0) {
    console.log(`[lo-sync] Auto-resolving session links for ${missingLink.length} lecture(s)…`);
    try {
      const resolved = await resolveSessionLinks(
        missingLink.map((l) => ({
          id: l.id,
          lecture_name: l.lecture_name,
          batch_name: l.batch_name,
          lecture_date: l.lecture_date
        })),
        { username: profile.lms_username, password: profile.lms_password }
      );

      if (resolved.size > 0) {
        // Save all resolved links to the database
        await Promise.all(
          Array.from(resolved.entries()).map(([lectureId, sessionLink]) =>
            supabase
              .from("lectures")
              .update({ session_link: sessionLink })
              .eq("id", lectureId)
          )
        );
        console.log(`[lo-sync] Saved ${resolved.size} session link(s) to database`);

        // Patch the in-memory lecture objects so eligible filter sees the new links
        lectures = lectures.map((l) =>
          resolved.has(l.id) ? { ...l, session_link: resolved.get(l.id)! } : l
        );
      }
    } catch (err) {
      console.warn(
        "[lo-sync] Session link auto-resolve failed:",
        err instanceof Error ? err.message : err
      );
    }
  }

  // Lectures that ended > 1.5 hours ago and have a session link
  const eligible = lectures.filter((lecture) => {
    // Normalize: Supabase may return null even if TS type says string
    const sessionLink = String(lecture.session_link ?? "").trim();
    if (!sessionLink) {
      console.log(`[lo-sync]   SKIP "${lecture.lecture_name}" — no session link`);
      return false;
    }

    const lectureEnd = DateTime.fromISO(
      `${lecture.lecture_date}T${lecture.end_time}`,
      { zone: timezone }
    ).plus({ hours: 1, minutes: 30 });

    const ended = now >= lectureEnd;
    if (!ended) {
      console.log(`[lo-sync]   SKIP "${lecture.lecture_name}" — ends ${lectureEnd.toISO()} (now: ${now.toISO()})`);
      return false;
    }

    console.log(`[lo-sync]   ELIGIBLE "${lecture.lecture_name}" — link: ${sessionLink.slice(0, 60)}`);
    return true;
  });

  console.log(`[lo-sync] ${eligible.length} eligible lectures (ended + have session link)`);
  if (eligible.length === 0) return [];

  // Get existing lo_reports for these lectures
  const { data: existingReports } = await supabase
    .from("lo_reports")
    .select("lecture_id, status, transcript")
    .in("lecture_id", eligible.map((l) => l.id));

  const reportMap = new Map(
    ((existingReports ?? []) as Array<{ lecture_id: string; status: string; transcript: string }>)
      .map((r) => [r.lecture_id, r])
  );

  const results: SummaryFetchResult[] = [];

  for (const lecture of eligible) {
    const report = reportMap.get(lecture.id);
    const alreadyDone = report?.status === "completed" && Boolean(report?.transcript?.trim());

    if (alreadyDone) {
      console.log(`[lo-sync]   SKIP "${lecture.lecture_name}" — already completed`);
      results.push({ lectureId: lecture.id, lectureName: lecture.lecture_name, status: "skipped", reason: "Already completed" });
      continue;
    }

    const sessionLink = String(lecture.session_link ?? "").trim();
    console.log(`[lo-sync] Fetching summary for "${lecture.lecture_name}" from ${sessionLink}`);

    try {
      const summary = await scrapeLectureSummary(sessionLink, {
        username: profile.lms_username,
        password: profile.lms_password
      });

      // ── Step 1: Save transcript immediately so it's never lost on analysis failure ──
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
      console.log(`[lo-auto] "${lecture.lecture_name}" → transcript saved (${summary.length} chars)`);

      // ── Step 2: Run LO analysis only if learning objectives are set ──
      const learningObjective = lecture.learning_objective?.trim() ?? "";

      if (learningObjective) {
        try {
          const result = await analyzeLosFromTranscript(learningObjective, summary);

          await supabase.from("lo_reports").upsert(
            {
              lecture_id: lecture.id,
              user_id: profile.user_id,
              transcript: summary,
              covered_los: result.covered_los,
              missing_los: result.missing_los,
              status: "completed",
              fallback: result.fallback ?? false,
              generated_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            },
            { onConflict: "lecture_id" }
          );

          const method = result.fallback ? "keyword fallback" : "Gemini";
          console.log(`[lo-auto] "${lecture.lecture_name}" → ${result.covered_los.length} covered, ${result.missing_los.length} missing (${method})`);
          results.push({
            lectureId: lecture.id,
            lectureName: lecture.lecture_name,
            status: "fetched",
            reason: result.fallback ? "⚠ Keyword matching used (Gemini quota exhausted)" : undefined
          });
        } catch (analysisErr) {
          // Transcript was already saved above — log the analysis failure but don't fail the whole run
          const reason = analysisErr instanceof Error ? analysisErr.message : "LO analysis failed";
          console.error(`[lo-auto] LO analysis failed for "${lecture.lecture_name}" (transcript saved): ${reason}`);
          results.push({
            lectureId: lecture.id,
            lectureName: lecture.lecture_name,
            status: "fetched",
            reason: `Transcript saved — LO analysis failed: ${reason.slice(0, 120)}`
          });
        }
      } else {
        console.log(`[lo-auto] "${lecture.lecture_name}" → transcript stored, no LOs to analyse`);
        results.push({ lectureId: lecture.id, lectureName: lecture.lecture_name, status: "fetched", reason: "Transcript stored — add Learning Objectives to run analysis" });
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Unknown error";
      console.error(`[lo-auto] Failed for "${lecture.lecture_name}":`, err);
      results.push({ lectureId: lecture.id, lectureName: lecture.lecture_name, status: "error", reason });
    }
  }

  return results;
}

/**
 * For a given user, finds all lo_reports with a transcript but no completed
 * analysis (status = "pending" | "error") and runs LO analysis on them.
 * Called automatically at midnight — companion to fetchAndAnalyzePendingSummaries.
 */
export interface AnalyzeReportResult {
  lectureId: string;
  lectureName: string;
  status: "analyzed" | "skipped" | "error";
  coveredCount?: number;
  missingCount?: number;
  reason?: string;
}

export async function analyzePendingLoReports(
  userId: string
): Promise<AnalyzeReportResult[]> {
  const supabase = createServerSupabase();

  const { data: reports } = await supabase
    .from("lo_reports")
    .select("lecture_id, transcript, status")
    .eq("user_id", userId)
    .in("status", ["pending", "error"])
    .not("transcript", "is", null)
    .neq("transcript", "");

  if (!reports || reports.length === 0) return [];

  const lectureIds = reports.map((r) => r.lecture_id);
  const { data: lectures } = await supabase
    .from("lectures")
    .select("id, lecture_name, learning_objective")
    .eq("user_id", userId)
    .in("id", lectureIds);

  const lectureMap = new Map((lectures ?? []).map((l) => [l.id, l]));
  const results: AnalyzeReportResult[] = [];

  for (const report of reports) {
    const lecture = lectureMap.get(report.lecture_id);
    const lectureName = lecture?.lecture_name ?? report.lecture_id;

    if (!lecture) {
      results.push({ lectureId: report.lecture_id, lectureName, status: "skipped", reason: "Lecture not found" });
      continue;
    }

    const learningObjective = String(lecture.learning_objective ?? "").trim();
    if (!learningObjective) {
      results.push({ lectureId: report.lecture_id, lectureName, status: "skipped", reason: "No LOs set" });
      continue;
    }

    try {
      await supabase
        .from("lo_reports")
        .update({ status: "analyzing", updated_at: new Date().toISOString() })
        .eq("lecture_id", report.lecture_id)
        .eq("user_id", userId);

      const analysis = await analyzeLosFromTranscript(learningObjective, report.transcript as string);

      await supabase.from("lo_reports").upsert(
        {
          lecture_id: report.lecture_id,
          user_id: userId,
          transcript: report.transcript,
          covered_los: analysis.covered_los,
          missing_los: analysis.missing_los,
          status: "completed",
          fallback: analysis.fallback ?? false,
          generated_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        { onConflict: "lecture_id" }
      );

      const method = analysis.fallback ? "keyword fallback" : "AI";
      console.log(`[lo-analyze] "${lectureName}" → ${analysis.covered_los.length} covered, ${analysis.missing_los.length} missing (${method})`);
      results.push({ lectureId: report.lecture_id, lectureName, status: "analyzed", coveredCount: analysis.covered_los.length, missingCount: analysis.missing_los.length });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Unknown error";
      console.error(`[lo-analyze] Failed for "${lectureName}": ${reason}`);
      await supabase
        .from("lo_reports")
        .update({ status: "pending", updated_at: new Date().toISOString() })
        .eq("lecture_id", report.lecture_id)
        .eq("user_id", userId);
      results.push({ lectureId: report.lecture_id, lectureName, status: "error", reason });
    }
  }

  return results;
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

    const trackingRecords = await checkResourcesFromDb(lectures, batchUrlOverrides, now);

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
      const summaryResults = await fetchAndAnalyzePendingSummaries(profile);
      const fetched = summaryResults.filter((r) => r.status === "fetched").length;
      const errors = summaryResults.filter((r) => r.status === "error");
      if (fetched > 0) console.log(`[lo-auto] Auto-fetched ${fetched} summary(s) for ${profile.email}`);
      errors.forEach((r) => console.error(`[lo-auto] Error for "${r.lectureName}": ${r.reason}`));
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
