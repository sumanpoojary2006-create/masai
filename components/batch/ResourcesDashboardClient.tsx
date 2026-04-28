'use client'

import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState
} from "react";
import { DateTime } from "luxon";

import type {
  BatchLeaderboardRow,
  CoordinatorMappingRow,
  ResourceLeaderboardRow,
  ResourcesDashboardData
} from "@/lib/resources-dashboard";

type DashboardTab = "dashboard" | "ccLeaderboard" | "batchLeaderboard" | "ccMapping";

const SIDEBAR_TABS: Array<{ key: DashboardTab; label: string; eyebrow: string }> = [
  { key: "dashboard", label: "Dashboard", eyebrow: "Overview" },
  { key: "ccLeaderboard", label: "CC Leaderboard", eyebrow: "Ranking" },
  { key: "batchLeaderboard", label: "Batch Leaderboard", eyebrow: "Discipline" },
  { key: "ccMapping", label: "CC Mapping", eyebrow: "Ownership" }
];

const RESOURCE_LABELS = {
  preread: "Pre-read",
  notes: "Lecture Notes",
  assignment: "Assignments"
} as const;

const REFRESH_INTERVAL_MS = 60_000;
const TZ = "Asia/Kolkata";

function clsx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) {
    return "Unavailable";
  }

  const value = DateTime.fromISO(iso, { zone: "utc" }).setZone(TZ);
  if (!value.isValid) {
    return "Unavailable";
  }

  return value.toFormat("dd LLL yyyy, hh:mm a");
}

function formatScore(score: number) {
  return score > 0 ? `+${score}` : `${score}`;
}

function rankTone(rank: number) {
  if (rank === 0) {
    return "border-amber-400/40 bg-amber-500/15 text-amber-200";
  }

  if (rank === 1) {
    return "border-slate-500/50 bg-slate-500/15 text-slate-200";
  }

  if (rank === 2) {
    return "border-orange-500/40 bg-orange-500/15 text-orange-200";
  }

  return "border-slate-700/80 bg-slate-900/70 text-slate-300";
}

function Panel({
  title,
  subtitle,
  children,
  className
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={clsx(
        "rounded-[26px] border border-slate-800/90 bg-[linear-gradient(180deg,rgba(9,14,24,0.98),rgba(4,8,15,0.98))] p-5 shadow-[0_24px_70px_rgba(2,6,23,0.34)]",
        className
      )}
    >
      <div className="mb-4">
        <h3 className="text-base font-semibold text-white">{title}</h3>
        {subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function MetricCard({
  label,
  value,
  note,
  accent
}: {
  label: string;
  value: string | number;
  note: string;
  accent: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-[24px] border border-slate-800/80 bg-slate-950/85 p-5">
      <div className={clsx("absolute inset-x-0 top-0 h-1", accent)} />
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-2 text-sm text-slate-400">{note}</p>
    </div>
  );
}

function LegendDot({ className }: { className: string }) {
  return <span className={clsx("h-2.5 w-2.5 rounded-full", className)} />;
}

function StackedBar({
  onTime,
  late,
  pending
}: {
  onTime: number;
  late: number;
  pending: number;
}) {
  const total = Math.max(onTime + late + pending, 1);
  return (
    <div className="h-3 overflow-hidden rounded-full bg-slate-900/90">
      <div className="flex h-full">
        <div className="bg-emerald-400" style={{ width: `${(onTime / total) * 100}%` }} />
        <div className="bg-rose-400" style={{ width: `${(late / total) * 100}%` }} />
        <div className="bg-amber-300" style={{ width: `${(pending / total) * 100}%` }} />
      </div>
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  tone,
  helper
}: {
  label: string;
  value: number;
  max: number;
  tone: string;
  helper: string;
}) {
  const pct = max > 0 ? Math.max((value / max) * 100, value > 0 ? 6 : 0) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-200">{label}</p>
          <p className="text-xs text-slate-500">{helper}</p>
        </div>
        <p className="text-sm font-semibold text-white">{value}</p>
      </div>
      <div className="h-2.5 rounded-full bg-slate-900/90">
        <div className={clsx("h-full rounded-full", tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ScorePill({ score }: { score: number }) {
  const tone =
    score >= 40
      ? "border-emerald-400/30 bg-emerald-500/12 text-emerald-200"
      : score >= 0
        ? "border-amber-400/30 bg-amber-500/12 text-amber-100"
        : "border-rose-400/30 bg-rose-500/12 text-rose-200";

  return (
    <span className={clsx("inline-flex rounded-full border px-3 py-1 text-xs font-semibold", tone)}>
      {formatScore(score)}
    </span>
  );
}

function TableHeader({ columns }: { columns: string[] }) {
  return (
    <thead className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur">
      <tr className="border-b border-slate-800/90">
        {columns.map((column) => (
          <th
            key={column}
            className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500"
          >
            {column}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[24px] border border-dashed border-slate-700/80 bg-slate-950/70 px-6 py-10 text-center">
      <p className="text-sm font-semibold text-slate-200">{title}</p>
      <p className="mt-2 text-sm text-slate-500">{body}</p>
    </div>
  );
}

function LeaderboardTable({
  rows,
  type
}: {
  rows: ResourceLeaderboardRow[] | BatchLeaderboardRow[];
  type: "cc" | "batch";
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No scored resources yet"
        body="As MasaiLens receives tracked resource completions, the leaderboard will populate automatically."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-800/80 bg-slate-950/70">
      <div className="max-h-[34rem] overflow-auto">
        <table className="min-w-full border-collapse">
          <TableHeader
            columns={
              type === "cc"
                ? ["Rank", "CC Name", "Assigned Batches", "On-time Releases", "Late Releases", "Final Score"]
                : ["Rank", "Batch Name", "CC Name", "On-time Resources", "Late Resources", "Score"]
            }
          />
          <tbody>
            {rows.map((row, index) => {
              const isCcRow = type === "cc";
              const ccRow = row as ResourceLeaderboardRow;
              const batchRow = row as BatchLeaderboardRow;

              return (
                <tr
                  key={isCcRow ? ccRow.coordinatorEmail ?? ccRow.coordinatorName : batchRow.batchName}
                  className="border-b border-slate-900/80 last:border-b-0"
                >
                  <td className="px-4 py-4">
                    <span
                      className={clsx(
                        "inline-flex min-w-10 items-center justify-center rounded-full border px-2 py-1 text-xs font-semibold",
                        rankTone(index)
                      )}
                    >
                      #{index + 1}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div>
                      <p className="font-medium text-white">
                        {isCcRow ? ccRow.coordinatorName : batchRow.batchName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {isCcRow
                          ? ccRow.coordinatorEmail ?? "No email mapped"
                          : `${batchRow.perfectRate}% perfect-release rate`}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    {isCcRow ? (
                      <span className="text-sm text-slate-300">{ccRow.assignedBatches.length}</span>
                    ) : (
                      <div className="max-w-[18rem] text-sm text-slate-300">
                        {batchRow.coordinatorNames.length > 0
                          ? batchRow.coordinatorNames.join(", ")
                          : "Unassigned"}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4 text-sm font-medium text-emerald-300">
                    {isCcRow ? ccRow.onTimeReleases : batchRow.onTimeResources}
                  </td>
                  <td className="px-4 py-4 text-sm font-medium text-rose-300">
                    {isCcRow ? ccRow.lateReleases : batchRow.lateResources}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <ScorePill score={isCcRow ? ccRow.score : batchRow.score} />
                      <span className="text-xs text-slate-500">
                        {isCcRow
                          ? `${ccRow.perfectRate}% perfect`
                          : `${batchRow.pendingResources} pending`}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MappingRow({
  row,
  expanded,
  onToggle
}: {
  row: CoordinatorMappingRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-[24px] border border-slate-800/80 bg-slate-950/70 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex items-center gap-2 text-left text-base font-semibold text-white transition hover:text-cyan-200"
          >
            <span className="text-cyan-300">{expanded ? "−" : "+"}</span>
            {row.coordinatorName}
          </button>
          <p className="mt-2 text-sm text-slate-500">{row.coordinatorEmail ?? "No email mapped"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-slate-700/80 bg-slate-900/80 px-3 py-1 text-xs font-medium text-slate-300">
            {row.assignedBatches.length} batches
          </span>
          <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200">
            {row.onTimeReleases} on-time
          </span>
          <span className="rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-200">
            {row.lateReleases} late
          </span>
          <ScorePill score={row.score} />
        </div>
      </div>

      {expanded ? (
        <div className="mt-4 rounded-[20px] border border-slate-800/80 bg-slate-900/70 p-4">
          {row.assignedBatches.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {row.assignedBatches.map((batchName) => (
                <span
                  key={batchName}
                  className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-100"
                >
                  {batchName}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No assigned batches mapped yet.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function DashboardOverview({ data }: { data: ResourcesDashboardData }) {
  const typeValues = Object.values(data.summary.releasedByType);
  const maxTypeValue = Math.max(...typeValues, 1);
  const topCoordinators = data.ccLeaderboard.slice(0, 3);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total Batches"
          value={data.summary.totalBatches}
          note={`${data.summary.totalCoordinators} CCs mapped across active resources`}
          accent="bg-cyan-400"
        />
        <MetricCard
          label="Resources Released"
          value={data.summary.totalResourcesReleased}
          note={`${data.summary.trackedResources} tracked resource slots in scope`}
          accent="bg-emerald-400"
        />
        <MetricCard
          label="On-time vs Late"
          value={`${data.summary.onTimeRate}% / ${data.summary.lateRate}%`}
          note={`${data.summary.onTimeCount} on-time and ${data.summary.lateCount} late`}
          accent="bg-amber-300"
        />
        <MetricCard
          label="Overall Score"
          value={`${data.summary.overallScore}%`}
          note="Normalized from on-time wins and late penalties"
          accent="bg-rose-400"
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.95fr]">
        <Panel
          title="Release Volume By Resource Type"
          subtitle="Completed resource releases across pre-read, lecture notes, and assignments."
        >
          <div className="space-y-5">
            <BarRow
              label={RESOURCE_LABELS.preread}
              value={data.summary.releasedByType.preread}
              max={maxTypeValue}
              tone="bg-cyan-400"
              helper="Released before or after deadline"
            />
            <BarRow
              label={RESOURCE_LABELS.notes}
              value={data.summary.releasedByType.notes}
              max={maxTypeValue}
              tone="bg-emerald-400"
              helper="Lecture note uploads captured by MasaiLens"
            />
            <BarRow
              label={RESOURCE_LABELS.assignment}
              value={data.summary.releasedByType.assignment}
              max={maxTypeValue}
              tone="bg-amber-300"
              helper="Assignment releases synced from the backend"
            />
          </div>
        </Panel>

        <div className="grid gap-5">
          <Panel
            title="Status Breakdown"
            subtitle="Green is on-time, red is late, amber is still pending before deadline."
          >
            <StackedBar
              onTime={data.summary.onTimeCount}
              late={data.summary.lateCount}
              pending={data.summary.pendingCount}
            />
            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-slate-400">
              <span className="inline-flex items-center gap-2">
                <LegendDot className="bg-emerald-400" />
                On-time: {data.summary.onTimeCount}
              </span>
              <span className="inline-flex items-center gap-2">
                <LegendDot className="bg-rose-400" />
                Late: {data.summary.lateCount}
              </span>
              <span className="inline-flex items-center gap-2">
                <LegendDot className="bg-amber-300" />
                Pending: {data.summary.pendingCount}
              </span>
            </div>
          </Panel>

          <Panel
            title="Top CCs"
            subtitle="Quick view of the strongest current performers."
          >
            {topCoordinators.length > 0 ? (
              <div className="space-y-3">
                {topCoordinators.map((row, index) => (
                  <div
                    key={row.coordinatorEmail ?? row.coordinatorName}
                    className="flex items-center justify-between rounded-[18px] border border-slate-800/80 bg-slate-900/60 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-white">
                        #{index + 1} {row.coordinatorName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.onTimeReleases} on-time • {row.lateReleases} late
                      </p>
                    </div>
                    <ScorePill score={row.score} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No CC rankings yet"
                body="Leaderboard cards will populate as soon as MasaiLens has tracked completions."
              />
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

export function ResourcesDashboardClient() {
  const [data, setData] = useState<ResourcesDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DashboardTab>("dashboard");
  const [search, setSearch] = useState("");
  const [expandedCoordinators, setExpandedCoordinators] = useState<Record<string, boolean>>({});
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const loadData = useCallback(async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await fetch("/api/batch-details/resources-dashboard", {
        cache: "no-store"
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.message ?? "Failed to load resources dashboard data.");
      }

      setData(payload as ResourcesDashboardData);
      setError(null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load resources dashboard data.");
    } finally {
      if (silent) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadData(false);
    const timer = window.setInterval(() => {
      void loadData(true);
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [loadData]);

  const filteredMapping = useMemo(() => {
    if (!data) {
      return [];
    }

    if (!deferredSearch) {
      return data.ccMapping;
    }

    return data.ccMapping.filter((row) => {
      const haystack = [
        row.coordinatorName,
        row.coordinatorEmail ?? "",
        row.assignedBatches.join(" ")
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(deferredSearch);
    });
  }, [data, deferredSearch]);

  const lastUpdatedLabel = data ? formatDateTime(data.lastUpdatedAt) : "Loading";
  const expandedCount = filteredMapping.filter((row) => expandedCoordinators[row.coordinatorEmail ?? row.coordinatorName]).length;

  function toggleCoordinator(key: string) {
    setExpandedCoordinators((current) => ({
      ...current,
      [key]: !current[key]
    }));
  }

  function openTab(tab: DashboardTab) {
    startTransition(() => {
      setActiveTab(tab);
    });
  }

  if (loading) {
    return (
      <div className="flex min-h-[28rem] items-center justify-center">
        <div className="flex items-center gap-3 rounded-full border border-slate-800 bg-slate-950/80 px-5 py-3 text-sm text-slate-300">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
          Loading resources dashboard…
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <EmptyState
        title="Resources dashboard is unavailable"
        body={error ?? "MasaiLens data could not be loaded right now."}
      />
    );
  }

  return (
    <div className="space-y-6 text-slate-200">
      <div className="rounded-[30px] border border-slate-800/90 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.14),transparent_24%),radial-gradient(circle_at_right,rgba(248,113,113,0.12),transparent_30%),linear-gradient(135deg,rgba(8,14,24,0.99),rgba(5,9,16,0.98))] p-6 shadow-[0_30px_90px_rgba(2,6,23,0.45)]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-300">
              CC Dashboard
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">
              Resources Dashboard
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              A fresh MasaiLens-powered workspace for release discipline, coordinator rankings,
              batch rankings, and CC-to-batch ownership. Late submissions reduce score, and
              pending resources stay visible until they cross the deadline.
            </p>
          </div>

          <div className="flex flex-col items-start gap-3 xl:items-end">
            <button
              type="button"
              onClick={() => void loadData(true)}
              className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-500/10 px-4 py-2.5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/15"
            >
              {refreshing ? "Refreshing…" : "Refresh Data"}
            </button>
            <div className="rounded-full border border-slate-800/80 bg-slate-950/80 px-4 py-2 text-xs text-slate-400">
              Last updated: {lastUpdatedLabel}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="rounded-[28px] border border-slate-800/90 bg-[linear-gradient(180deg,rgba(8,14,24,0.98),rgba(4,8,15,0.98))] p-4 shadow-[0_24px_70px_rgba(2,6,23,0.36)]">
            <div className="mb-3 px-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Navigation
              </p>
            </div>
            <div className="space-y-2">
              {SIDEBAR_TABS.map((tab) => {
                const active = tab.key === activeTab;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => openTab(tab.key)}
                    className={clsx(
                      "w-full rounded-[22px] border px-4 py-3 text-left transition",
                      active
                        ? "border-cyan-400/30 bg-cyan-500/12 shadow-[0_18px_40px_rgba(34,211,238,0.12)]"
                        : "border-slate-800/80 bg-slate-950/70 hover:border-slate-700 hover:bg-slate-900/80"
                    )}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {tab.eyebrow}
                    </p>
                    <p className={clsx("mt-1 text-sm font-semibold", active ? "text-cyan-100" : "text-slate-200")}>
                      {tab.label}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <Panel
            title="Scoring Logic"
            subtitle="Perfect releases add points; late releases create direct penalties."
          >
            <div className="space-y-3 text-sm text-slate-300">
              <p>
                <span className="font-semibold text-emerald-200">Perfect release:</span>{" "}
                {data.scoring.perfectReleaseDefinition}
              </p>
              <p>
                <span className="font-semibold text-rose-200">Late release:</span>{" "}
                {data.scoring.lateReleaseDefinition}
              </p>
              <div className="rounded-[20px] border border-slate-800/80 bg-slate-900/75 px-4 py-3 text-sm text-slate-300">
                Score = ({data.scoring.onTimePoints} × on-time) − ({data.scoring.latePenaltyPoints} × late)
              </div>
            </div>
          </Panel>

          <Panel
            title="Data Quality"
            subtitle="Graceful handling for missing or incomplete records."
          >
            <div className="space-y-3 text-sm text-slate-300">
              <div className="flex items-center justify-between">
                <span>Missing task slots</span>
                <span className="font-semibold text-white">{data.dataQuality.missingTasks}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Batches without CC mapping</span>
                <span className="font-semibold text-white">{data.dataQuality.batchesWithoutCoordinator}</span>
              </div>
            </div>
          </Panel>
        </aside>

        <main className="min-w-0">
          {activeTab === "dashboard" ? <DashboardOverview data={data} /> : null}

          {activeTab === "ccLeaderboard" ? (
            <div className="space-y-4">
              <Panel
                title="CC Leaderboard"
                subtitle="Only perfect releases add points. Late submissions reduce score immediately."
              >
                <LeaderboardTable rows={data.ccLeaderboard} type="cc" />
              </Panel>
            </div>
          ) : null}

          {activeTab === "batchLeaderboard" ? (
            <div className="space-y-4">
              <Panel
                title="Batch Leaderboard"
                subtitle="Batches are ranked by release discipline using the same positive and negative scoring model."
              >
                <LeaderboardTable rows={data.batchLeaderboard} type="batch" />
              </Panel>
            </div>
          ) : null}

          {activeTab === "ccMapping" ? (
            <div className="space-y-4">
              <Panel
                title="CC Mapping"
                subtitle="Search CCs by name, email, or batch. Expand a coordinator to inspect assigned batches."
              >
                <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <input
                    type="text"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search by CC name or batch…"
                    className="w-full rounded-full border border-slate-700 bg-slate-950/90 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 lg:max-w-sm"
                  />
                  <p className="text-sm text-slate-500">
                    {filteredMapping.length} coordinators shown • {expandedCount} expanded
                  </p>
                </div>

                {filteredMapping.length > 0 ? (
                  <div className="space-y-3">
                    {filteredMapping.map((row) => {
                      const key = row.coordinatorEmail ?? row.coordinatorName;
                      return (
                        <MappingRow
                          key={key}
                          row={row}
                          expanded={Boolean(expandedCoordinators[key])}
                          onToggle={() => toggleCoordinator(key)}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    title="No CCs match that search"
                    body="Try a coordinator name, email handle, or one of the assigned batch names."
                  />
                )}
              </Panel>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}
