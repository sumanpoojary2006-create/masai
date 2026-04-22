"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { LogoutButton } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { AdminDashboardClient } from "@/components/admin-dashboard-client";

interface AdminUserStats {
  userId: string;
  email: string;
  batchConfigs: { batch_name: string }[];
  totalLectures: number;
  completedTasks: number;
  pendingTasks: number;
  missedTasks: number;
  onTimeCount: number;
  lateCount: number;
}

interface AdminBatchStats {
  batchName: string;
  lectureCount: number;
  completedTasks: number;
  pendingTasks: number;
  missedTasks: number;
}

interface AdminLectureStats {
  id: string;
  batchName: string;
  lectureName: string;
  lectureDate: string;
  startTime: string;
  endTime: string;
  userEmail: string;
  prereadStatus: string | null;
  notesStatus: string | null;
  assignmentStatus: string | null;
}

function AdminContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userStats, setUserStats] = useState<AdminUserStats[]>([]);
  const [batchStats, setBatchStats] = useState<AdminBatchStats[]>([]);
  const [lectureStats, setLectureStats] = useState<AdminLectureStats[]>([]);

  const isAdmin = searchParams.get("admin") === "true";

  useEffect(() => {
    if (!isAdmin) {
      router.push("/login");
      return;
    }

    async function loadData() {
      setError(null);
      try {
        const res = await fetch("/api/admin/data?admin=true");
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || "Failed to fetch");
        }
        
        setUserStats(data.userStats || []);
        setBatchStats(data.batchStats || []);
        setLectureStats(data.lectureStats || []);
      } catch (err: any) {
        console.error("Failed to load admin data:", err);
        setError(err?.message || "Failed to load data");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [isAdmin, router]);

  const overallStats = userStats.reduce(
    (acc, user) => ({
      totalLectures: acc.totalLectures + user.totalLectures,
      completedTasks: acc.completedTasks + user.completedTasks,
      pendingTasks: acc.pendingTasks + user.pendingTasks,
      missedTasks: acc.missedTasks + user.missedTasks,
      totalUsers: acc.totalUsers + 1
    }),
    { totalLectures: 0, completedTasks: 0, pendingTasks: 0, missedTasks: 0, totalUsers: 0 }
  );

  if (loading) {
    return (
      <main className="app-shell mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-4 py-10">
        <p className="text-slate-500">Loading admin data...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="app-shell mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-4 py-10">
        <div className="text-center">
          <p className="text-red-600">Error: {error}</p>
          <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-ink text-white rounded">
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="app-shell mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-4 py-10">
        <p className="text-slate-500">Please log in as admin first.</p>
      </main>
    );
  }

  if (userStats.length === 0 && batchStats.length === 0) {
    return (
      <main className="app-shell mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-10">
        <section className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-[var(--font-heading)] text-3xl font-bold text-ink">Admin Dashboard</h1>
            <p className="theme-muted mt-2 text-sm">Platform-wide analytics</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/" className="theme-button-secondary px-5 py-2.5 text-sm font-semibold rounded-full">My Dashboard</Link>
            <ThemeToggle />
            <LogoutButton />
          </div>
        </section>
        <div className="text-center py-20">
          <p className="text-slate-500 text-lg">No data available yet.</p>
          <p className="text-slate-400 text-sm mt-2">Add users and upload lecture sheets to see analytics.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
      <section className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-[var(--font-heading)] text-3xl font-bold text-ink sm:text-4xl">
            Admin Dashboard
          </h1>
          <p className="theme-muted mt-2 text-sm">
            Platform-wide analytics and management
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/" className="theme-button-secondary inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition">
            My Dashboard
          </Link>
          <ThemeToggle />
          <LogoutButton />
        </div>
      </section>

      <section className="summary-strip theme-panel grid gap-4 rounded-[2rem] p-5 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-3xl bg-ink p-5 text-white">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-300">Total Users</p>
          <p className="mt-3 font-[var(--font-heading)] text-4xl font-bold">{overallStats.totalUsers}</p>
        </div>
        <div className="rounded-3xl bg-indigo-50 p-5 text-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-200">
          <p className="text-xs uppercase tracking-[0.22em] text-indigo-700 dark:text-indigo-400">Lectures</p>
          <p className="mt-3 font-[var(--font-heading)] text-4xl font-bold">{overallStats.totalLectures}</p>
        </div>
        <div className="rounded-3xl bg-emerald-50 p-5 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
          <p className="text-xs uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-400">Completed</p>
          <p className="mt-3 font-[var(--font-heading)] text-4xl font-bold">{overallStats.completedTasks}</p>
        </div>
        <div className="rounded-3xl bg-amber-50 p-5 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          <p className="text-xs uppercase tracking-[0.22em] text-amber-700 dark:text-amber-400">Pending</p>
          <p className="mt-3 font-[var(--font-heading)] text-4xl font-bold">{overallStats.pendingTasks}</p>
        </div>
        <div className="rounded-3xl bg-rose-50 p-5 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200">
          <p className="text-xs uppercase tracking-[0.22em] text-rose-700 dark:text-rose-400">Missed</p>
          <p className="mt-3 font-[var(--font-heading)] text-4xl font-bold">{overallStats.missedTasks}</p>
        </div>
      </section>

      <AdminDashboardClient
        userStats={userStats as any}
        batchStats={batchStats as any}
        lectureStats={lectureStats as any}
      />
    </main>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={
      <main className="app-shell mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-4 py-10">
        <p className="text-slate-500">Loading...</p>
      </main>
    }>
      <AdminContent />
    </Suspense>
  );
}