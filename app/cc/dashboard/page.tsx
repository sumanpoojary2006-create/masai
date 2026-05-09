export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { DateTime } from "luxon";

import { LogoutButton } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCurrentUser } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase";
import { hasAdminAccess } from "@/lib/admin-access";
import { getAppTimezone } from "@/lib/env";

type LmsLecture = {
  id: number;
  batch_id: number;
  batch_name: string;
  lecture_id: number;
  title: string;
  schedule: string;
  concludes: string;
  preread_uploaded: boolean;
  notes_uploaded: boolean;
  assignment_uploaded: boolean;
};

function statusBadge(uploaded: boolean, label: string) {
  const color = uploaded ? "#10b981" : "#f59e0b";
  const bg = uploaded ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.12)";
  const text = uploaded ? "COMPLETED" : "PENDING";
  return (
    <span
      style={{
        background: bg,
        color,
        border: `1px solid ${color}40`,
        padding: "3px 10px",
        borderRadius: "9999px",
        fontSize: "11px",
        fontWeight: 700,
        letterSpacing: "0.05em",
      }}
    >
      {text}
    </span>
  );
}

export default async function CCDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const isAdmin = await hasAdminAccess(user.id);
  if (isAdmin) redirect("/batch-details/dashboard");

  const supabase = createServerSupabase();

  // Get assigned batches
  const { data: assignments } = await supabase
    .from("cc_batch_assignments")
    .select("batch_id, batch_name")
    .eq("cc_user_id", user.id);

  if (!assignments || assignments.length === 0) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#080d1a] px-4 text-center">
        <div className="max-w-sm">
          <h1 className="text-xl font-bold text-white">No Batches Assigned</h1>
          <p className="mt-3 text-sm text-slate-400">
            Contact your Admin to get your batches configured.
          </p>
          <div className="mt-6">
            <LogoutButton />
          </div>
        </div>
      </main>
    );
  }

  const batchIds = assignments.map((a) => a.batch_id);

  // This week's window in IST
  const tz = getAppTimezone();
  const now = DateTime.now().setZone(tz);
  const weekStart = now.startOf("week").toISO()!;
  const weekEnd = now.startOf("week").plus({ days: 7 }).toISO()!;

  const { data: rawLectures } = await supabase
    .from("lms_lecture_cache")
    .select("id, batch_id, lecture_id, title, schedule, concludes, preread_uploaded, notes_uploaded, assignment_uploaded")
    .in("batch_id", batchIds)
    .neq("module", "csbt")
    .gte("schedule", weekStart)
    .lte("schedule", weekEnd)
    .order("schedule", { ascending: false });

  // Attach batch_name and deduplicate by (batch_id, title, schedule).
  // The LMS stores one row per section for the same live session, so the same
  // lecture appears multiple times with different lecture_ids. We merge compliance
  // flags with OR: if any section uploaded a resource, consider it uploaded.
  const batchNameMap = Object.fromEntries(assignments.map((a) => [a.batch_id, a.batch_name]));
  const dedupMap = new Map<string, LmsLecture>();
  for (const l of rawLectures ?? []) {
    const key = `${l.batch_id}::${l.schedule}::${l.title}`;
    const existing = dedupMap.get(key);
    if (!existing) {
      dedupMap.set(key, { ...l, batch_name: batchNameMap[l.batch_id] ?? `Batch ${l.batch_id}` });
    } else {
      dedupMap.set(key, {
        ...existing,
        preread_uploaded: existing.preread_uploaded || l.preread_uploaded,
        notes_uploaded: existing.notes_uploaded || l.notes_uploaded,
        assignment_uploaded: existing.assignment_uploaded || l.assignment_uploaded,
      });
    }
  }
  const lectures: LmsLecture[] = [...dedupMap.values()];

  // Saturday sessions whose notes/assignment are due Monday
  const mondayTodos = lectures.filter((l) => {
    const dt = DateTime.fromISO(l.schedule).setZone(tz);
    return dt.weekday === 6 && (!l.notes_uploaded || !l.assignment_uploaded);
  });

  // Summary
  const taskStatuses = lectures.flatMap((l) => [l.preread_uploaded, l.notes_uploaded, l.assignment_uploaded]);
  const completed = taskStatuses.filter(Boolean).length;
  const pending = taskStatuses.filter((v) => !v).length;

  // Group by batch
  const byBatch = new Map<number, LmsLecture[]>();
  for (const l of lectures) {
    if (!byBatch.has(l.batch_id)) byBatch.set(l.batch_id, []);
    byBatch.get(l.batch_id)!.push(l);
  }

  const weekLabel = `${now.startOf("week").toFormat("dd MMM")} – ${now.startOf("week").plus({ days: 6 }).toFormat("dd MMM yyyy")}`;

  return (
    <main className="app-shell mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      {/* Header */}
      <section className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-[var(--font-heading)] text-3xl font-bold text-ink sm:text-4xl">
            MasaiLens by Masai
          </h1>
          <p className="theme-muted mt-2 text-sm">
            Signed in as {user.email} &bull; {assignments.length} batch{assignments.length === 1 ? "" : "es"} assigned
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/lo-tracker" className="theme-button-secondary inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition">LO Tracker</Link>
<Link href="/weekly-report" className="theme-button-secondary inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition">Weekly Report</Link>
          <Link href="/profile" className="theme-button-secondary inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition">Profile</Link>
          <ThemeToggle />
          <LogoutButton />
        </div>
      </section>

      {/* Summary strip */}
      <section className="summary-strip theme-panel grid gap-4 rounded-[2rem] p-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-3xl bg-ink p-5 text-white">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-300">Lectures</p>
          <p className="mt-3 font-[var(--font-heading)] text-4xl font-bold">{lectures.length}</p>
        </div>
        <div className="rounded-3xl bg-emerald-50 p-5 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
          <p className="text-xs uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">Completed</p>
          <p className="mt-3 font-[var(--font-heading)] text-4xl font-bold">{completed}</p>
        </div>
        <div className="rounded-3xl bg-amber-50 p-5 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          <p className="text-xs uppercase tracking-[0.22em] text-amber-700 dark:text-amber-400">Pending</p>
          <p className="mt-3 font-[var(--font-heading)] text-4xl font-bold">{pending}</p>
        </div>
        <div className="rounded-3xl bg-slate-50 p-5 text-slate-900 dark:bg-slate-800/50 dark:text-slate-200">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-600 dark:text-slate-400">Batches</p>
          <p className="mt-3 font-[var(--font-heading)] text-4xl font-bold">{assignments.length}</p>
        </div>
      </section>

      {/* Monday To-Dos — Saturday sessions with pending resources */}
      {mondayTodos.length > 0 && (
        <section className="rounded-[2rem] border border-amber-500/30 bg-amber-950/20 p-6">
          <h2 className="mb-1 font-[var(--font-heading)] text-xl font-bold text-amber-300">Monday To-Dos</h2>
          <p className="mb-5 text-sm text-amber-400/80">
            These Saturday sessions have pending resources — send Notes &amp; Assignment by{" "}
            <strong>
              {DateTime.fromISO(mondayTodos[0].schedule).setZone(tz).plus({ days: 2 }).toFormat("dd MMM yyyy")}, 3:00 PM
            </strong>
            .
          </p>
          <div className="flex flex-col gap-3">
            {mondayTodos.map((l) => {
              const dt = DateTime.fromISO(l.schedule).setZone(tz);
              return (
                <div
                  key={l.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/20 bg-amber-950/30 px-5 py-4"
                >
                  <div>
                    <p className="font-medium text-amber-100">{l.title}</p>
                    <p className="text-xs text-amber-400/70">
                      {batchNameMap[l.batch_id]} &bull; {dt.toFormat("dd MMM yyyy (cccc)")}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {!l.notes_uploaded && (
                      <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
                        Notes pending
                      </span>
                    )}
                    {!l.assignment_uploaded && (
                      <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
                        Assignment pending
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* This week's lectures */}
      <section className="theme-panel rounded-[2rem] p-6">
        <h2 className="mb-1 font-[var(--font-heading)] text-xl font-bold text-ink">This Week&apos;s Lectures</h2>
        <p className="theme-muted mb-6 text-sm">{weekLabel}</p>

        {lectures.length === 0 ? (
          <div className="rounded-2xl border border-slate-700/40 bg-slate-800/30 px-6 py-10 text-center">
            <p className="text-sm text-slate-400">No lectures scheduled this week, or lecture data hasn&apos;t been synced yet.</p>
            <p className="mt-1 text-xs text-slate-500">Ask your Admin to sync lecture data from the Batch Details dashboard.</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {[...byBatch.entries()].map(([batchId, batchLectures]) => (
              <div key={batchId}>
                <div className="mb-3 border-b border-slate-700/40 pb-2">
                  <p className="text-xs uppercase tracking-[0.15em] text-slate-500">Batch</p>
                  <p className="font-[var(--font-heading)] text-lg font-bold text-ink">{batchNameMap[batchId]}</p>
                  <p className="text-xs text-slate-500">{batchLectures.length} lecture{batchLectures.length !== 1 ? "s" : ""}</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-700/40">
                        <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Lecture</th>
                        <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Schedule</th>
                        <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Pre-read</th>
                        <th className="pb-2 pr-4 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Notes</th>
                        <th className="pb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Assignment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batchLectures.map((l) => {
                        const dt = DateTime.fromISO(l.schedule).setZone(tz);
                        return (
                          <tr key={l.id} className="border-b border-slate-800/60">
                            <td className="py-3 pr-4">
                              <p className="font-medium text-slate-200">{l.title}</p>
                              <p className="text-xs text-slate-500">Lecture ID: {l.lecture_id}</p>
                            </td>
                            <td className="py-3 pr-4 text-slate-400">
                              <p>{dt.toFormat("dd MMM yyyy")}</p>
                              <p className="text-xs">{dt.toFormat("hh:mm a")}</p>
                            </td>
                            <td className="py-3 pr-4">{statusBadge(l.preread_uploaded, "Pre-read")}</td>
                            <td className="py-3 pr-4">{statusBadge(l.notes_uploaded, "Notes")}</td>
                            <td className="py-3">{statusBadge(l.assignment_uploaded, "Assignment")}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
