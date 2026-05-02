import { DateTime } from "luxon";

import { TASK_LABELS } from "@/lib/constants";
import { computeDeadline } from "@/lib/deadlines";
import { getAppTimezone, getAutomationEnv, mysqlDateToIST, nowIST } from "@/lib/env";
import { BatchUrlOverrides, deriveAssignmentBatchUrl } from "@/lib/lms-batch-urls";
import { checkLmsTasksForLecture } from "@/lib/lms-db";
import { fetchBatchCompliance } from "@/lib/lms-mysql";
import { analyzeLosFromTranscript } from "@/lib/lo-analyzer";
import { resolveSessionLinks, scrapeLectureSummary } from "@/lib/lms-scraper";
import { getAutomationLectures, getAutomationProfiles, getCacheLecturesForProfile } from "@/lib/queries";
import { sendSlackAlerts } from "@/lib/slack";
import { createServerSupabase } from "@/lib/supabase";
import {
  AlertType,
  AutomationLecture,
  AutomationProfile,
  CacheLecture,
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

    const timezone = getAppTimezone();
    const toIso = (dtStr: string | null | undefined) => {
      if (!dtStr) return null;
      // LMS DB timestamps (created_at) are stored in IST (Asia/Kolkata)
      const dt = DateTime.fromFormat(dtStr, "yyyy-MM-dd HH:mm:ss", { zone: timezone });
      return dt.isValid ? dt.toISO() : null;
    };

    // Extract LMS lecture id from session_link so we can keep lms_lecture_cache in sync
    let lmsLectureId: number | undefined;
    if (check.session_link) {
      try {
        const lmsIdStr = new URL(check.session_link).searchParams.get("id");
        const parsed = lmsIdStr ? parseInt(lmsIdStr, 10) : NaN;
        if (!isNaN(parsed)) lmsLectureId = parsed;
      } catch { /* ignore malformed URLs */ }
    }

    const baseRecord = { lmsBatchId: batchId, lmsLectureId };

    records.push({
      lectureId: lecture.id,
      resourceType: "preread",
      found: check.preread,
      uploadedAt: check.preread ? toIso(check.preread_at) : null,
      rawPayload: { source: "lms-db" },
      ...baseRecord
    });
    records.push({
      lectureId: lecture.id,
      resourceType: "notes",
      found: check.notes,
      uploadedAt: check.notes ? toIso(check.notes_at) : null,
      rawPayload: { source: "lms-db" },
      ...baseRecord
    });
    records.push({
      lectureId: lecture.id,
      resourceType: "assignment",
      found: check.assignment,
      uploadedAt: check.assignment ? toIso(check.assignment_at) : null,
      rawPayload: { source: "lms-db" },
      ...baseRecord
    });
  }

  return records;
}

function earliestTimestamp(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => new Date(left).getTime() - new Date(right).getTime())[0] ?? null;
}

/**
 * Flush any "found" results from a fresh LMS check back into lms_lecture_cache
 * so the dashboard stays consistent with what the compliance check knows.
 * Only sets fields to true — never overrides an existing true with false.
 */
async function syncFoundResourcesToCache(
  supabase: ReturnType<typeof import("@/lib/supabase").createServerSupabase>,
  trackingRecords: LmsTrackingRecord[]
): Promise<void> {
  // Group records by (lmsBatchId, lmsLectureId)
  const byLecture = new Map<string, { batchId: number; lectureId: number; preread: boolean; notes: boolean; assignment: boolean }>();

  for (const r of trackingRecords) {
    if (!r.found || !r.lmsBatchId || !r.lmsLectureId) continue;
    const key = `${r.lmsBatchId}:${r.lmsLectureId}`;
    const entry = byLecture.get(key) ?? { batchId: r.lmsBatchId, lectureId: r.lmsLectureId, preread: false, notes: false, assignment: false };
    if (r.resourceType === "preread") entry.preread = true;
    if (r.resourceType === "notes") entry.notes = true;
    if (r.resourceType === "assignment") entry.assignment = true;
    byLecture.set(key, entry);
  }

  for (const entry of byLecture.values()) {
    const patch: Record<string, boolean> = {};
    if (entry.preread) patch.preread_uploaded = true;
    if (entry.notes) patch.notes_uploaded = true;
    if (entry.assignment) patch.assignment_uploaded = true;
    if (Object.keys(patch).length === 0) continue;

    const { error } = await supabase
      .from("lms_lecture_cache")
      .update(patch)
      .eq("batch_id", entry.batchId)
      .eq("lecture_id", entry.lectureId);

    if (error) {
      console.warn(`[cache-sync] Failed to update lms_lecture_cache for batch=${entry.batchId} lecture=${entry.lectureId}: ${error.message}`);
    }
  }
}

/**
 * Build synthetic task records from a CacheLecture's upload flags.
 * Used when an admin-configured batch lecture has no existing row in the tasks table.
 * Task IDs use the same format as getCCLectures(): "{lectureId}-{type}".
 */
function buildTaskRecordsFromCacheLecture(cl: CacheLecture): TaskRecord[] {
  const makeTask = (type: TaskType, uploaded: boolean): TaskRecord => ({
    id: `${cl.lectureId}-${type}`,
    lecture_id: cl.lectureId,
    type,
    deadline: computeDeadline(type, cl.lecture_date, cl.start_time, cl.end_time),
    status: uploaded ? "completed" : "pending",
    completed_at: null,
  });
  return [
    makeTask("preread", cl.preread_uploaded),
    makeTask("notes", cl.notes_uploaded),
    makeTask("assignment", cl.assignment_uploaded),
  ];
}

function nextStatus(
  task: TaskRecord,
  tracking: LmsTrackingRecord | undefined,
  now: DateTime,
  stickyCompletedTaskIds: Set<string>
) {
  // Fresh LMS check takes precedence. Fall back to sticky only when the LMS
  // check was skipped (no batch_id) — indicated by tracking being absent or
  // having a skipped/error payload. Never trust stale DB status alone.
  const lmsChecked = tracking && !(tracking.rawPayload as Record<string, unknown>)?.skipped && !(tracking.rawPayload as Record<string, unknown>)?.error;
  const resourceFound = lmsChecked
    ? Boolean(tracking!.found)
    : (task.status === "completed" || stickyCompletedTaskIds.has(task.id));

  // Resource was uploaded — completed regardless of when (before or after deadline)
  if (resourceFound) {
    return {
      status: "completed" as TaskStatus,
      // Keep timestamp unknown when LMS only confirms presence but not upload time.
      // This avoids falsely marking items as late based on check runtime.
      completedAt: tracking?.uploadedAt ?? task.completed_at ?? null
    };
  }

  // Deadline passed and resource never uploaded — missed
  if (DateTime.fromISO(task.deadline).setZone(now.zone) <= now) {
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

function chooseAlertTypes(
  task: TaskRecord,
  nextTaskStatus: TaskStatus,
  now: DateTime,
  previousTaskStatus: TaskStatus | undefined,
  sentAlertTypes: Set<AlertType>,
  reminderType?: "morning" | "noon" | "afternoon"
) {
  const deadline = DateTime.fromISO(task.deadline).setZone(now.zone);
  const alerts: AlertType[] = [];
  const isDueToday = deadline.hasSame(now, "day");

  // Active when triggered by dedicated reminder (Vercel cron passes reminderType;
  // GitHub Actions sets env vars). Both paths are supported so either can serve as
  // the primary trigger and the other as fallback.
  const isMorning   = reminderType === "morning"   || process.env.SEND_MORNING_REMINDER === "true";
  const isNoon      = reminderType === "noon"       || process.env.SEND_NOON_REMINDER === "true";
  const isAfternoon = reminderType === "afternoon"  || process.env.SEND_AFTERNOON_REMINDER === "true";
  const isDedicatedReminderRun = isMorning || isNoon || isAfternoon;

  // Guard against a heavily-delayed run sending a stale reminder.
  // Vercel crons are reliable; GitHub Actions can lag 20-45 min under load → 60 min window.
  const withinWindow = (hour: number, minute: number) => {
    const scheduled = now.set({ hour, minute, second: 0, millisecond: 0 });
    const lag = now.diff(scheduled, "minutes").minutes;
    return lag >= 0 && lag < 60;
  };

  const isMorningSnapshotMinute = isMorning   && withinWindow(11, 0);
  const isNoonReminderMinute    = isNoon       && withinWindow(13, 0);
  const isStrictWarningMinute   = isAfternoon  && withinWindow(14, 30);

  if (isDueToday && isMorningSnapshotMinute && nextTaskStatus !== "missed" && !sentAlertTypes.has("reminder_10h")) {
    alerts.push("reminder_10h");
  }

  if (isDueToday && isNoonReminderMinute && nextTaskStatus === "pending" && !sentAlertTypes.has("reminder_2h")) {
    alerts.push("reminder_2h");
  }

  if (
    isDueToday &&
    isStrictWarningMinute &&
    nextTaskStatus === "pending" &&
    !sentAlertTypes.has("reminder_30m")
  ) {
    alerts.push("reminder_30m");
  }

  if (isDedicatedReminderRun) {
    return alerts;
  }

  if (
    nextTaskStatus === "completed" &&
    previousTaskStatus !== "completed" &&
    !isMorningSnapshotMinute
  ) {
    alerts.push("completed");
  }

  if (nextTaskStatus === "missed" && !sentAlertTypes.has("missed")) {
    alerts.push("missed");
  }

  return alerts;
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
  coveredCount?: number;
  missingCount?: number;
}

export async function fetchAndAnalyzePendingSummaries(
  profile: Pick<AutomationProfile, "user_id" | "lms_username" | "lms_password" | "email">
): Promise<SummaryFetchResult[]> {
  const supabase = createServerSupabase();
  const timezone = getAppTimezone();
  const now = DateTime.now().setZone(timezone);

  let lectures = await getAutomationLectures(profile.user_id);
  console.log(`[lo-sync] ${profile.email}: ${lectures.length} total lectures`);

  // Lectures that ended > 1.5 hours ago and have a valid LMS detail-page link
  const eligible = lectures.filter((lecture) => {
    // Normalize: Supabase may return null even if TS type says string
    const sessionLink = String(lecture.session_link ?? "").trim();
    if (!sessionLink) {
      console.log(`[lo-sync]   SKIP "${lecture.lecture_name}" — no session link`);
      return false;
    }

    // Only LMS detail page URLs can be scraped for summaries; skip Zoom/other links
    if (!sessionLink.includes("experience-admin.masaischool.com/lectures/detail")) {
      console.log(`[lo-sync]   SKIP "${lecture.lecture_name}" — not an LMS detail URL (${sessionLink.slice(0, 50)})`);
      return false;
    }

    const lectureStart = DateTime.fromISO(
      `${lecture.lecture_date}T${lecture.start_time}`,
      { zone: timezone }
    );

    const started = now >= lectureStart;
    if (!started) {
      console.log(`[lo-sync]   SKIP "${lecture.lecture_name}" — starts ${lectureStart.toISO()} (now: ${now.toISO()})`);
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
          updated_at: nowIST()
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
              generated_at: nowIST(),
              updated_at: nowIST()
            },
            { onConflict: "lecture_id" }
          );

          const method = result.fallback ? "keyword fallback" : "Gemini";
          console.log(`[lo-auto] "${lecture.lecture_name}" → ${result.covered_los.length} covered, ${result.missing_los.length} missing (${method})`);
          results.push({
            lectureId: lecture.id,
            lectureName: lecture.lecture_name,
            status: "fetched",
            reason: result.fallback ? "⚠ Keyword matching used (Gemini quota exhausted)" : undefined,
            coveredCount: result.covered_los.length,
            missingCount: result.missing_los.length
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
        .update({ status: "analyzing", updated_at: nowIST() })
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
          generated_at: nowIST(),
          updated_at: nowIST()
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
        .update({ status: "pending", updated_at: nowIST() })
        .eq("lecture_id", report.lecture_id)
        .eq("user_id", userId);
      results.push({ lectureId: report.lecture_id, lectureName, status: "error", reason });
    }
  }

  return results;
}

export async function runComplianceCheck(options?: {
  userId?: string;
  reminderType?: "morning" | "noon" | "afternoon";
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
    // === PATH A: CC self-configured lectures ===
    const lectures = await getAutomationLectures(profile.user_id);

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

    // === PATH B: Admin-configured batch lectures from lms_lecture_cache ===
    const cacheLectures = await getCacheLecturesForProfile(profile.user_id);

    // Deduplicate: skip cache lectures whose lectureId already appears in Path A
    const pathALectureIds = new Set(lectures.map((l) => l.id));
    const uniqueCacheLectures = cacheLectures.filter((cl) => !pathALectureIds.has(cl.lectureId));

    // Skip only if both paths are empty
    if (lectures.length === 0 && uniqueCacheLectures.length === 0) {
      continue;
    }

    const pathBTracking: LmsTrackingRecord[] = [];
    for (const cl of uniqueCacheLectures) {
      let check;
      try {
        check = await checkLmsTasksForLecture(cl.lmsBatchId, cl.lecture_name, cl.lecture_date);
      } catch (err) {
        console.error(`[db-check] Cache lecture "${cl.lecture_name}" failed:`, err instanceof Error ? err.message : err);
        pathBTracking.push(
          { lectureId: cl.lectureId, resourceType: "preread", found: false, uploadedAt: null, rawPayload: { source: "lms-db", error: true } },
          { lectureId: cl.lectureId, resourceType: "notes", found: false, uploadedAt: null, rawPayload: { source: "lms-db", error: true } },
          { lectureId: cl.lectureId, resourceType: "assignment", found: false, uploadedAt: null, rawPayload: { source: "lms-db", error: true } }
        );
        continue;
      }

      const timezone = getAppTimezone();
      const toIso = (dtStr: string | null | undefined) => {
        if (!dtStr) return null;
        const dt = DateTime.fromFormat(dtStr, "yyyy-MM-dd HH:mm:ss", { zone: timezone });
        return dt.isValid ? dt.toISO() : null;
      };

      let lmsLectureId: number | undefined;
      if (check.session_link) {
        try {
          const lmsIdStr = new URL(check.session_link).searchParams.get("id");
          const parsed = lmsIdStr ? parseInt(lmsIdStr, 10) : NaN;
          if (!isNaN(parsed)) lmsLectureId = parsed;
        } catch { /* ignore */ }
      }
      // cl.lectureId is the LMS numeric lecture_id stored in lms_lecture_cache.
      // Use it as a fallback when session_link is absent or lacks an ?id= param
      // so syncFoundResourcesToCache can still update the cache row.
      if (!lmsLectureId) {
        const fallback = parseInt(cl.lectureId, 10);
        if (!isNaN(fallback)) lmsLectureId = fallback;
      }
      const base = { lmsBatchId: cl.lmsBatchId, lmsLectureId };

      pathBTracking.push(
        { lectureId: cl.lectureId, resourceType: "preread", found: check.preread, uploadedAt: check.preread ? toIso(check.preread_at) : null, rawPayload: { source: "lms-db" }, ...base },
        { lectureId: cl.lectureId, resourceType: "notes", found: check.notes, uploadedAt: check.notes ? toIso(check.notes_at) : null, rawPayload: { source: "lms-db" }, ...base },
        { lectureId: cl.lectureId, resourceType: "assignment", found: check.assignment, uploadedAt: check.assignment ? toIso(check.assignment_at) : null, rawPayload: { source: "lms-db" }, ...base }
      );
    }

    // Build AutomationLecture-shaped records for Path B (with synthetic tasks)
    const pathBLectures: AutomationLecture[] = uniqueCacheLectures.map((cl) => ({
      id: cl.lectureId,
      user_id: cl.ccUserId,
      batch_name: cl.batch_name,
      module_name: cl.module_name,
      lecture_name: cl.lecture_name,
      learning_objective: "",
      session_link: "",
      lecture_date: cl.lecture_date,
      start_time: cl.start_time,
      end_time: cl.end_time,
      tasks: buildTaskRecordsFromCacheLecture(cl),
    }));

    const allLectures = [...lectures, ...pathBLectures];
    const allTrackingRecords = [...trackingRecords, ...pathBTracking];

    // Keep lms_lecture_cache consistent with fresh LMS findings so the dashboard
    // reflects the same state as the Slack "completed" notification.
    await syncFoundResourcesToCache(supabase, allTrackingRecords);

    // lms_tracking and tasks tables use uuid lecture_id FKs to lectures.id.
    // Admin-batch lectures have numeric LMS IDs (e.g. "147070"), not UUIDs.
    // Only write to those tables for CC-configured lectures (UUID IDs).
    const ccBatchLectureIds = new Set(lectures.map((l) => l.id));
    const ccLectures = allLectures.filter((l) => ccBatchLectureIds.has(l.id));
    const ccTaskIds = ccLectures.flatMap((l) => l.tasks.map((t) => t.id));

    const [
      { data: existingTrackingRows, error: existingTrackingError },
      { data: existingAlerts, error: alertError }
    ] = await Promise.all([
      ccLectures.length > 0
        ? supabase
            .from("lms_tracking")
            .select("lecture_id, resource_type, found, uploaded_at, raw_payload")
            .in("lecture_id", ccLectures.map((l) => l.id))
        : Promise.resolve({ data: [], error: null }),
      ccTaskIds.length > 0
        ? supabase.from("alert_events").select("task_id, alert_type").in("task_id", ccTaskIds)
        : Promise.resolve({ data: [], error: null })
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
      allTrackingRecords.map((record) => [
        trackingKey(record.lectureId, record.resourceType),
        record
      ])
    );

    const mergedTrackingRecords = allLectures.flatMap((lecture) =>
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
            earliestTimestamp([
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

    // Only persist tracking rows for CC-configured lectures (UUID lecture_id FK).
    const ccTrackingRecords = mergedTrackingRecords.filter((r) => ccBatchLectureIds.has(r.lectureId));
    if (ccTrackingRecords.length > 0) {
      const { error: trackingError } = await supabase.from("lms_tracking").upsert(
        ccTrackingRecords.map((record) => ({
          lecture_id: record.lectureId,
          resource_type: record.resourceType,
          found: record.found,
          uploaded_at: record.uploadedAt,
          checked_at: now.toISO(),
          raw_payload: record.rawPayload ?? {}
        })),
        { onConflict: "lecture_id,resource_type" }
      );

      if (trackingError) {
        throw new Error(trackingError.message);
      }
    }

    const previousTaskMap = new Map(
      allLectures.flatMap((lecture) => lecture.tasks.map((task) => [task.id, task] as const))
    );

    const taskUpdates = allLectures.flatMap((lecture) =>
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
          last_checked_at: now.toISO()
        };
      })
    );

    // Only upsert tasks for CC-configured lectures (UUID lecture_id FK).
    const ccTaskUpdates = taskUpdates.filter((t) => ccBatchLectureIds.has(t.lecture_id));
    const { data: updatedCcTasks, error: taskError } = ccTaskUpdates.length > 0
      ? await supabase
          .from("tasks")
          .upsert(ccTaskUpdates, { onConflict: "id" })
          .select("id, lecture_id, type, deadline, status, completed_at")
      : { data: [], error: null };

    if (taskError) {
      throw new Error(taskError.message ?? "Unable to update tasks");
    }

    // Build candidate alerts for CC-configured lectures from DB result.
    const ccCandidateAlerts: ComplianceAlertEvent[] = (updatedCcTasks ?? []).flatMap((task) => {
      const lecture = allLectures.find((item) => item.id === task.lecture_id);
      if (!lecture) return [];

      const previousTask = previousTaskMap.get(task.id);
      const sentAlertTypes = new Set(
        (existingAlerts ?? [])
          .filter((alert) => alert.task_id === task.id)
          .map((alert) => alert.alert_type as AlertType)
      );
      const alertTypes = chooseAlertTypes(
        task as TaskRecord,
        task.status as TaskStatus,
        now,
        previousTask?.status as TaskStatus | undefined,
        sentAlertTypes,
        options?.reminderType
      );

      if (alertTypes.length === 0) return [];

      return alertTypes.map((alertType) => ({
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
        completedAt: task.completed_at,
        statusAtSend: task.status as TaskStatus
      }));
    });

    // Build candidate alerts for admin-batch lectures directly from resolved task states.
    // Dedup is handled via lms_lecture_cache flags: if the cache already shows "completed"
    // (previousTask.status === "completed"), the alert was already sent in a prior run.
    const adminCandidateAlerts: ComplianceAlertEvent[] = pathBLectures.flatMap((lecture) =>
      lecture.tasks.flatMap((task) => {
        const tracking = trackingMap.get(trackingKey(task.lecture_id, task.type));
        const resolved = nextStatus(task, tracking, now, new Set());
        const previousTask = previousTaskMap.get(task.id);
        const alertTypes = chooseAlertTypes(
          { ...task, status: resolved.status } as TaskRecord,
          resolved.status,
          now,
          previousTask?.status as TaskStatus | undefined,
          new Set(), // alert_events not used for admin-batch
          options?.reminderType
        );

        if (alertTypes.length === 0) return [];

        return alertTypes.map((alertType) => ({
          taskId: task.id,
          lecture: {
            id: lecture.id,
            user_id: lecture.user_id,
            batch_name: lecture.batch_name,
            module_name: lecture.module_name,
            lecture_name: lecture.lecture_name,
            learning_objective: "",
            session_link: "",
            lecture_date: lecture.lecture_date,
            start_time: lecture.start_time,
            end_time: lecture.end_time
          },
          taskType: task.type as TaskType,
          alertType,
          deadline: task.deadline,
          completedAt: resolved.completedAt,
          statusAtSend: resolved.status
        }));
      })
    );

    const sentKeys = new Set(
      (existingAlerts ?? []).map((alert) => `${alert.task_id}:${alert.alert_type}`)
    );

    const ccAlertsToSend = ccCandidateAlerts.filter(
      (alert) => !sentKeys.has(`${alert.taskId}:${alert.alertType}`)
    );
    // Admin-batch alerts are already deduped via cache flags in previousTask.status check above.
    const alertsToSend = [...ccAlertsToSend, ...adminCandidateAlerts];

    const alertsSent = await sendSlackAlerts(alertsToSend, {
      mentionUserId: profile.slack_member_id
    });

    // Only persist alert_events for CC-configured lectures (tasks.id UUID FK).
    if (ccAlertsToSend.length > 0) {
      const { error: persistAlertError } = await supabase.from("alert_events").insert(
        ccAlertsToSend.map((alert) => ({
          task_id: alert.taskId,
          alert_type: alert.alertType
        }))
      );

      if (persistAlertError) {
        throw new Error(persistAlertError.message);
      }
    }

    const updatedTaskCount = (updatedCcTasks?.length ?? 0) + pathBLectures.flatMap((l) => l.tasks).length;
    summary.checkedLectures += allLectures.length;
    summary.trackedResources += mergedTrackingRecords.length;
    summary.updatedTasks += updatedTaskCount;
    summary.alertsSent += alertsSent;

    console.log(
      `${profile.email} (CC batches: ${lectures.length}, admin batches: ${pathBLectures.length}) => ${describeRun({
        checkedLectures: allLectures.length,
        trackedResources: mergedTrackingRecords.length,
        updatedTasks: updatedTaskCount,
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

/**
 * Syncs LMS resource status into the tasks table for all profiles (or a
 * specific user). Does NOT send any Slack alerts — use this before sending
 * a scheduled reminder so the DB reflects the latest LMS state.
 */
export async function syncTaskStatusesFromLms(userId?: string): Promise<{ updatedTasks: number; checkedLectures: number }> {
  const timezone = getAppTimezone();
  const now = DateTime.now().setZone(timezone);
  const supabase = createServerSupabase();
  const profiles = await getAutomationProfiles(userId);

  let totalUpdated = 0;
  let totalLectures = 0;

  for (const profile of profiles) {
    // === PATH A: CC self-configured lectures ===
    const lectures = await getAutomationLectures(profile.user_id);

    const batchUrlOverrides = Object.fromEntries(
      profile.batch_configs.map((config) => [
        config.batch_name,
        {
          lectures: config.lecture_batch_url,
          assignments: config.assignment_batch_url || deriveAssignmentBatchUrl(config.lecture_batch_url)
        }
      ])
    );

    const trackingRecords = await checkResourcesFromDb(lectures, batchUrlOverrides, now);

    // === PATH B: Admin-configured batch lectures from lms_lecture_cache ===
    const cacheLectures = await getCacheLecturesForProfile(profile.user_id);
    const pathALectureIds = new Set(lectures.map((l) => l.id));
    const uniqueCacheLectures = cacheLectures.filter((cl) => !pathALectureIds.has(cl.lectureId));

    // Skip only if both paths are empty
    if (lectures.length === 0 && uniqueCacheLectures.length === 0) {
      continue;
    }

    const pathBTracking: LmsTrackingRecord[] = [];
    for (const cl of uniqueCacheLectures) {
      let check;
      try {
        check = await checkLmsTasksForLecture(cl.lmsBatchId, cl.lecture_name, cl.lecture_date);
      } catch (err) {
        console.error(`[db-check] Cache lecture "${cl.lecture_name}" failed:`, err instanceof Error ? err.message : err);
        pathBTracking.push(
          { lectureId: cl.lectureId, resourceType: "preread", found: false, uploadedAt: null, rawPayload: { source: "lms-db", error: true } },
          { lectureId: cl.lectureId, resourceType: "notes", found: false, uploadedAt: null, rawPayload: { source: "lms-db", error: true } },
          { lectureId: cl.lectureId, resourceType: "assignment", found: false, uploadedAt: null, rawPayload: { source: "lms-db", error: true } }
        );
        continue;
      }

      const timezone = getAppTimezone();
      const toIso = (dtStr: string | null | undefined) => {
        if (!dtStr) return null;
        const dt = DateTime.fromFormat(dtStr, "yyyy-MM-dd HH:mm:ss", { zone: timezone });
        return dt.isValid ? dt.toISO() : null;
      };

      let lmsLectureId: number | undefined;
      if (check.session_link) {
        try {
          const lmsIdStr = new URL(check.session_link).searchParams.get("id");
          const parsed = lmsIdStr ? parseInt(lmsIdStr, 10) : NaN;
          if (!isNaN(parsed)) lmsLectureId = parsed;
        } catch { /* ignore */ }
      }
      // cl.lectureId is the LMS numeric lecture_id stored in lms_lecture_cache.
      // Use it as a fallback when session_link is absent or lacks an ?id= param
      // so syncFoundResourcesToCache can still update the cache row.
      if (!lmsLectureId) {
        const fallback = parseInt(cl.lectureId, 10);
        if (!isNaN(fallback)) lmsLectureId = fallback;
      }
      const base = { lmsBatchId: cl.lmsBatchId, lmsLectureId };

      pathBTracking.push(
        { lectureId: cl.lectureId, resourceType: "preread", found: check.preread, uploadedAt: check.preread ? toIso(check.preread_at) : null, rawPayload: { source: "lms-db" }, ...base },
        { lectureId: cl.lectureId, resourceType: "notes", found: check.notes, uploadedAt: check.notes ? toIso(check.notes_at) : null, rawPayload: { source: "lms-db" }, ...base },
        { lectureId: cl.lectureId, resourceType: "assignment", found: check.assignment, uploadedAt: check.assignment ? toIso(check.assignment_at) : null, rawPayload: { source: "lms-db" }, ...base }
      );
    }

    const pathBLectures: AutomationLecture[] = uniqueCacheLectures.map((cl) => ({
      id: cl.lectureId,
      user_id: cl.ccUserId,
      batch_name: cl.batch_name,
      module_name: cl.module_name,
      lecture_name: cl.lecture_name,
      learning_objective: "",
      session_link: "",
      lecture_date: cl.lecture_date,
      start_time: cl.start_time,
      end_time: cl.end_time,
      tasks: buildTaskRecordsFromCacheLecture(cl),
    }));

    const allLectures = [...lectures, ...pathBLectures];
    const allTrackingRecords = [...trackingRecords, ...pathBTracking];

    await syncFoundResourcesToCache(supabase, allTrackingRecords);

    // lms_tracking and tasks tables require uuid lecture_id FKs.
    // Admin-batch lectures use numeric LMS IDs — only write to those tables for CC lectures.
    const ccBatchLectureIds = new Set(lectures.map((l) => l.id));
    const ccLectureIdList = lectures.map((l) => l.id);
    const ccTaskIdList = lectures.flatMap((l) => l.tasks.map((t) => t.id));

    const [existingTrackingRows, existingAlerts] = await Promise.all([
      ccLectureIdList.length > 0
        ? supabase
            .from("lms_tracking")
            .select("lecture_id, resource_type, found, uploaded_at, raw_payload")
            .in("lecture_id", ccLectureIdList)
            .then((r) => r.data)
        : Promise.resolve([]),
      ccTaskIdList.length > 0
        ? supabase
            .from("alert_events")
            .select("task_id, alert_type")
            .in("task_id", ccTaskIdList)
            .then((r) => r.data)
        : Promise.resolve([])
    ]);

    const stickyCompletedTaskIds = new Set(
      (existingAlerts ?? [])
        .filter((a) => a.alert_type === "completed")
        .map((a) => a.task_id)
    );

    const existingTrackingMap = new Map(
      (existingTrackingRows ?? []).map((row) => [
        trackingKey(row.lecture_id, row.resource_type as TaskType),
        row
      ])
    );

    const scrapedTrackingMap = new Map(
      allTrackingRecords.map((r) => [trackingKey(r.lectureId, r.resourceType), r])
    );

    const mergedTrackingRecords = allLectures.flatMap((lecture) =>
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
            earliestTimestamp([
              record?.uploadedAt ?? null,
              existingRow?.uploaded_at ?? null,
              task.completed_at ?? null
            ]) ?? null,
          rawPayload: record?.rawPayload ?? ((existingRow?.raw_payload as Record<string, unknown> | null) ?? { scraperMissed: true })
        };
      })
    );

    const trackingMap = new Map<string, LmsTrackingRecord>();
    for (const r of mergedTrackingRecords) {
      trackingMap.set(trackingKey(r.lectureId, r.resourceType), r);
    }

    // Only persist tracking and tasks for CC-configured lectures (UUID IDs).
    const ccTrackingRecords = mergedTrackingRecords.filter((r) => ccBatchLectureIds.has(r.lectureId));
    if (ccTrackingRecords.length > 0) {
      await supabase.from("lms_tracking").upsert(
        ccTrackingRecords.map((r) => ({
          lecture_id: r.lectureId,
          resource_type: r.resourceType,
          found: r.found,
          uploaded_at: r.uploadedAt,
          checked_at: now.toISO(),
          raw_payload: r.rawPayload ?? {}
        })),
        { onConflict: "lecture_id,resource_type" }
      );
    }

    const ccTaskUpdates = allLectures
      .filter((l) => ccBatchLectureIds.has(l.id))
      .flatMap((lecture) =>
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
            last_checked_at: now.toISO()
          };
        })
      );

    const { data: updated } = ccTaskUpdates.length > 0
      ? await supabase.from("tasks").upsert(ccTaskUpdates, { onConflict: "id" }).select("id")
      : { data: [] };

    totalUpdated += updated?.length ?? 0;
    totalLectures += allLectures.length;

    console.log(`[lms-sync] ${profile.email}: CC batches: ${lectures.length}, admin batches: ${pathBLectures.length}, total lectures: ${allLectures.length}, updated ${updated?.length ?? 0} tasks`);
  }

  return { updatedTasks: totalUpdated, checkedLectures: totalLectures };
}

/**
 * Sync lms_lecture_cache for the given batch IDs using GREATEST semantics:
 * structural fields are always updated, compliance flags only move false→true (never true→false).
 *
 * Uses fetchBatchCompliance (association-based check — one query per batch) for speed.
 * Deep title/date-matching fallback is intentionally omitted here to keep this
 * fast enough for Vercel's function timeout; GitHub Actions handles the thorough check.
 */
export async function syncAssignedBatchesCache(
  batchIds: number[]
): Promise<{ batchesSynced: number; lecturesSynced: number }> {
  if (batchIds.length === 0) return { batchesSynced: 0, lecturesSynced: 0 };

  const supabase = createServerSupabase();
  let lecturesSynced = 0;

  for (const batchId of batchIds) {
    const lectures = await fetchBatchCompliance(batchId);
    if (lectures.length === 0) continue;

    // Upsert structural metadata (title, schedule, etc.) without touching flags.
    // On INSERT the flags default to false; on UPDATE they are left unchanged.
    // This ensures existing true flags are never overwritten with false.
    const { error: structErr } = await supabase.from("lms_lecture_cache").upsert(
      lectures.map((l) => ({
        batch_id: batchId,
        lecture_id: l.lecture_id,
        section_id: l.section_id ?? null,
        title: l.lecture_title,
        module: l.module ?? null,
        schedule: l.schedule ? mysqlDateToIST(l.schedule instanceof Date ? l.schedule : new Date(l.schedule)) : null,
        concludes: l.concludes ? mysqlDateToIST(l.concludes instanceof Date ? l.concludes : new Date(l.concludes)) : null,
        synced_at: nowIST()
        // Flags intentionally omitted — handled below via targeted true-only updates.
      })),
      { onConflict: "batch_id,lecture_id" }
    );

    if (structErr) throw new Error(`Batch ${batchId} cache upsert: ${structErr.message}`);

    // GREATEST pass: only promote flags false→true, never touch rows where all flags are false.
    for (const l of lectures) {
      const patch: Record<string, boolean> = {};
      if (l.preread_uploaded) patch.preread_uploaded = true;
      if (l.notes_uploaded) patch.notes_uploaded = true;
      if (l.assignment_uploaded) patch.assignment_uploaded = true;
      if (Object.keys(patch).length === 0) continue;

      const { error: flagErr } = await supabase
        .from("lms_lecture_cache")
        .update(patch)
        .eq("batch_id", batchId)
        .eq("lecture_id", l.lecture_id);

      if (flagErr) {
        console.warn(`[cache-sync] Flag update failed batch=${batchId} lecture=${l.lecture_id}: ${flagErr.message}`);
      }
    }

    lecturesSynced += lectures.length;
    console.log(`[cache-sync] Batch ${batchId}: ${lectures.length} lectures synced`);
  }

  return { batchesSynced: batchIds.length, lecturesSynced };
}
