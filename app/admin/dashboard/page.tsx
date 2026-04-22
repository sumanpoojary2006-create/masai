"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { DonutChart } from "@/components/charts/donut-chart";
import { HorizontalBarChart } from "@/components/charts/horizontal-bar";

type UserStats = {
  userId: string;
  email: string;
  batchConfigs: { batch_name: string }[];
  totalLectures: number;
  completedTasks: number;
  pendingTasks: number;
  missedTasks: number;
  onTimeCount?: number;
  lateCount?: number;
};

type BatchStats = {
  batchName: string;
  lectureCount: number;
  completedTasks: number;
  pendingTasks: number;
  missedTasks: number;
};

type LectureStats = {
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
};

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userStats, setUserStats] = useState<UserStats[]>([]);
  const [batchStats, setBatchStats] = useState<BatchStats[]>([]);
  const [lectureStats, setLectureStats] = useState<LectureStats[]>([]);

  useEffect(() => {
    fetch("/api/admin/data?admin=true")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          throw new Error(d.error);
        }
        setUserStats(d.userStats ?? []);
        setBatchStats(d.batchStats ?? []);
        setLectureStats(d.lectureStats ?? []);
        setLoading(false);
      })
      .catch((e) => {
        setError(e?.message ?? 'Failed to load admin data');
        setLoading(false);
      });
  }, []);

  const totalUsers = userStats.length;
  const totalLectures = lectureStats.length;
  const totalCompleted = userStats.reduce((a, u) => a + (u.completedTasks ?? 0), 0);
  const totalPending = userStats.reduce((a, u) => a + (u.pendingTasks ?? 0), 0);
  const totalMissed = userStats.reduce((a, u) => a + (u.missedTasks ?? 0), 0);
  const completionRate = Math.round((totalCompleted / Math.max(1, totalCompleted + totalPending + totalMissed)) * 100);

  if (loading) {
    return <div className="p-6">Loading admin dashboard...</div>;
  }
  if (error) {
    return <div className="p-6 text-red-600">Error: {error}</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      <header className="flex items-center justify-between p-4 bg-slate-900 shadow-md sticky top-0 z-50">
        <div className="text-xl font-semibold">Admin Dashboard</div>
        <nav className="flex items-center gap-4">
          <Link href="/" className="text-sm">My Dashboard</Link>
          <span className="w-6 h-6 rounded-full bg-slate-700" aria-label="avatar" />
        </nav>
      </header>

      <main className="p-6 max-w-7xl mx-auto space-y-6">
        <section className="grid grid-cols-5 gap-4">
          <div className="rounded-xl bg-slate-800 p-5 text-center">Total Users
            <div className="text-3xl font-bold">{totalUsers}</div>
          </div>
          <div className="rounded-xl bg-indigo-100/50 p-5 text-center">Lectures
            <div className="text-3xl font-bold">{totalLectures}</div>
          </div>
          <div className="rounded-xl bg-green-200/80 p-5 text-center">Completed
            <div className="text-3xl font-bold">{totalCompleted}</div>
          </div>
          <div className="rounded-xl bg-yellow-100/80 p-5 text-center">Pending
            <div className="text-3xl font-bold">{totalPending}</div>
          </div>
          <div className="rounded-xl bg-rose-100/80 p-5 text-center">Missed
            <div className="text-3xl font-bold">{totalMissed}</div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-6">
          <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 text-slate-100">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm uppercase tracking-[0.2em] text-slate-200">Overview</div>
              <DonutChart value={completionRate} color="#10b981" trackColor="#374151" size={120} />
            </div>
            <div className="text-sm text-slate-300">Overall completion</div>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-slate-700/60 p-4">Completed</div>
              <div className="rounded-xl bg-slate-700/60 p-4">Pending</div>
            </div>
          </div>
          <div className="bg-white/5 rounded-2xl p-6">
            <h3 className="text-sm uppercase tracking-[0.2em] text-slate-300">Leaderboard</h3>
            <div className="mt-2 space-y-2">
              {userStats.slice(0,5).map((u, idx) => (
                <div key={u.userId} className="flex items-center justify-between">
                  <span className="text-sm">{u.email}</span>
                  <span className="text-sm font-semibold">{((u.onTimeCount ?? 0) / Math.max(1, (u.onTimeCount ?? 0) + (u.lateCount ?? 0)) * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-3 gap-6">
          <div className="bg-white/5 rounded-2xl p-4">
            <h4 className="text-sm uppercase tracking-[0.2em] text-slate-300">Batch Progress</h4>
            <HorizontalBarChart bars={batchStats.map(b => ({ label: b.batchName, value: Math.round((b.completedTasks / Math.max(1, b.lectureCount)) * 100) }))} />
          </div>
          <div className="bg-white/5 rounded-2xl p-4">
            <h4 className="text-sm uppercase tracking-[0.2em] text-slate-300">Lectures Schedule</h4>
            <div className="mt-2 text-sm text-slate-200">Upcoming lectures snapshot</div>
          </div>
          <div className="bg-white/5 rounded-2xl p-4">
            <h4 className="text-sm uppercase tracking-[0.2em] text-slate-300">Exports</h4>
            <button className="mt-2 px-3 py-2 rounded bg-emerald-600 text-white">Export CSV</button>
          </div>
        </section>
      </main>
    </div>
  );
}
