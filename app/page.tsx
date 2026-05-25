export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { DateTime } from "luxon";

import { DashboardClient } from "@/components/dashboard-client";
import { CcProxySelector, type ProxyCoordinator } from "@/components/cc/CcProxySelector";
import { MasaiLensLogo } from "@/components/masai-lens-logo";
import { BottomNav } from "@/components/bottom-nav";
import { getCurrentUser, getUserProfile } from "@/lib/auth";
import { hasPublicSupabaseConfig, hasSupabaseConfig, isAdminUser, getAppTimezone } from "@/lib/env";
import { getCCLectures } from "@/lib/queries";
import { createServerSupabase } from "@/lib/supabase";
import { DashboardLecture } from "@/lib/types";

function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, start: number, end: number): string {
  const span = end - start;
  if (Math.abs(span) >= 359.9) {
    const top = polarToCartesian(cx, cy, r, 0);
    const bot = polarToCartesian(cx, cy, r, 180);
    return `M ${top.x} ${top.y} A ${r} ${r} 0 1 1 ${bot.x} ${bot.y} A ${r} ${r} 0 1 1 ${top.x} ${top.y}`;
  }
  const s = polarToCartesian(cx, cy, r, start);
  const e = polarToCartesian(cx, cy, r, end);
  const large = span > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

function ComplianceGauge({
  completed,
  pending,
  total,
  lectureCount,
}: {
  completed: number;
  pending: number;
  total: number;
  lectureCount: number;
}) {
  const cx = 72, cy = 72, size = 144, r = 52;
  const completedDeg = total > 0 ? (completed / total) * 360 : 0;
  const pendingDeg = total > 0 ? (pending / total) * 360 : 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={`${lectureCount} lectures`}>
      <defs>
        <filter id="pg-glow-g" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="pg-glow-o" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Background track */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e2a3d" strokeWidth="9" />

      {/* Completed arc — green */}
      {completedDeg > 0.5 && (
        <>
          <path
            d={describeArc(cx, cy, r, -90, -90 + completedDeg)}
            fill="none" stroke="#10b981" strokeWidth="14" strokeOpacity="0.2"
            strokeLinecap="round" filter="url(#pg-glow-g)"
          />
          <path
            d={describeArc(cx, cy, r, -90, -90 + completedDeg)}
            fill="none" stroke="#10b981" strokeWidth="9"
            strokeLinecap="round"
          />
        </>
      )}

      {/* Pending arc — orange */}
      {pendingDeg > 0.5 && (
        <>
          <path
            d={describeArc(cx, cy, r, -90 + completedDeg, -90 + completedDeg + pendingDeg)}
            fill="none" stroke="#f59e0b" strokeWidth="14" strokeOpacity="0.2"
            strokeLinecap="round" filter="url(#pg-glow-o)"
          />
          <path
            d={describeArc(cx, cy, r, -90 + completedDeg, -90 + completedDeg + pendingDeg)}
            fill="none" stroke="#f59e0b" strokeWidth="9"
            strokeLinecap="round"
          />
        </>
      )}

      {/* Outer glow ring */}
      <circle cx={cx} cy={cy} r={r + 10} fill="none" stroke="#10b981" strokeWidth="1.5" strokeOpacity="0.15" />
      <circle cx={cx} cy={cy} r={r + 14} fill="none" stroke="#f59e0b" strokeWidth="1" strokeOpacity="0.1" />

      {/* Center text */}
      <text x={cx} y={cy + 6} textAnchor="middle" fill="white" fontWeight="bold" fontSize="30" fontFamily="system-ui, sans-serif">
        {lectureCount}
      </text>
      <text x={cx} y={cy + 22} textAnchor="middle" fill="#475569" fontSize="9" letterSpacing="2.5" fontFamily="system-ui, sans-serif">
        LECTURES
      </text>
    </svg>
  );
}

function buildSummary(lectures: DashboardLecture[]) {
  const taskStatuses = lectures.flatMap((l) => Object.values(l.tasks));
  return {
    lectures: lectures.length,
    completed: taskStatuses.filter((t) => t?.status === "completed").length,
    pending: taskStatuses.filter((t) => t?.status === "pending").length,
    missed: taskStatuses.filter((t) => t?.status === "missed").length,
  };
}

type SearchParams = Promise<{ proxy?: string }>;

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  if (!hasSupabaseConfig() || !hasPublicSupabaseConfig()) {
    return (
      <main className="app-shell mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <section className="flex items-center justify-between gap-4">
          <MasaiLensLogo iconSize={44} />
        </section>
        <section className="theme-notice rounded-3xl p-6 shadow-panel">
          <h2 className="font-[var(--font-heading)] text-2xl font-bold">
            Add your Supabase environment variables first
          </h2>
          <p className="mt-2 text-sm">
            This app needs SUPABASE_URL, SUPABASE_KEY, NEXT_PUBLIC_SUPABASE_URL, and NEXT_PUBLIC_SUPABASE_ANON_KEY.
          </p>
        </section>
      </main>
    );
  }

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const profile = await getUserProfile(user.id);
  if (!profile?.onboarding_complete) redirect("/setup");

  const { proxy: proxyParam } = await searchParams;
  const supabase = createServerSupabase();
  const tz = getAppTimezone();

  // ── Fetch all coordinators + authorization for the dropdown ──────────────
  let coordinators: ProxyCoordinator[] = [];

  const { data: allAssignments } = await supabase
    .from("cc_batch_assignments")
    .select("cc_user_id");

  const allCcIds = [
    ...new Set((allAssignments ?? []).map((a) => a.cc_user_id as string)),
  ].filter((id) => id !== user.id);

  let authorizedIds = new Set<string>();
  try {
    const today = DateTime.now().setZone(tz).toISODate()!;
    const { data: coverages } = await supabase
      .from("cc_leave_coverage")
      .select("on_leave_cc_id")
      .eq("covering_cc_id", user.id)
      .eq("coverage_date", today);
    authorizedIds = new Set((coverages ?? []).map((c) => c.on_leave_cc_id as string));
  } catch {
    // Table may not exist yet — all CCs will show as unauthorized
  }

  if (allCcIds.length > 0) {
    try {
      const { data: authUsers } = await supabase.auth.admin.listUsers();
      const nameMap: Record<string, { email: string; full_name: string }> = {};
      for (const u of authUsers?.users ?? []) {
        nameMap[u.id] = {
          email: u.email ?? "",
          full_name: (u.user_metadata?.full_name as string) ?? "",
        };
      }
      coordinators = allCcIds
        .map((id) => ({
          user_id: id,
          email: nameMap[id]?.email ?? "",
          name: nameMap[id]?.full_name || nameMap[id]?.email || id,
          authorized: authorizedIds.has(id),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      coordinators = allCcIds.map((id) => ({
        user_id: id,
        email: id,
        name: id,
        authorized: authorizedIds.has(id),
      }));
    }
  }

  // ── Resolve proxy CC if selected ─────────────────────────────────────────
  let effectiveUserId = user.id;
  let proxyName: string | null = null;

  if (proxyParam && proxyParam !== user.id) {
    const authorizedProxy = coordinators.find(
      (c) => c.user_id === proxyParam && c.authorized
    );
    if (authorizedProxy) {
      effectiveUserId = proxyParam;
      proxyName = authorizedProxy.name;
    } else {
      redirect("/");
    }
  }

  const isProxy = Boolean(proxyName);

  // ── Load lectures for effective user ─────────────────────────────────────
  let lectures: DashboardLecture[] = [];
  let loadError: string | null = null;

  try {
    lectures = await getCCLectures(effectiveUserId);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Unable to load lecture records.";
  }

  const summary = buildSummary(lectures);

  const totalTasks = summary.lectures * 3;

  return (
    <main className="app-shell mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 pb-28 pt-6 sm:px-6 lg:px-8">

      {/* ── Dark header: Logo + Gauge + Stats ─────────────────────────────── */}
      <section
        style={{
          background: "linear-gradient(135deg, #0b1018 0%, #151d2e 50%, #0b1018 100%)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: "1.5rem",
          padding: "1.25rem 1.75rem",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-6">
          {/* Logo + user info */}
          <div className="flex flex-col gap-2">
            <MasaiLensLogo iconSize={48} />
            <p className="text-xs text-slate-600 pl-1">
              {user.email}
              {isProxy && (
                <span className="ml-2 text-amber-500">
                  &bull; Viewing <strong>{proxyName}</strong>
                </span>
              )}
            </p>
            {isAdminUser(user.id) && (
              <Link
                href="/batch-details/dashboard"
                className="inline-flex w-fit items-center gap-1.5 rounded-full bg-indigo-500/15 px-3 py-1 text-xs font-semibold text-indigo-400 transition hover:bg-indigo-500/25"
              >
                Admin Panel →
              </Link>
            )}
          </div>

          {/* Gauge + Stats */}
          <div className="flex items-center gap-6 sm:gap-10">
            {/* Completed stat */}
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400 opacity-80">
                Completed
              </p>
              <p className="mt-1 text-4xl font-bold text-emerald-400 leading-none">
                {summary.completed}
              </p>
            </div>

            {/* Circular gauge */}
            <ComplianceGauge
              completed={summary.completed}
              pending={summary.pending}
              total={totalTasks}
              lectureCount={summary.lectures}
            />

            {/* Pending + Missed */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-amber-400 opacity-80">
                Pending
              </p>
              <p className="mt-1 text-4xl font-bold text-amber-400 leading-none">
                {summary.pending}
              </p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-slate-300 opacity-70">
                Missed
              </p>
              <p className="mt-0.5 text-2xl font-bold text-slate-200 leading-none">
                {summary.missed}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CC Proxy Selector */}
      <section>
        <CcProxySelector
          coordinators={coordinators}
          currentProxyId={isProxy ? effectiveUserId : null}
          currentProxyName={proxyName}
          basePath="/"
        />
      </section>

      {loadError && (
        <section className="theme-error rounded-3xl p-6 shadow-panel">
          <h2 className="font-[var(--font-heading)] text-2xl font-bold">Could not load lectures</h2>
          <p className="mt-2 text-sm">{loadError}</p>
        </section>
      )}

      {lectures.length === 0 && !loadError && (
        <section className="theme-panel rounded-3xl p-8 text-center shadow-panel">
          <p className="font-semibold text-ink">No lectures this week</p>
          <p className="theme-muted mt-2 text-sm">
            {isProxy
              ? `${proxyName} has no lectures configured for this week.`
              : "Either no batches have been assigned to you yet, or the Admin hasn't synced lecture data for this week."}
          </p>
        </section>
      )}

      <DashboardClient lectures={lectures} proxyUserId={isProxy ? effectiveUserId : undefined} />

      <BottomNav />
    </main>
  );
}
