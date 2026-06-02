import { DateTime } from "luxon";

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
        .select("cc_user_id, batch_name")
        .order("batch_name", { ascending: true }),
      supabase
        .from("lectures")
        .select("id, batch_name, module_name, lecture_name, tasks(id, lecture_id, type, deadline, status, completed_at)")
        .is("archived_at", null),
    ]);

  if (assignmentError) throw new Error(assignmentError.message);
  if (lectureError) throw new Error(lectureError.message);

  const ccIds = [...new Set((assignments ?? []).map((assignment) => assignment.cc_user_id).filter(Boolean))];
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

  for (const assignment of assignments ?? []) {
    ownerByBatch.set(normalizeBatchName(assignment.batch_name), assignment.cc_user_id);
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

  for (const assignment of assignments ?? []) {
    const domain = DOMAIN_BY_BATCH.get(normalizeBatchName(assignment.batch_name)) ?? "Unassigned";
    const domainReport = ensureDomainReport(domain);
    ensureCcReport(domainReport, assignment.cc_user_id, assignment.batch_name);
  }

  for (const lecture of lectures ?? []) {
    const batchName = lecture.batch_name as string;
    const domain = DOMAIN_BY_BATCH.get(normalizeBatchName(batchName)) ?? "Unassigned";
    const ccUserId = ownerByBatch.get(normalizeBatchName(batchName)) ?? null;

    for (const task of (lecture.tasks ?? []) as TaskRecord[]) {
      const deadline = DateTime.fromISO(task.deadline, { zone: "utc" }).setZone(timezone);
      if (!deadline.isValid) continue;

      const status = classifyTask(task, now);
      const domainReport = ensureDomainReport(domain);
      const ccReport = ensureCcReport(domainReport, ccUserId, batchName);
      const taskRow: DomainResourceTask = {
        id: task.id,
        domain,
        batchName,
        ccUserId,
        ccName: ccReport.ccName,
        ccEmail: ccReport.ccEmail,
        lectureName: lecture.lecture_name as string,
        moduleName: (lecture.module_name as string | null) ?? null,
        resourceType: task.type,
        deadline: task.deadline,
        completedAt: task.completed_at,
        status,
      };

      totalTasks += 1;
      countStatus(domainReport, status);
      countCcStatus(ccReport, status);
      ccReport.tasks.push(taskRow);
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
