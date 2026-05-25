import { DateTime } from "luxon";

import { getAppTimezone } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase";
import { TaskRecord, TaskType } from "@/lib/types";

const RESOURCE_TYPES: TaskType[] = ["preread", "notes", "assignment"];

type ResourceOutcome = "on_time" | "late" | "pending" | "missing";

type ResourceRollup = {
  onTime: number;
  late: number;
  pending: number;
  released: number;
  tracked: number;
};

export interface ResourceMetricBreakdown {
  preread: number;
  notes: number;
  assignment: number;
}

export interface ResourcesDashboardSummary {
  totalBatches: number;
  totalCoordinators: number;
  totalResourcesReleased: number;
  trackedResources: number;
  onTimeCount: number;
  lateCount: number;
  pendingCount: number;
  onTimeRate: number;
  lateRate: number;
  overallPerformance: number;
  releasedByType: ResourceMetricBreakdown;
}

export interface ResourceLeaderboardRow {
  coordinatorId?: string;
  coordinatorName: string;
  coordinatorEmail: string | null;
  assignedBatches: string[];
  onTimeReleases: number;
  lateReleases: number;
  pendingResources: number;
  trackedResources: number;
  perfectRate: number;
}

export interface BatchLeaderboardRow {
  batchName: string;
  coordinatorNames: string[];
  onTimeResources: number;
  lateResources: number;
  pendingResources: number;
  trackedResources: number;
  perfectRate: number;
}

export interface ResourcesDashboardData {
  summary: ResourcesDashboardSummary;
  ccLeaderboard: ResourceLeaderboardRow[];
  batchLeaderboard: BatchLeaderboardRow[];
  lastUpdatedAt: string;
}

function createRollup(): ResourceRollup {
  return { onTime: 0, late: 0, pending: 0, released: 0, tracked: 0 };
}

function createTypeBreakdown(): ResourceMetricBreakdown {
  return { preread: 0, notes: 0, assignment: 0 };
}

function computePerfectRate(onTimeCount: number, lateCount: number) {
  const scored = onTimeCount + lateCount;
  return scored === 0 ? 0 : Math.round((onTimeCount / scored) * 100);
}

function formatNameFromEmail(email: string | null | undefined) {
  if (!email) return "Unassigned";
  const localPart = email.split("@")[0] ?? email;
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function resolveName(fullName: string | null | undefined, email: string | null | undefined) {
  if (fullName?.trim()) return fullName.trim();
  return formatNameFromEmail(email);
}

function classifyTask(task: TaskRecord | null, now: DateTime): ResourceOutcome {
  if (!task) return "missing";

  const deadline = DateTime.fromISO(task.deadline, { zone: "utc" });
  const completedAt = task.completed_at
    ? DateTime.fromISO(task.completed_at, { zone: "utc" })
    : null;

  if (task.status === "completed") {
    if (completedAt?.isValid && deadline.isValid && completedAt.toMillis() <= deadline.toMillis()) {
      return "on_time";
    }
    return "late";
  }

  if (task.status === "missed") return "late";
  if (deadline.isValid && deadline.toMillis() < now.toMillis()) return "late";
  return "pending";
}

function applyOutcome(rollup: ResourceRollup, task: TaskRecord, outcome: ResourceOutcome) {
  rollup.tracked += 1;
  if (task.status === "completed") rollup.released += 1;
  if (outcome === "on_time") { rollup.onTime += 1; return; }
  if (outcome === "late") { rollup.late += 1; return; }
  if (outcome === "pending") rollup.pending += 1;
}

type CoordinatorAccumulator = {
  coordinatorId?: string;
  coordinatorName: string;
  coordinatorEmail: string | null;
  assignedBatches: Set<string>;
  rollup: ResourceRollup;
};

type BatchAccumulator = {
  batchName: string;
  coordinatorNames: Set<string>;
  rollup: ResourceRollup;
};

function sortByPercentage<T extends { perfectRate: number }>(
  left: T, right: T,
  leftOnTime: number, rightOnTime: number,
  leftLate: number, rightLate: number,
) {
  if (right.perfectRate !== left.perfectRate) return right.perfectRate - left.perfectRate;
  if (rightOnTime !== leftOnTime) return rightOnTime - leftOnTime;
  return leftLate - rightLate;
}

export async function getResourcesDashboardData(): Promise<ResourcesDashboardData> {
  const supabase = createServerSupabase();
  const timezone = getAppTimezone();
  const now = DateTime.now().setZone(timezone).toUTC();

  // Load CC assignments from the new table and lectures in parallel
  const [{ data: ccAssignments, error: assignError }, { data: lectures, error: lectureError }] =
    await Promise.all([
      supabase
        .from("cc_batch_assignments")
        .select("cc_user_id, batch_name, batch_program")
        .order("batch_name", { ascending: true }),
      supabase
        .from("lectures")
        .select("id, batch_name, tasks(id, lecture_id, type, deadline, status, completed_at)")
        .is("archived_at", null),
    ]);

  if (assignError) throw new Error(assignError.message);
  if (lectureError) throw new Error(lectureError.message);

  // Resolve CC names/emails from auth admin API
  const profileMap = new Map<string, { email: string | null; fullName: string }>();
  const ccUserIds = [...new Set((ccAssignments ?? []).map((a) => a.cc_user_id))];

  if (ccUserIds.length > 0) {
    const { data: usersPage } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    for (const u of usersPage?.users ?? []) {
      if (ccUserIds.includes(u.id)) {
        profileMap.set(u.id, {
          email: u.email ?? null,
          fullName: resolveName(u.user_metadata?.full_name as string | undefined, u.email),
        });
      }
    }
  }

  // Build batch → CC lookup maps
  const ownerByBatch = new Map<string, string>(); // batch_name → cc_user_id
  const assignedBatchesByUser = new Map<string, Set<string>>();

  for (const a of ccAssignments ?? []) {
    ownerByBatch.set(a.batch_name, a.cc_user_id);
    const batchSet = assignedBatchesByUser.get(a.cc_user_id) ?? new Set<string>();
    batchSet.add(a.batch_name);
    assignedBatchesByUser.set(a.cc_user_id, batchSet);
  }

  const coordinatorAccumulators = new Map<string, CoordinatorAccumulator>();
  const batchAccumulators = new Map<string, BatchAccumulator>();
  const overallRollup = createRollup();
  const releasedByType = createTypeBreakdown();
  const allBatchNames = new Set<string>();

  function ensureCoordinator(ccUserId: string | null | undefined, fallbackBatchName?: string) {
    const key = ccUserId ?? (fallbackBatchName ? `unassigned:${fallbackBatchName}` : "unassigned");
    const existing = coordinatorAccumulators.get(key);
    if (existing) return existing;

    const profile = ccUserId ? profileMap.get(ccUserId) : null;
    const accumulator: CoordinatorAccumulator = {
      coordinatorId: ccUserId ?? undefined,
      coordinatorName: profile?.fullName ?? "Unassigned",
      coordinatorEmail: profile?.email ?? null,
      assignedBatches: new Set(assignedBatchesByUser.get(ccUserId ?? "") ?? []),
      rollup: createRollup(),
    };

    if (!ccUserId && fallbackBatchName) {
      accumulator.assignedBatches.add(fallbackBatchName);
    }

    coordinatorAccumulators.set(key, accumulator);
    return accumulator;
  }

  // Seed coordinator accumulators for all assigned CCs (even those with no lectures yet)
  for (const userId of assignedBatchesByUser.keys()) {
    ensureCoordinator(userId);
  }

  // Process lectures
  for (const lecture of lectures ?? []) {
    const batchName = lecture.batch_name;
    allBatchNames.add(batchName);

    // Look up owning CC by batch name (new assignment model)
    const ccUserId = ownerByBatch.get(batchName) ?? null;
    const coordinatorAccumulator = ensureCoordinator(ccUserId, batchName);
    coordinatorAccumulator.assignedBatches.add(batchName);

    const batchAccumulator: BatchAccumulator = batchAccumulators.get(batchName) ?? {
      batchName,
      coordinatorNames: new Set<string>(),
      rollup: createRollup(),
    };
    batchAccumulators.set(batchName, batchAccumulator);
    batchAccumulator.coordinatorNames.add(coordinatorAccumulator.coordinatorName);

    const taskMap = new Map<TaskType, TaskRecord>();
    for (const task of (lecture.tasks ?? []) as TaskRecord[]) {
      if (!taskMap.has(task.type)) taskMap.set(task.type, task);
    }

    for (const type of RESOURCE_TYPES) {
      const task = taskMap.get(type) ?? null;
      if (!task) continue;

      const outcome = classifyTask(task, now);
      applyOutcome(overallRollup, task, outcome);
      applyOutcome(batchAccumulator.rollup, task, outcome);
      applyOutcome(coordinatorAccumulator.rollup, task, outcome);

      if (task.status === "completed") releasedByType[type] += 1;
    }
  }

  // Seed batch accumulators for assigned batches that have no lectures yet
  for (const [batchName, ccUserId] of ownerByBatch.entries()) {
    allBatchNames.add(batchName);
    if (!batchAccumulators.has(batchName)) {
      const profile = profileMap.get(ccUserId);
      batchAccumulators.set(batchName, {
        batchName,
        coordinatorNames: new Set([profile?.fullName ?? "Unassigned"]),
        rollup: createRollup(),
      });
    }
  }

  const ccLeaderboard = Array.from(coordinatorAccumulators.values())
    .map((c) => ({
      coordinatorId: c.coordinatorId,
      coordinatorName: c.coordinatorName,
      coordinatorEmail: c.coordinatorEmail,
      assignedBatches: [...c.assignedBatches].sort(),
      onTimeReleases: c.rollup.onTime,
      lateReleases: c.rollup.late,
      pendingResources: c.rollup.pending,
      trackedResources: c.rollup.tracked,
      perfectRate: computePerfectRate(c.rollup.onTime, c.rollup.late),
    }))
    .sort((l, r) =>
      sortByPercentage(l, r, l.onTimeReleases, r.onTimeReleases, l.lateReleases, r.lateReleases) ||
      l.coordinatorName.localeCompare(r.coordinatorName),
    );

  const batchLeaderboard = Array.from(batchAccumulators.values())
    .map((b) => ({
      batchName: b.batchName,
      coordinatorNames: [...b.coordinatorNames].filter(Boolean).sort(),
      onTimeResources: b.rollup.onTime,
      lateResources: b.rollup.late,
      pendingResources: b.rollup.pending,
      trackedResources: b.rollup.tracked,
      perfectRate: computePerfectRate(b.rollup.onTime, b.rollup.late),
    }))
    .sort((l, r) =>
      sortByPercentage(l, r, l.onTimeResources, r.onTimeResources, l.lateResources, r.lateResources) ||
      l.batchName.localeCompare(r.batchName),
    );

  const scoredResources = overallRollup.onTime + overallRollup.late;
  const overallPerformance =
    scoredResources > 0 ? Math.round((overallRollup.onTime / scoredResources) * 100) : 0;

  return {
    summary: {
      totalBatches: allBatchNames.size,
      totalCoordinators: ccLeaderboard.length,
      totalResourcesReleased: overallRollup.released,
      trackedResources: overallRollup.tracked,
      onTimeCount: overallRollup.onTime,
      lateCount: overallRollup.late,
      pendingCount: overallRollup.pending,
      onTimeRate: scoredResources > 0 ? Math.round((overallRollup.onTime / scoredResources) * 100) : 0,
      lateRate: scoredResources > 0 ? Math.round((overallRollup.late / scoredResources) * 100) : 0,
      overallPerformance,
      releasedByType,
    },
    ccLeaderboard,
    batchLeaderboard,
    lastUpdatedAt: now.toISO() ?? new Date().toISOString(),
  };
}
