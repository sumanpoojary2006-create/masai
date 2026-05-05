'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EducatorAvailability, EducatorListItem } from "@/lib/educators";

// ─── Constants ───────────────────────────────────────────────────────────────

const DAYS: { key: keyof EducatorAvailability; label: string }[] = [
  { key: "mon", label: "M" },
  { key: "tue", label: "T" },
  { key: "wed", label: "W" },
  { key: "thu", label: "T" },
  { key: "fri", label: "F" },
  { key: "sat", label: "S" },
  { key: "sun", label: "S" },
];

const MOU_STATUS_COLORS: Record<string, string> = {
  "MoU Signed": "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  "MOU Expired": "bg-rose-500/15 text-rose-300 border-rose-500/30",
  "Hired By Curriculum & MoU Not Signed":
    "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

const RATING_COLORS: Record<string, string> = {
  "Strong Hire": "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  Hire: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  "Old Hire": "bg-slate-500/15 text-slate-400 border-slate-500/30",
  "Weak Hire": "bg-rose-500/15 text-rose-300 border-rose-500/30",
};

const TIER_COLORS: Record<string, string> = {
  "Tier 1": "bg-violet-500/15 text-violet-300 border-violet-500/30",
  "Tier 2": "bg-blue-500/15 text-blue-300 border-blue-500/30",
  "Tier 3": "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  "Tier 4": "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

// ─── Small helpers ────────────────────────────────────────────────────────────

function Badge({
  label,
  colorClass,
}: {
  label: string;
  colorClass?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        colorClass ?? "border-slate-700 bg-slate-800/60 text-slate-400"
      }`}
    >
      {label}
    </span>
  );
}

function AvailabilityDots({
  availability,
  blocked,
}: {
  availability: EducatorAvailability;
  blocked: Partial<EducatorAvailability>;
}) {
  return (
    <div className="flex items-center gap-[3px]">
      {DAYS.map(({ key, label }) => {
        const isUnavailable = !availability[key];
        const isBlocked = Boolean(blocked[key]);
        const dot = isUnavailable
          ? "bg-slate-700 text-slate-600"
          : isBlocked
          ? "bg-rose-500/80 text-rose-200"
          : "bg-emerald-500/80 text-emerald-100";
        return (
          <span
            key={key}
            title={
              isUnavailable
                ? `${key.toUpperCase()}: Unavailable`
                : isBlocked
                ? `${key.toUpperCase()}: Blocked (session this week)`
                : `${key.toUpperCase()}: Free`
            }
            className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${dot}`}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-full border border-slate-700 bg-slate-950/90 px-3 py-2 text-sm text-slate-200 focus:border-cyan-400 focus:outline-none"
    >
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface FilterOptions {
  tiers: string[];
  instructorTypes: string[];
  primaryDomains: string[];
  mouStatuses: string[];
}

interface DirectoryState {
  educators: EducatorListItem[];
  total: number;
}

const DAY_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Any day" },
  { value: "mon", label: "Monday" },
  { value: "tue", label: "Tuesday" },
  { value: "wed", label: "Wednesday" },
  { value: "thu", label: "Thursday" },
  { value: "fri", label: "Friday" },
  { value: "sat", label: "Saturday" },
  { value: "sun", label: "Sunday" },
];

export function EducatorDirectoryClient() {
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [state, setState] = useState<DirectoryState>({ educators: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState("");
  const [instructorType, setInstructorType] = useState("");
  const [primaryDomain, setPrimaryDomain] = useState("");
  const [mouStatus, setMouStatus] = useState("");
  const [blacklisted, setBlacklisted] = useState("");
  const [availableDay, setAvailableDay] = useState("");
  const [page, setPage] = useState(1);

  const pageSize = 50;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load filter options once
  useEffect(() => {
    fetch("/api/batch-details/educators?filterOptions=1", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setFilterOptions(d as FilterOptions))
      .catch(() => null);
  }, []);

  const fetchEducators = useCallback(
    async (params: {
      search: string;
      tier: string;
      instructorType: string;
      primaryDomain: string;
      mouStatus: string;
      blacklisted: string;
      availableDay: string;
      page: number;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        if (params.search) qs.set("search", params.search);
        if (params.tier) qs.set("tier", params.tier);
        if (params.instructorType) qs.set("instructorType", params.instructorType);
        if (params.primaryDomain) qs.set("primaryDomain", params.primaryDomain);
        if (params.mouStatus) qs.set("mouStatus", params.mouStatus);
        if (params.blacklisted) qs.set("blacklisted", params.blacklisted);
        if (params.availableDay) qs.set("availableDay", params.availableDay);
        qs.set("page", String(params.page));
        qs.set("pageSize", String(pageSize));

        const res = await fetch(`/api/batch-details/educators?${qs.toString()}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (!res.ok) throw new Error((data as { message?: string }).message ?? "Failed");
        setState(data as DirectoryState);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load educators.");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Debounce search, immediate for other filters
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchEducators({
        search,
        tier,
        instructorType,
        primaryDomain,
        mouStatus,
        blacklisted,
        availableDay,
        page,
      });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, tier, instructorType, primaryDomain, mouStatus, blacklisted, availableDay, page, fetchEducators]);

  const totalPages = Math.ceil(state.total / pageSize);

  const activeFilterCount = useMemo(
    () =>
      [tier, instructorType, primaryDomain, mouStatus, blacklisted, availableDay].filter(
        Boolean
      ).length,
    [tier, instructorType, primaryDomain, mouStatus, blacklisted, availableDay]
  );

  function resetFilters() {
    setSearch("");
    setTier("");
    setInstructorType("");
    setPrimaryDomain("");
    setMouStatus("");
    setBlacklisted("");
    setAvailableDay("");
    setPage(1);
  }

  return (
    <div className="space-y-6 text-slate-200">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-[28px] border border-slate-800/90 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_26%),radial-gradient(circle_at_right,rgba(16,185,129,0.14),transparent_28%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(4,9,18,0.98))] p-6 shadow-[0_30px_80px_rgba(2,6,23,0.44)] lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-300/80">
            Educator Management
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">
            Educator Directory
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            {state.total > 0 ? `${state.total} educators` : "Loading…"} — search, filter, and view profiles.
          </p>
        </div>
        <a
          href="/batch-details/dashboard"
          className="inline-flex h-11 items-center rounded-full border border-slate-700 bg-slate-900/80 px-4 text-sm font-medium text-slate-300 transition hover:border-slate-600 hover:text-slate-100"
        >
          ← Back to Batches
        </a>
      </div>

      {/* Filters */}
      <div className="rounded-[26px] border border-slate-800/90 bg-slate-950/75 p-5 shadow-[0_18px_48px_rgba(2,6,23,0.28)]">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[220px]">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                <circle cx="8.5" cy="8.5" r="5.75" stroke="currentColor" strokeWidth="1.75" />
                <path d="M13 13l3.5 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name or email…"
              className="w-full rounded-full border border-slate-700 bg-slate-950/90 py-2 pl-9 pr-4 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/20"
            />
          </div>

          <FilterSelect
            label="All Tiers"
            value={tier}
            onChange={(v) => { setTier(v); setPage(1); }}
            options={filterOptions?.tiers ?? []}
          />
          <FilterSelect
            label="All Types"
            value={instructorType}
            onChange={(v) => { setInstructorType(v); setPage(1); }}
            options={filterOptions?.instructorTypes ?? []}
          />
          <FilterSelect
            label="All Domains"
            value={primaryDomain}
            onChange={(v) => { setPrimaryDomain(v); setPage(1); }}
            options={filterOptions?.primaryDomains ?? []}
          />
          <FilterSelect
            label="MoU Status"
            value={mouStatus}
            onChange={(v) => { setMouStatus(v); setPage(1); }}
            options={filterOptions?.mouStatuses ?? []}
          />

          {/* Available day filter */}
          <select
            value={availableDay}
            onChange={(e) => { setAvailableDay(e.target.value); setPage(1); }}
            className="rounded-full border border-slate-700 bg-slate-950/90 px-3 py-2 text-sm text-slate-200 focus:border-cyan-400 focus:outline-none"
          >
            {DAY_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          {/* Blacklisted toggle */}
          <select
            value={blacklisted}
            onChange={(e) => { setBlacklisted(e.target.value); setPage(1); }}
            className="rounded-full border border-slate-700 bg-slate-950/90 px-3 py-2 text-sm text-slate-200 focus:border-cyan-400 focus:outline-none"
          >
            <option value="">All</option>
            <option value="false">Not Blacklisted</option>
            <option value="true">Blacklisted</option>
          </select>

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-300 transition hover:border-rose-500/50"
            >
              Clear {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""}
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-[26px] border border-slate-800/90 bg-slate-950/75 shadow-[0_18px_48px_rgba(2,6,23,0.28)] overflow-hidden">
        {error ? (
          <div className="p-8 text-center text-rose-300">{error}</div>
        ) : loading && state.educators.length === 0 ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
          </div>
        ) : state.educators.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-lg font-semibold text-white">No educators found</p>
            <p className="mt-2 text-sm text-slate-500">Try adjusting your filters.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Name
                    </th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Domain
                    </th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Type
                    </th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Tier
                    </th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      MoU
                    </th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Rating
                    </th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Availability
                    </th>
                    <th className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      YOE
                    </th>
                    <th className="w-10 px-4 py-3.5" />
                  </tr>
                </thead>
                <tbody className={loading ? "opacity-50 transition-opacity" : ""}>
                  {state.educators.map((educator) => (
                    <tr
                      key={educator.id}
                      className="group border-b border-slate-800/60 transition hover:bg-slate-900/60"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          {educator.blacklisted && (
                            <span
                              title="Blacklisted"
                              className="flex h-2 w-2 flex-shrink-0 rounded-full bg-rose-500"
                            />
                          )}
                          <div>
                            <p className="font-semibold text-white leading-tight">
                              {educator.name}
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-500">
                              {educator.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="space-y-1">
                          <p className="text-slate-200 leading-tight">{educator.primaryDomain ?? "—"}</p>
                          {educator.secondaryDomain && (
                            <p className="text-[11px] text-slate-500">{educator.secondaryDomain}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-slate-300">
                          {educator.instructorType ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        {educator.tier ? (
                          <Badge
                            label={educator.tier}
                            colorClass={TIER_COLORS[educator.tier]}
                          />
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {educator.mouStatus ? (
                          <Badge
                            label={
                              educator.mouStatus === "Hired By Curriculum & MoU Not Signed"
                                ? "Hired, No MoU"
                                : educator.mouStatus
                            }
                            colorClass={MOU_STATUS_COLORS[educator.mouStatus]}
                          />
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        {educator.curriculumApprovalRating ? (
                          <Badge
                            label={educator.curriculumApprovalRating}
                            colorClass={RATING_COLORS[educator.curriculumApprovalRating]}
                          />
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <AvailabilityDots
                          availability={educator.availability}
                          blocked={{ ...educator.currentBlockedDays, ...educator.liveBlockedThisWeek }}
                        />
                      </td>
                      <td className="px-4 py-3.5 text-slate-400">
                        {educator.yoe != null ? `${educator.yoe}y` : "—"}
                      </td>
                      <td className="px-4 py-3.5">
                        <a
                          href={`/batch-details/educators/${educator.id}`}
                          className="inline-flex h-8 items-center rounded-full border border-slate-700 bg-slate-900/70 px-3 text-xs font-medium text-slate-300 opacity-0 transition group-hover:opacity-100 hover:border-cyan-400/40 hover:text-cyan-200"
                        >
                          View →
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-800 px-5 py-4">
                <p className="text-xs text-slate-500">
                  {(page - 1) * pageSize + 1}–
                  {Math.min(page * pageSize, state.total)} of {state.total} educators
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ← Prev
                  </button>
                  <span className="text-xs text-slate-500">
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
