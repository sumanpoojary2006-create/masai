import { DateTime } from "luxon";

import { computeDeadline } from "@/lib/deadlines";
import { getAppTimezone } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase";
import type { TaskRecord, TaskType } from "@/lib/types";

export type ResourceDomain = "Data" | "Non-Tech" | "Tech";
export type DomainResourceStatus = "completed" | "pending" | "late";

export interface DomainLead {
  domain: ResourceDomain;
  name: string;
  email: string;
}

export interface DomainResourceTask {
  id: string;
  domain: ResourceDomain | "Unassigned";
  batchName: string;
  ccUserId: string | null;
  ccName: string;
  ccEmail: string | null;
  lectureName: string;
  moduleName: string | null;
  resourceType: TaskType;
  deadline: string;
  completedAt: string | null;
  status: DomainResourceStatus;
}

export interface DomainCcReport {
  ccUserId: string | null;
  ccName: string;
  ccEmail: string | null;
  assignedBatches: string[];
  completed: number;
  pending: number;
  late: number;
  tasks: DomainResourceTask[];
}

export interface DomainReport {
  domain: ResourceDomain | "Unassigned";
  leadName: string | null;
  leadEmail: string | null;
  total: number;
  completed: number;
  pending: number;
  late: number;
  ccReports: DomainCcReport[];
}

export interface DomainResourcesReportData {
  reportDate: string;
  timezone: string;
  generatedAt: string;
  totalTasks: number;
  domains: DomainReport[];
}

const RESOURCE_TYPES: TaskType[] = ["preread", "notes", "assignment"];
const CACHE_PAGE_SIZE = 1000;

interface BatchAssignmentRow {
  cc_user_id: string;
  batch_id: number | null;
  batch_name: string;
}

interface LectureRow {
  id: string;
  batch_name: string;
  module_name: string | null;
  lecture_name: string;
  lecture_date: string | null;
  start_time: string | null;
  end_time: string | null;
  tasks?: TaskRecord[] | null;
}

interface LmsCacheRow {
  batch_id: number;
  lecture_id: number | string;
  title: string;
  module: string | null;
  schedule: string;
  concludes: string;
  preread_uploaded: boolean;
  notes_uploaded: boolean;
  assignment_uploaded: boolean;
  preread_uploaded_at?: string | null;
  notes_uploaded_at?: string | null;
  assignment_uploaded_at?: string | null;
}

const DOMAIN_LEADS: DomainLead[] = [
  { domain: "Data", name: "Nischitha", email: "sai.nischitha@masaischool.com" },
  { domain: "Non-Tech", name: "Krishnan", email: "krishnan.parameswaran@masaischool.com" },
  { domain: "Tech", name: "Venugopal Burli", email: "venugopal.burli@masaischool.com" },
];

const DOMAIN_BATCHES: Record<ResourceDomain, string[]> = {
  "Data": [
    "IITMD-DSAI-2508",
    "IITMD-RP",
    "BITSoM-BA-2512",
    "IITR-AIMLD-2511",
    "IITP-AIML-2506",
    "IITP-AIML-2510",
    "IITP-AIML-2601",
    "IITREICT-DSAI-2603",
    "IITP-AIML-2604",
    "IITREICT-DSAI-2605",
    "IIMSI-EDGE-2511",
    "MITIDSS-ML-2603",
    "IITREICT-AIML-2604",
    "IITREICT-DA-2604",
    "BITSoM-BA-2603",
    "IITG-AIML-2503",
    "IITGDS-2505",
    "IITP-AIMLT-2601",
    "IITP-AIMLM-2602",
    "IITP-AIMLH-2602",
    "IITP-AIMLTN-2602",
    "IITP-AIMLT-2603",
    "IITP-AIMLH-2605",
    "IITP-AIMLTN-2605",
    "IIMRC-BA-2604",
    "IITRPF-AAIT-2604",
    "IITRPF-AAITN-2604",
    "IITRPF-AAIH-2604",
    "IITRPF-AAIK-2604",
    "IITP-DA-2601",
  ],
  "Non-Tech": [
    "IIMSI-DM-2511",
    "IIMT-DM-2511",
    "IIMT-PM-2601",
    "IIMT-FTAI-2602",
    "IIMROH-DMAI-2603",
    "IITR-PM-2603",
    "FITT-EN-2604",
    "IIMROH-PMGM-2603",
    "IITP-PM-2510",
    "BITSoM-PM-2511",
    "BITSoM-PM-2601",
    "IITP-PM-2512",
    "BITSoM-FTAI-2601",
    "IITR-PM-2510",
    "IITR-PM-2512",
    "BITSoM-DM-2510",
    "IITR-PMH-2512",
    "IIMRC-DM-2605",
  ],
  "Tech": [
    "IITR-CYB-2510",
    "IITR-SE-2509 (1)",
    "IITR-SE-2509 (2)",
    "IITR-SE-2509 (3)",
    "IITR-AS-2601",
    "IITR-AS-260113",
    "IITP-SDAIENG-2602",
    "IITP-SDAI-2602",
    "IITP-SDAITAM-2602",
    "IITP-SDAIHIN-2602",
    "IITREICT-SE-2603",
    "IITR-AS-260313",
    "IITR-AS-2603",
  ],
};

const LEAD_BY_DOMAIN = new Map(DOMAIN_LEADS.map((lead) => [lead.domain, lead]));
const DOMAIN_BY_BATCH = new Map<string, ResourceDomain>();

for (const [domain, batches] of Object.entries(DOMAIN_BATCHES) as Array<[ResourceDomain, string[]]>) {
  for (const batch of batches) {
    DOMAIN_BY_BATCH.set(normalizeBatchName(batch), domain);
  }
}

function normalizeBatchName(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

function normalizeLectureName(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function formatNameFromEmail(email: string | null | undefined) {
  if (!email) return "Unassigned";
  return email
    .split("@")[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function resolveName(fullName: string | null | undefined, email: string | null | undefined) {
  return fullName?.trim() || formatNameFromEmail(email);
}

function classifyTask(task: TaskRecord, now: DateTime): DomainResourceStatus {
  if (task.status === "completed") return "completed";
  const deadline = DateTime.fromISO(task.deadline, { zone: "utc" });
  if (task.status === "missed") return "late";
  if (deadline.isValid && deadline.toMillis() < now.toMillis()) return "late";
  return "pending";
}

function countStatus(report: DomainReport, status: DomainResourceStatus) {
  report.total += 1;
  if (status === "completed") report.completed += 1;
  if (status === "pending") report.pending += 1;
  if (status === "late") report.late += 1;
}

function countCcStatus(report: DomainCcReport, status: DomainResourceStatus) {
  if (status === "completed") report.completed += 1;
  if (status === "pending") report.pending += 1;
  if (status === "late") report.late += 1;
}

export async function getDomainResourcesReportData(): Promise<DomainResourcesReportData> {
  const supabase = createServerSupabase();
  const timezone = getAppTimezone();
  const now = DateTime.now().setZone(timezone);
  const today = now.toISODate()!;
  let totalTasks = 0;

  const [{ data: assignments, error: assignmentError }, { data: lectures, error: lectureError }] =
    await Promise.all([
      supabase
        .from("cc_batch_assignments")
        .select("cc_user_id, batch_id, batch_name")
        .order("batch_name", { ascending: true }),
      supabase
        .from("lectures")
        .select("id, batch_name, module_name, lecture_name, lecture_date, start_time, end_time, tasks(id, lecture_id, type, deadline, status, completed_at)")
        .is("archived_at", null),
    ]);

  if (assignmentError) throw new Error(assignmentError.message);
  if (lectureError) throw new Error(lectureError.message);

  const assignmentRows = (assignments ?? []) as BatchAssignmentRow[];
  const lectureRows = (lectures ?? []) as LectureRow[];
  const assignedBatchIds = [...new Set(assignmentRows.map((assignment) => assignment.batch_id).filter((id): id is number => typeof id === "number"))];
  let cacheRows: LmsCacheRow[] = [];

  if (assignedBatchIds.length > 0) {
    for (let from = 0; ; from += CACHE_PAGE_SIZE) {
      const { data: cacheData, error: cacheError } = await supabase
        .from("lms_lecture_cache")
        .select(
          "batch_id, lecture_id, title, module, schedule, concludes, preread_uploaded, notes_uploaded, assignment_uploaded, preread_uploaded_at, notes_uploaded_at, assignment_uploaded_at"
        )
        .in("batch_id", assignedBatchIds)
        .order("schedule", { ascending: true })
        .range(from, from + CACHE_PAGE_SIZE - 1);

      if (cacheError) throw new Error(cacheError.message);

      const pageRows = (cacheData ?? []) as LmsCacheRow[];
      cacheRows.push(...pageRows);
      if (pageRows.length < CACHE_PAGE_SIZE) break;
    }
  }

  const ccIds = [...new Set(assignmentRows.map((assignment) => assignment.cc_user_id).filter(Boolean))];
  const profileMap = new Map<string, { email: string | null; name: string }>();

  if (ccIds.length > 0) {
    const { data: usersPage } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    for (const user of usersPage?.users ?? []) {
      if (!ccIds.includes(user.id)) continue;
      profileMap.set(user.id, {
        email: user.email ?? null,
        name: resolveName(user.user_metadata?.full_name as string | undefined, user.email),
      });
    }
  }

  const ownerByBatch = new Map<string, string>();
  const assignmentByBatchId = new Map<number, BatchAssignmentRow>();
  const configuredLectureByTitle = new Map<string, LectureRow>();

  for (const assignment of assignmentRows) {
    ownerByBatch.set(normalizeBatchName(assignment.batch_name), assignment.cc_user_id);
    if (typeof assignment.batch_id === "number") assignmentByBatchId.set(assignment.batch_id, assignment);
  }

  for (const lecture of lectureRows) {
    configuredLectureByTitle.set(
      `${normalizeBatchName(lecture.batch_name)}:${normalizeLectureName(lecture.lecture_name)}`,
      lecture
    );
  }

  const reportsByDomain = new Map<ResourceDomain | "Unassigned", DomainReport>();

  function ensureDomainReport(domain: ResourceDomain | "Unassigned") {
    const existing = reportsByDomain.get(domain);
    if (existing) return existing;

    const lead = domain === "Unassigned" ? null : LEAD_BY_DOMAIN.get(domain) ?? null;
    const report: DomainReport = {
      domain,
      leadName: lead?.name ?? null,
      leadEmail: lead?.email ?? null,
      total: 0,
      completed: 0,
      pending: 0,
      late: 0,
      ccReports: [],
    };
    reportsByDomain.set(domain, report);
    return report;
  }

  function ensureCcReport(report: DomainReport, ccUserId: string | null, batchName: string) {
    const key = ccUserId ?? "unassigned";
    const existing = report.ccReports.find((ccReport) => (ccReport.ccUserId ?? "unassigned") === key);
    if (existing) {
      if (!existing.assignedBatches.includes(batchName)) existing.assignedBatches.push(batchName);
      existing.assignedBatches.sort();
      return existing;
    }

    const profile = ccUserId ? profileMap.get(ccUserId) : null;
    const ccReport: DomainCcReport = {
      ccUserId,
      ccName: profile?.name ?? "Unassigned",
      ccEmail: profile?.email ?? null,
      assignedBatches: [batchName].sort(),
      completed: 0,
      pending: 0,
      late: 0,
      tasks: [],
    };
    report.ccReports.push(ccReport);
    return ccReport;
  }

  function addTaskRow(params: {
    id: string;
    domain: ResourceDomain | "Unassigned";
    batchName: string;
    ccUserId: string | null;
    lectureName: string;
    moduleName: string | null;
    resourceType: TaskType;
    deadline: string;
    completedAt: string | null;
    status: DomainResourceStatus;
  }) {
    const domainReport = ensureDomainReport(params.domain);
    const ccReport = ensureCcReport(domainReport, params.ccUserId, params.batchName);
    const taskRow: DomainResourceTask = {
      id: params.id,
      domain: params.domain,
      batchName: params.batchName,
      ccUserId: params.ccUserId,
      ccName: ccReport.ccName,
      ccEmail: ccReport.ccEmail,
      lectureName: params.lectureName,
      moduleName: params.moduleName,
      resourceType: params.resourceType,
      deadline: params.deadline,
      completedAt: params.completedAt,
      status: params.status,
    };

    totalTasks += 1;
    countStatus(domainReport, params.status);
    countCcStatus(ccReport, params.status);
    ccReport.tasks.push(taskRow);
  }

  for (const assignment of assignmentRows) {
    const domain = DOMAIN_BY_BATCH.get(normalizeBatchName(assignment.batch_name)) ?? "Unassigned";
    const domainReport = ensureDomainReport(domain);
    ensureCcReport(domainReport, assignment.cc_user_id, assignment.batch_name);
  }

  const persistedTaskKeys = new Set<string>();

  for (const lecture of lectureRows) {
    const batchName = lecture.batch_name as string;
    const domain = DOMAIN_BY_BATCH.get(normalizeBatchName(batchName)) ?? "Unassigned";
    const ccUserId = ownerByBatch.get(normalizeBatchName(batchName)) ?? null;

    for (const task of (lecture.tasks ?? []) as TaskRecord[]) {
      const deadline = DateTime.fromISO(task.deadline, { zone: "utc" }).setZone(timezone);
      if (!deadline.isValid) continue;

      const status = classifyTask(task, now);
      persistedTaskKeys.add(`${normalizeBatchName(batchName)}:${lecture.id}:${task.type}`);
      addTaskRow({
        id: task.id,
        domain,
        batchName,
        ccUserId,
        lectureName: lecture.lecture_name as string,
        moduleName: (lecture.module_name as string | null) ?? null,
        resourceType: task.type,
        deadline: task.deadline,
        completedAt: task.completed_at,
        status,
      });
    }
  }

  for (const cacheRow of cacheRows) {
    const assignment = assignmentByBatchId.get(cacheRow.batch_id);
    if (!assignment) continue;

    const batchName = assignment.batch_name;
    const configuredLecture = configuredLectureByTitle.get(
      `${normalizeBatchName(batchName)}:${normalizeLectureName(cacheRow.title)}`
    );
    if (!configuredLecture) continue;

    const schedule = DateTime.fromISO(cacheRow.schedule).setZone(timezone);
    const concludes = DateTime.fromISO(cacheRow.concludes).setZone(timezone);
    if (!schedule.isValid || !concludes.isValid) continue;

    const domain = DOMAIN_BY_BATCH.get(normalizeBatchName(batchName)) ?? "Unassigned";
    const lectureId = String(cacheRow.lecture_id);
    const lectureDate = configuredLecture.lecture_date ?? schedule.toISODate();
    if (!lectureDate) continue;

    const startTime = configuredLecture.start_time ?? schedule.toFormat("HH:mm:ss");
    const endTime = configuredLecture.end_time ?? concludes.toFormat("HH:mm:ss");
    const uploadedByType: Record<TaskType, { uploaded: boolean; uploadedAt: string | null }> = {
      preread: { uploaded: cacheRow.preread_uploaded, uploadedAt: cacheRow.preread_uploaded_at ?? null },
      notes: { uploaded: cacheRow.notes_uploaded, uploadedAt: cacheRow.notes_uploaded_at ?? null },
      assignment: { uploaded: cacheRow.assignment_uploaded, uploadedAt: cacheRow.assignment_uploaded_at ?? null },
    };

    for (const resourceType of RESOURCE_TYPES) {
      const taskKey = `${normalizeBatchName(batchName)}:${configuredLecture.id}:${resourceType}`;
      if (persistedTaskKeys.has(taskKey)) continue;

      const deadline = computeDeadline(resourceType, lectureDate, startTime, endTime);
      const cachedTask: TaskRecord = {
        id: `${lectureId}-${resourceType}`,
        lecture_id: lectureId,
        type: resourceType,
        deadline,
        status: uploadedByType[resourceType].uploaded ? "completed" : "pending",
        completed_at: uploadedByType[resourceType].uploadedAt,
      };

      addTaskRow({
        id: `cache-${cacheRow.batch_id}-${configuredLecture.id}-${resourceType}`,
        domain,
        batchName,
        ccUserId: assignment.cc_user_id,
        lectureName: configuredLecture.lecture_name,
        moduleName: configuredLecture.module_name ?? cacheRow.module,
        resourceType,
        deadline,
        completedAt: cachedTask.completed_at,
        status: classifyTask(cachedTask, now),
      });
    }
  }

  for (const domain of ["Data", "Non-Tech", "Tech"] as ResourceDomain[]) {
    ensureDomainReport(domain);
  }

  const domainOrder = new Map<ResourceDomain | "Unassigned", number>([
    ["Data", 0],
    ["Non-Tech", 1],
    ["Tech", 2],
    ["Unassigned", 3],
  ]);

  return {
    reportDate: today,
    timezone,
    generatedAt: now.toISO() ?? new Date().toISOString(),
    totalTasks,
    domains: [...reportsByDomain.values()]
      .filter((report) => report.total > 0 || report.domain !== "Unassigned")
      .map((report) => ({
        ...report,
        ccReports: report.ccReports
          .map((ccReport) => ({
            ...ccReport,
            tasks: ccReport.tasks.sort((left, right) =>
              left.deadline.localeCompare(right.deadline) || left.batchName.localeCompare(right.batchName)
            ),
          }))
          .sort((left, right) => right.late - left.late || right.pending - left.pending || left.ccName.localeCompare(right.ccName)),
      }))
      .sort((left, right) => (domainOrder.get(left.domain) ?? 99) - (domainOrder.get(right.domain) ?? 99)),
  };
}
