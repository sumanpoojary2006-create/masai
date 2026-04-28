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

export interface CoordinatorMappingRow {
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

export interface ResourcesDashboardData {
  summary: ResourcesDashboardSummary;
  ccLeaderboard: ResourceLeaderboardRow[];
  batchLeaderboard: BatchLeaderboardRow[];
  ccMapping: CoordinatorMappingRow[];
  lastUpdatedAt: string;
}

function createRollup(): ResourceRollup {
  return {
    onTime: 0,
    late: 0,
    pending: 0,
    released: 0,
    tracked: 0
  };
}

function createTypeBreakdown(): ResourceMetricBreakdown {
  return {
    preread: 0,
    notes: 0,
    assignment: 0
  };
}

function computePerfectRate(onTimeCount: number, lateCount: number) {
  const scored = onTimeCount + lateCount;
  if (scored === 0) {
    return 0;
  }

  return Math.round((onTimeCount / scored) * 100);
}

function formatCoordinatorName(email: string | null | undefined) {
  if (!email) {
    return "Unassigned";
  }

  const localPart = email.split("@")[0] ?? email;
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function classifyTask(task: TaskRecord | null, now: DateTime): ResourceOutcome {
  if (!task) {
    return "missing";
  }

  const deadline = DateTime.fromISO(task.deadline, { zone: "utc" });
  const completedAt = task.completed_at
    ? DateTime.fromISO(task.completed_at, { zone: "utc" })
    : null;

  if (task.status === "completed") {
    if (
      completedAt &&
      completedAt.isValid &&
      deadline.isValid &&
      completedAt.toMillis() <= deadline.toMillis()
    ) {
      return "on_time";
    }

    return "late";
  }

  if (task.status === "missed") {
    return "late";
  }

  if (deadline.isValid && deadline.toMillis() < now.toMillis()) {
    return "late";
  }

  return "pending";
}

function applyOutcome(rollup: ResourceRollup, task: TaskRecord, outcome: ResourceOutcome) {
  rollup.tracked += 1;

  if (task.status === "completed") {
    rollup.released += 1;
  }

  if (outcome === "on_time") {
    rollup.onTime += 1;
    return;
  }

  if (outcome === "late") {
    rollup.late += 1;
    return;
  }

  if (outcome === "pending") {
    rollup.pending += 1;
  }
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
  left: T,
  right: T,
  leftOnTime: number,
  rightOnTime: number,
  leftLate: number,
  rightLate: number
) {
  if (right.perfectRate !== left.perfectRate) {
    return right.perfectRate - left.perfectRate;
  }

  if (rightOnTime !== leftOnTime) {
    return rightOnTime - leftOnTime;
  }

  return leftLate - rightLate;
}

export async function getResourcesDashboardData(): Promise<ResourcesDashboardData> {
  const supabase = createServerSupabase();
  const timezone = getAppTimezone();
  const now = DateTime.now().setZone(timezone).toUTC();

  const [{ data: batchConfigs, error: configError }, { data: lectures, error: lectureError }] =
    await Promise.all([
      supabase
        .from("user_batch_configs")
        .select("user_id, batch_name")
        .order("batch_name", { ascending: true }),
      supabase
        .from("lectures")
        .select("id, user_id, batch_name, tasks(id, lecture_id, type, deadline, status, completed_at)")
        .is("archived_at", null)
    ]);

  if (configError) {
    throw new Error(configError.message);
  }

  if (lectureError) {
    throw new Error(lectureError.message);
  }

  const relevantUserIds = [
    ...new Set([
      ...(batchConfigs ?? []).map((config) => config.user_id),
      ...(lectures ?? []).map((lecture) => lecture.user_id).filter(Boolean)
    ])
  ];

  const { data: profiles, error: profileError } =
    relevantUserIds.length > 0
      ? await supabase
          .from("user_profiles")
          .select("user_id, email, onboarding_complete")
          .in("user_id", relevantUserIds)
      : { data: [], error: null };

  if (profileError) {
    throw new Error(profileError.message);
  }

  const profileMap = new Map<string, { email: string | null; onboardingComplete: boolean }>(
    (profiles ?? []).map((profile) => [
      profile.user_id,
      {
        email: profile.email ?? null,
        onboardingComplete: Boolean(profile.onboarding_complete)
      }
    ])
  );

  const assignedBatchesByUser = new Map<string, Set<string>>();
  const ownerNamesByBatch = new Map<string, Set<string>>();

  for (const config of batchConfigs ?? []) {
    const batchSet = assignedBatchesByUser.get(config.user_id) ?? new Set<string>();
    batchSet.add(config.batch_name);
    assignedBatchesByUser.set(config.user_id, batchSet);

    const ownerNames = ownerNamesByBatch.get(config.batch_name) ?? new Set<string>();
    ownerNames.add(formatCoordinatorName(profileMap.get(config.user_id)?.email ?? null));
    ownerNamesByBatch.set(config.batch_name, ownerNames);
  }

  const coordinatorAccumulators = new Map<string, CoordinatorAccumulator>();
  const batchAccumulators = new Map<string, BatchAccumulator>();
  const overallRollup = createRollup();
  const releasedByType = createTypeBreakdown();
  const allBatchNames = new Set<string>();

  function ensureCoordinator(userId: string | null | undefined, fallbackBatchName?: string) {
    const key = userId ?? (fallbackBatchName ? `unassigned:${fallbackBatchName}` : "unassigned");
    const existing = coordinatorAccumulators.get(key);

    if (existing) {
      return existing;
    }

    const email = userId ? profileMap.get(userId)?.email ?? null : null;
    const accumulator: CoordinatorAccumulator = {
      coordinatorId: userId ?? undefined,
      coordinatorName: formatCoordinatorName(email),
      coordinatorEmail: email,
      assignedBatches: new Set(assignedBatchesByUser.get(userId ?? "") ?? []),
      rollup: createRollup()
    };

    if (!userId && fallbackBatchName) {
      accumulator.assignedBatches.add(fallbackBatchName);
    }

    coordinatorAccumulators.set(key, accumulator);
    return accumulator;
  }

  for (const userId of assignedBatchesByUser.keys()) {
    ensureCoordinator(userId);
  }

  for (const lecture of lectures ?? []) {
    const batchName = lecture.batch_name;
    allBatchNames.add(batchName);

    const batchAccumulator = batchAccumulators.get(batchName) ?? {
      batchName,
      coordinatorNames: new Set(ownerNamesByBatch.get(batchName) ?? []),
      rollup: createRollup()
    };
    batchAccumulators.set(batchName, batchAccumulator);

    const coordinatorAccumulator = ensureCoordinator(lecture.user_id, batchName);
    coordinatorAccumulator.assignedBatches.add(batchName);
    batchAccumulator.coordinatorNames.add(coordinatorAccumulator.coordinatorName);

    const taskMap = new Map<TaskType, TaskRecord>();
    for (const task of ((lecture.tasks ?? []) as TaskRecord[])) {
      if (!taskMap.has(task.type)) {
        taskMap.set(task.type, task);
      }
    }

    for (const type of RESOURCE_TYPES) {
      const task = taskMap.get(type) ?? null;
      if (!task) {
        continue;
      }

      const outcome = classifyTask(task, now);
      applyOutcome(overallRollup, task, outcome);
      applyOutcome(batchAccumulator.rollup, task, outcome);
      applyOutcome(coordinatorAccumulator.rollup, task, outcome);

      if (task.status === "completed") {
        releasedByType[type] += 1;
      }
    }
  }

  for (const batchName of ownerNamesByBatch.keys()) {
    allBatchNames.add(batchName);
    if (!batchAccumulators.has(batchName)) {
      batchAccumulators.set(batchName, {
        batchName,
        coordinatorNames: new Set(ownerNamesByBatch.get(batchName) ?? []),
        rollup: createRollup()
      });
    }
  }

  const ccLeaderboard = Array.from(coordinatorAccumulators.values())
    .map((coordinator) => ({
      coordinatorId: coordinator.coordinatorId,
      coordinatorName: coordinator.coordinatorName,
      coordinatorEmail: coordinator.coordinatorEmail,
      assignedBatches: [...coordinator.assignedBatches].sort(),
      onTimeReleases: coordinator.rollup.onTime,
      lateReleases: coordinator.rollup.late,
      pendingResources: coordinator.rollup.pending,
      trackedResources: coordinator.rollup.tracked,
      perfectRate: computePerfectRate(coordinator.rollup.onTime, coordinator.rollup.late)
    }))
    .sort((left, right) =>
      sortByPercentage(
        left,
        right,
        left.onTimeReleases,
        right.onTimeReleases,
        left.lateReleases,
        right.lateReleases
      ) || left.coordinatorName.localeCompare(right.coordinatorName)
    );

  const batchLeaderboard = Array.from(batchAccumulators.values())
    .map((batch) => ({
      batchName: batch.batchName,
      coordinatorNames: [...batch.coordinatorNames].filter(Boolean).sort(),
      onTimeResources: batch.rollup.onTime,
      lateResources: batch.rollup.late,
      pendingResources: batch.rollup.pending,
      trackedResources: batch.rollup.tracked,
      perfectRate: computePerfectRate(batch.rollup.onTime, batch.rollup.late)
    }))
    .sort((left, right) =>
      sortByPercentage(
        left,
        right,
        left.onTimeResources,
        right.onTimeResources,
        left.lateResources,
        right.lateResources
      ) || left.batchName.localeCompare(right.batchName)
    );

  const ccMapping = ccLeaderboard.map((coordinator) => ({
    coordinatorId: coordinator.coordinatorId,
    coordinatorName: coordinator.coordinatorName,
    coordinatorEmail: coordinator.coordinatorEmail,
    assignedBatches: coordinator.assignedBatches,
    onTimeReleases: coordinator.onTimeReleases,
    lateReleases: coordinator.lateReleases,
    pendingResources: coordinator.pendingResources,
    trackedResources: coordinator.trackedResources,
    perfectRate: coordinator.perfectRate
  }));

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
      releasedByType
    },
    ccLeaderboard,
    batchLeaderboard,
    ccMapping,
    lastUpdatedAt: now.toISO() ?? new Date().toISOString()
  };
}
