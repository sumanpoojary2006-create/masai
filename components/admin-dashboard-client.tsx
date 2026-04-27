"use client";

import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { useMemo, useState } from "react";
import { AdminBatchStats, AdminLectureStats, AdminUserStats } from "@/lib/queries";
import { TaskStatus } from "@/lib/types";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TZ = "Asia/Kolkata";

function todayIST() {
  return DateTime.now().setZone(TZ).toISODate() ?? "";
}

function ownerName(email: string | null | undefined) {
  if (!email || email === "Unassigned") return "Unassigned";
  const local = email.split("@")[0] ?? email;
  return local.split(/[._-]+/).filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

function accuracy(completed: number, missed: number) {
  const total = completed + missed;
  return total === 0 ? null : Math.round((completed / total) * 100);
}

function pct(a: number, b: number) {
  return b === 0 ? 0 : Math.round((a / b) * 100);
}

function fmtDate(d: string) {
  if (!d) return "—";
  return DateTime.fromISO(d, { zone: TZ }).toFormat("dd MMM yyyy");
}

function getPriority(task: { lecture: AdminLectureStats; taskLabel: string; status: TaskStatus }) {
  const daysOld = DateTime.fromISO(task.lecture.lectureDate).diff(DateTime.now().setZone(TZ), 'days').days;
  if (task.status === 'missed') return 'high';
  if (daysOld < -1) return 'high'; // Overdue
  if (daysOld < 0) return 'medium'; // Due today
  return 'low';
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case 'high': return '#ef4444';
    case 'medium': return '#f59e0b';
    case 'low': return '#10b981';
    default: return '#64748b';
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, accent, icon, trend,
}: { label: string; value: string | number; sub?: string; accent: string; icon: string; trend?: { value: number; label: string } }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, #0d1117 0%, #111827 100%)',
      border: `1px solid #1f2937`,
      borderRadius: '16px',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      position: 'relative',
      overflow: 'hidden',
      transition: 'all 0.3s ease',
      cursor: 'pointer'
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '4px',
        background: `linear-gradient(90deg, ${accent}, ${accent}dd)`,
        borderRadius: '16px 16px 0 0',
      }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {label}
        </span>
        <span style={{ fontSize: '24px', opacity: 0.8 }}>{icon}</span>
      </div>
      <div style={{ fontSize: '36px', fontWeight: 800, color: '#f1f5f9', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '12px', color: '#475569' }}>{sub}</div>}
      {trend && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: trend.value > 0 ? '#10b981' : '#ef4444' }}>
          <span>{trend.value > 0 ? '↗' : '↘'}</span>
          <span>{Math.abs(trend.value)}% {trend.label}</span>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: TaskStatus | null }) {
  if (!status) return <span style={{ color: '#334155', fontSize: '11px' }}>—</span>;
  const cfg = {
    completed: { bg: 'rgba(16,185,129,0.15)', color: '#34d399', label: '✓ Done', icon: '✅' },
    pending:   { bg: 'rgba(245,158,11,0.15)', color: '#fbbf24', label: '⏳ Pending', icon: '⏳' },
    missed:    { bg: 'rgba(239,68,68,0.15)', color: '#f87171', label: '❌ Missed', icon: '❌' },
  }[status];
  return (
    <span style={{
      background: cfg.bg, color: cfg.color,
      fontSize: '11px', fontWeight: 600,
      padding: '4px 10px', borderRadius: '20px',
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      border: `1px solid ${cfg.color}30`
    }}>
      <span>{cfg.icon}</span>
      {cfg.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const color = getPriorityColor(priority);
  const icons = { high: '🔴', medium: '🟡', low: '🟢' };
  return (
    <span style={{
      background: `${color}20`, color,
      fontSize: '10px', fontWeight: 700,
      padding: '2px 6px', borderRadius: '12px',
      textTransform: 'uppercase', letterSpacing: '0.05em',
      border: `1px solid ${color}40`
    }}>
      {icons[priority as keyof typeof icons]} {priority}
    </span>
  );
}

function AccuracyBar({ pct: p }: { pct: number | null }) {
  if (p === null) return <span style={{ color: '#334155', fontSize: '12px' }}>No data</span>;
  const color = p >= 80 ? '#10b981' : p >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '120px' }}>
      <div style={{ flex: 1, height: '8px', background: '#1e293b', borderRadius: '9999px', overflow: 'hidden' }}>
        <div style={{
          width: `${p}%`, height: '100%', background: color,
          borderRadius: '9999px', transition: 'width 0.4s',
          boxShadow: `0 0 10px ${color}40`
        }} />
      </div>
      <span style={{ fontSize: '12px', fontWeight: 700, color, minWidth: '34px', textAlign: 'right' }}>{p}%</span>
    </div>
  );
}

function UserAvatar({ name, size = 32 }: { name: string; size?: number }) {
  const initial = name.charAt(0).toUpperCase();
  const hue = (name.charCodeAt(0) * 137) % 360;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `hsl(${hue}, 65%, 45%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.5, fontWeight: 700, color: '#fff',
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
    }}>
      {initial}
    </div>
  );
}

function SectionHeading({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
      <div>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#f1f5f9', margin: 0 }}>{title}</h2>
        {sub && <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0' }}>{sub}</p>}
      </div>
      {action}
    </div>
  );
}

function Table({ head, rows, empty }: {
  head: string[];
  rows: React.ReactNode[][];
  empty?: string;
}) {
  return (
    <div style={{
      overflowX: 'auto',
      borderRadius: '12px',
      border: '1px solid #1f2937',
      background: 'linear-gradient(135deg, #0d1117 0%, #111827 100%)'
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ background: 'linear-gradient(135deg, #1a2035 0%, #1e293b 100%)', borderBottom: '1px solid #2d3748' }}>
            {head.map((h, i) => (
              <th key={i} style={{
                padding: '14px 16px', textAlign: 'left',
                fontSize: '11px', fontWeight: 700, color: '#94a3b8',
                textTransform: 'uppercase', letterSpacing: '0.07em',
                whiteSpace: 'nowrap',
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0
            ? (
              <tr>
                <td colSpan={head.length} style={{ padding: '32px', textAlign: 'center', color: '#475569', fontSize: '14px' }}>
                  {empty ?? 'No data available'}
                </td>
              </tr>
            )
            : rows.map((cells, ri) => (
              <tr key={ri} style={{
                borderBottom: ri < rows.length - 1 ? '1px solid #1a2035' : 'none',
                background: ri % 2 === 0 ? '#0d1117' : '#111827',
                transition: 'background 0.2s ease'
              }}>
                {cells.map((cell, ci) => (
                  <td key={ci} style={{ padding: '12px 16px', color: '#cbd5e1', verticalAlign: 'middle' }}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface Props {
  userStats: AdminUserStats[];
  batchStats: AdminBatchStats[];
  lectureStats: AdminLectureStats[];
}

type View = 'global' | 'batch';

export function AdminDashboardClient({ userStats, batchStats, lectureStats }: Props) {
  const router = useRouter();
  const [view, setView] = useState<View>('global');
  const [selectedBatch, setSelectedBatch] = useState<string>('');
  const [lbScope, setLbScope] = useState<View>('global');
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'performance'>('overview');

  const today = todayIST();
  const allBatches = useMemo(() => [...new Set(batchStats.map(b => b.batchName))].sort(), [batchStats]);

  // ── Filtered lecture stats ────────────────────────────────────────────────
  const filteredLectures = useMemo(() => {
    if (view === 'batch' && selectedBatch) {
      return lectureStats.filter(l => l.batchName === selectedBatch);
    }
    return lectureStats;
  }, [lectureStats, view, selectedBatch]);

  // ── Today's pending tasks with priority ───────────────────────────────────
  const todayPendingTasks = useMemo(() => {
    return filteredLectures
      .filter(l => l.lectureDate === today)
      .flatMap(l => {
        const tasks: { lecture: AdminLectureStats; taskLabel: string; status: TaskStatus; priority: string }[] = [];
        if (l.prereadStatus && l.prereadStatus !== 'completed')
          tasks.push({ lecture: l, taskLabel: 'Pre-read', status: l.prereadStatus, priority: getPriority({ lecture: l, taskLabel: 'Pre-read', status: l.prereadStatus }) });
        if (l.notesStatus && l.notesStatus !== 'completed')
          tasks.push({ lecture: l, taskLabel: 'Lecture Notes', status: l.notesStatus, priority: getPriority({ lecture: l, taskLabel: 'Lecture Notes', status: l.notesStatus }) });
        if (l.assignmentStatus && l.assignmentStatus !== 'completed')
          tasks.push({ lecture: l, taskLabel: 'Assignment', status: l.assignmentStatus, priority: getPriority({ lecture: l, taskLabel: 'Assignment', status: l.assignmentStatus }) });
        return tasks;
      })
      .sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority as keyof typeof priorityOrder] - priorityOrder[a.priority as keyof typeof priorityOrder];
      });
  }, [filteredLectures, today]);

  // ── Enhanced metrics ───────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const totalTasks = filteredLectures.reduce((s, l) => {
      return s + [l.prereadStatus, l.notesStatus, l.assignmentStatus].filter(Boolean).length;
    }, 0);
    const completedTasks = filteredLectures.reduce((s, l) => {
      return s + [l.prereadStatus, l.notesStatus, l.assignmentStatus].filter(x => x === 'completed').length;
    }, 0);
    const pendingTasks = filteredLectures.reduce((s, l) => {
      return s + [l.prereadStatus, l.notesStatus, l.assignmentStatus].filter(x => x === 'pending').length;
    }, 0);
    const missedTasks = filteredLectures.reduce((s, l) => {
      return s + [l.prereadStatus, l.notesStatus, l.assignmentStatus].filter(x => x === 'missed').length;
    }, 0);

    // Active users (users with recent activity)
    const activeUsers = userStats.filter(u => {
      const lastActivity = Math.max(u.completedTasks, u.pendingTasks, u.missedTasks);
      return lastActivity > 0;
    }).length;

    // Engagement metrics
    const avgTasksPerUser = userStats.length > 0 ? Math.round(totalTasks / userStats.length) : 0;

    return {
      users: userStats.length,
      activeUsers,
      lectures: filteredLectures.length,
      completionRate: pct(completedTasks, totalTasks),
      pendingToday: todayPendingTasks.length,
      completedTasks,
      pendingTasks,
      missedTasks,
      avgTasksPerUser,
      highPriorityTasks: todayPendingTasks.filter(t => t.priority === 'high').length,
    };
  }, [filteredLectures, userStats, todayPendingTasks]);

  // ── Leaderboard (accuracy-based) ──────────────────────────────────────────
  const leaderboard = useMemo(() => {
    let users = userStats;
    if (lbScope === 'batch' && selectedBatch) {
      users = userStats.filter(u =>
        u.batchConfigs.some(bc => bc.batch_name === selectedBatch)
      );
    }
    return [...users]
      .map(u => ({
        ...u,
        accuracyPct: accuracy(u.completedTasks, u.missedTasks),
        totalTasks: u.completedTasks + u.pendingTasks + u.missedTasks,
      }))
      .sort((a, b) => {
        if (b.accuracyPct !== a.accuracyPct) {
          return (b.accuracyPct ?? -1) - (a.accuracyPct ?? -1);
        }
        return b.completedTasks - a.completedTasks;
      })
      .slice(0, 10);
  }, [userStats, lbScope, selectedBatch]);

  // ── Batch performance ─────────────────────────────────────────────────────
  const batchPerf = useMemo(() => {
    const source = view === 'batch' && selectedBatch
      ? batchStats.filter(b => b.batchName === selectedBatch)
      : batchStats;
    return source.map(b => {
      const total = b.completedTasks + b.pendingTasks + b.missedTasks;
      const completionPct = pct(b.completedTasks, total);
      const accuracyPct = accuracy(b.completedTasks, b.missedTasks);
      const flag = completionPct < 50 && total > 0;
      return { ...b, total, completionPct, accuracyPct, flag };
    }).sort((a, b) => b.total - a.total);
  }, [batchStats, view, selectedBatch]);

  // ── Activity trends (mock data for demo) ──────────────────────────────────
  const activityTrends = useMemo(() => {
    const now = DateTime.now().setZone(TZ);
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = now.minus({ days: 6 - i });
      const dayLectures = filteredLectures.filter(l => l.lectureDate === date.toISODate()).length;
      return { date: date.toFormat('MMM dd'), lectures: dayLectures };
    });
    return last7Days;
  }, [filteredLectures]);

  // ── Refresh ───────────────────────────────────────────────────────────────
  function handleRefresh() {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 1500);
  }

  const S = {
    page: { minHeight: '100vh', background: 'linear-gradient(135deg, #080b14 0%, #0a0f1f 100%)', color: '#f1f5f9', fontFamily: 'var(--font-body, system-ui)' } as React.CSSProperties,
    header: { background: 'linear-gradient(135deg, #0d1117 0%, #1a2035 100%)', borderBottom: '1px solid #1f2937', padding: '0' } as React.CSSProperties,
    headerInner: { maxWidth: '1600px', margin: '0 auto', padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' as const },
    main: { maxWidth: '1600px', margin: '0 auto', padding: '32px', display: 'flex', flexDirection: 'column' as const, gap: '32px' },
    card: { background: 'linear-gradient(135deg, #0d1117 0%, #111827 100%)', border: '1px solid #1f2937', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' } as React.CSSProperties,
    tabBar: { display: 'flex', background: '#1e293b', borderRadius: '12px', padding: '4px', border: '1px solid #334155', marginBottom: '24px' } as React.CSSProperties,
    tab: (active: boolean): React.CSSProperties => ({
      flex: 1, padding: '12px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s ease',
      background: active ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' : 'transparent',
      color: active ? '#fff' : '#94a3b8',
      textAlign: 'center' as const,
    }),
    pill: (active: boolean): React.CSSProperties => ({
      padding: '8px 18px', borderRadius: '25px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
      background: active ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' : '#1e293b',
      color: active ? '#fff' : '#64748b',
      border: active ? '1px solid #6366f1' : '1px solid #334155',
    }),
    btn: { background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)', border: '1px solid #475569', color: '#94a3b8', borderRadius: '25px', padding: '8px 18px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s ease' } as React.CSSProperties,
    select: { background: '#1e293b', border: '1px solid #334155', color: '#94a3b8', borderRadius: '25px', padding: '8px 16px', fontSize: '13px', outline: 'none', cursor: 'pointer' } as React.CSSProperties,
  };

  return (
    <div style={S.page}>
      {/* ── Header ── */}
      <header style={S.header}>
        <div style={S.headerInner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <a href="/" style={{ color: '#64748b', fontSize: '14px', textDecoration: 'none', fontWeight: 500 }}>← MasaiLens</a>
            <div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.02em' }}>
                Admin Dashboard
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                {DateTime.now().setZone(TZ).toFormat("cccc, dd LLL yyyy 'at' HH:mm")} · {metrics.activeUsers}/{metrics.users} active users · {batchStats.length} batches
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {/* View toggle */}
            <div style={{ display: 'flex', background: '#1e293b', borderRadius: '25px', padding: '4px', border: '1px solid #334155' }}>
              {(['global', 'batch'] as View[]).map(v => (
                <button key={v} onClick={() => setView(v)} style={S.pill(view === v)}>
                  {v === 'global' ? '🌐 Global' : '📦 Batch'}
                </button>
              ))}
            </div>

            {/* Batch selector */}
            {view === 'batch' && (
              <select value={selectedBatch} onChange={e => setSelectedBatch(e.target.value)} style={S.select}>
                <option value="">All batches</option>
                {allBatches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            )}

            <button onClick={handleRefresh} style={S.btn} disabled={refreshing}>
              {refreshing ? '↻ Refreshing…' : '↻ Refresh'}
            </button>

            <a href="/batch-details/dashboard" style={{ ...S.btn, textDecoration: 'none', display: 'inline-block' }}>
              Batch Wise →
            </a>
          </div>
        </div>
      </header>

      <main style={S.main}>
        {/* ── Tab Navigation ── */}
        <div style={S.tabBar}>
          {[
            { id: 'overview', label: '📊 Overview', desc: 'Key metrics & insights' },
            { id: 'tasks', label: '📋 Tasks', desc: 'Pending tasks & ownership' },
            { id: 'performance', label: '📈 Performance', desc: 'Analytics & trends' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              style={S.tab(activeTab === tab.id)}
              title={tab.desc}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Overview Tab ── */}
        {activeTab === 'overview' && (
          <>
            {/* Enhanced Metric Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
              <MetricCard
                label="Active Users"
                value={metrics.activeUsers}
                sub={`${metrics.users} total registered`}
                accent="#6366f1"
                icon="👥"
                trend={{ value: 12, label: 'vs last week' }}
              />
              <MetricCard
                label="Lectures Tracked"
                value={metrics.lectures}
                sub={view === 'batch' && selectedBatch ? selectedBatch : 'All batches'}
                accent="#0ea5e9"
                icon="📚"
              />
              <MetricCard
                label="Completion Rate"
                value={`${metrics.completionRate}%`}
                sub={`${metrics.completedTasks} completed · ${metrics.missedTasks} missed`}
                accent="#10b981"
                icon="✅"
              />
              <MetricCard
                label="Pending Today"
                value={metrics.pendingToday}
                sub={`${metrics.highPriorityTasks} high priority`}
                accent={metrics.pendingToday > 0 ? '#f59e0b' : '#10b981'}
                icon="⏳"
              />
              <MetricCard
                label="Avg Tasks/User"
                value={metrics.avgTasksPerUser}
                sub="Tasks per active user"
                accent="#8b5cf6"
                icon="📈"
              />
              <MetricCard
                label="Batch Health"
                value={`${batchPerf.filter(b => !b.flag).length}/${batchPerf.length}`}
                sub="Batches on track"
                accent="#06b6d4"
                icon="🏥"
              />
            </div>

            {/* Activity Trend Chart */}
            <div style={S.card}>
              <SectionHeading title="7-Day Activity Trend" sub="Lectures tracked over the past week" />
              <div style={{ display: 'flex', alignItems: 'end', gap: '8px', height: '200px', padding: '20px 0' }}>
                {activityTrends.map((day, i) => {
                  const maxLectures = Math.max(...activityTrends.map(d => d.lectures));
                  const height = maxLectures > 0 ? (day.lectures / maxLectures) * 160 : 0;
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '100%', maxWidth: '40px',
                        height: `${height}px`,
                        background: i === activityTrends.length - 1 ? 'linear-gradient(135deg, #10b981 0%, #34d399 100%)' : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                        borderRadius: '4px 4px 0 0',
                        transition: 'all 0.3s ease',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                      }} />
                      <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>{day.lectures}</span>
                      <span style={{ fontSize: '10px', color: '#475569' }}>{day.date}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* ── Tasks Tab ── */}
        {activeTab === 'tasks' && (
          <>
            {/* Today's Pending Tasks with Priority */}
            <div style={S.card}>
              <SectionHeading
                title="Today's Pending Tasks"
                sub={`${todayPendingTasks.length} open task${todayPendingTasks.length !== 1 ? 's' : ''} for ${fmtDate(today)} · ${metrics.highPriorityTasks} high priority`}
              />
              <Table
                head={['Priority', '#', 'Lecture', 'Batch', 'Owner', 'Task', 'Status']}
                empty="🎉 No pending tasks today!"
                rows={todayPendingTasks.map((t, i) => [
                  <PriorityBadge key="p" priority={t.priority} />,
                  <span key="i" style={{ color: '#334155', fontWeight: 700 }}>{i + 1}</span>,
                  <span key="l" style={{ color: '#e2e8f0', fontWeight: 600 }}>{t.lecture.lectureName || '—'}</span>,
                  <span key="b" style={{ color: '#818cf8', fontSize: '12px' }}>{t.lecture.batchName}</span>,
                  <div key="o" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <UserAvatar name={ownerName(t.lecture.userEmail)} size={24} />
                    <span style={{ color: '#94a3b8' }}>{ownerName(t.lecture.userEmail)}</span>
                  </div>,
                  <span key="t" style={{ color: '#cbd5e1' }}>{t.taskLabel}</span>,
                  <StatusPill key="s" status={t.status} />,
                ])}
              />
            </div>

            {/* Leaderboard */}
            <div style={S.card}>
              <SectionHeading
                title="Accuracy Leaderboard"
                sub="Top performers ranked by completion accuracy"
                action={
                  <div style={{ display: 'flex', background: '#1a2035', borderRadius: '20px', padding: '3px', border: '1px solid #1f2937' }}>
                    {(['global', 'batch'] as View[]).map(v => (
                      <button key={v} onClick={() => setLbScope(v)} style={{
                        ...S.pill(lbScope === v), padding: '6px 14px', fontSize: '12px',
                      }}>
                        {v === 'global' ? 'Global' : 'Batch'}
                      </button>
                    ))}
                  </div>
                }
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {leaderboard.length === 0
                  ? <div style={{ color: '#475569', fontSize: '14px', padding: '20px 0', textAlign: 'center' }}>No data available</div>
                  : leaderboard.map((u, i) => {
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
                    const batches = u.batchConfigs.map(b => b.batch_name).join(', ') || '—';
                    return (
                      <div key={u.userId} style={{
                        display: 'flex', alignItems: 'center', gap: '16px',
                        padding: '16px', borderRadius: '12px',
                        background: i === 0 ? 'linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(139,92,246,0.1) 100%)' : 'linear-gradient(135deg, #111827 0%, #1a2035 100%)',
                        border: `1px solid ${i === 0 ? 'rgba(99,102,241,0.3)' : '#1f2937'}`,
                      transition: 'all 0.2s ease'
                      }}>
                        <div style={{ width: '36px', textAlign: 'center', flexShrink: 0 }}>
                          {medal
                            ? <span style={{ fontSize: '24px' }}>{medal}</span>
                            : <span style={{ fontSize: '16px', fontWeight: 700, color: '#475569' }}>{i + 1}</span>
                          }
                        </div>
                        <UserAvatar name={ownerName(u.email)} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ownerName(u.email)}
                          </div>
                          <div style={{ fontSize: '11px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {batches}
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'end', gap: '4px', flexShrink: 0 }}>
                          <AccuracyBar pct={u.accuracyPct} />
                          <span style={{ fontSize: '10px', color: '#475569' }}>{u.totalTasks} total tasks</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </>
        )}

        {/* ── Performance Tab ── */}
        {activeTab === 'performance' && (
          <>
            {/* Batch Performance */}
            <div style={S.card}>
              <SectionHeading title="Batch Performance Overview" sub={`${batchPerf.length} batch${batchPerf.length !== 1 ? 'es' : ''} · sorted by activity level`} />
              <Table
                head={['Batch', 'Owner', 'Lectures', 'Completion', 'Accuracy', 'Tasks', 'Status']}
                rows={batchPerf.map(b => {
                  const statusLabel = b.completionPct >= 80 ? '✅ On Track' : b.completionPct >= 50 ? '⚡ In Progress' : b.flag ? '⚠️ Needs Attention' : '—';
                  const statusColor = b.completionPct >= 80 ? '#10b981' : b.completionPct >= 50 ? '#6366f1' : b.flag ? '#f59e0b' : '#475569';
                  return [
                    <span key="n" style={{ color: '#818cf8', fontWeight: 600 }}>{b.batchName}</span>,
                    <div key="o" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <UserAvatar name={ownerName(b.ownerEmail)} size={24} />
                      <span style={{ color: '#94a3b8' }}>{ownerName(b.ownerEmail)}</span>
                    </div>,
                    <span key="l" style={{ color: '#cbd5e1' }}>{b.lectureCount}</span>,
                    <AccuracyBar key="c" pct={b.completionPct} />,
                    <AccuracyBar key="a" pct={b.accuracyPct} />,
                    <div key="t" style={{ fontSize: '12px', color: '#64748b' }}>
                      <div>{b.completedTasks} ✓</div>
                      <div>{b.pendingTasks} ⏳</div>
                      <div>{b.missedTasks} ❌</div>
                    </div>,
                    <span key="s" style={{ color: statusColor, fontSize: '12px', fontWeight: 600 }}>{statusLabel}</span>,
                  ];
                })}
                empty="No batch performance data"
              />
            </div>

            {/* Task Breakdown with Enhanced Visualization */}
            <div style={S.card}>
              <SectionHeading title="Task Status Breakdown" sub="Completion metrics across all tracked tasks" />
              {(() => {
                const total = metrics.completedTasks + metrics.pendingTasks + metrics.missedTasks;
                const bars = [
                  { label: 'Completed', value: metrics.completedTasks, color: '#10b981', bg: 'rgba(16,185,129,0.15)', icon: '✅' },
                  { label: 'Pending',   value: metrics.pendingTasks,   color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', icon: '⏳' },
                  { label: 'Missed',    value: metrics.missedTasks,    color: '#ef4444', bg: 'rgba(239,68,68,0.15)', icon: '❌' },
                ];
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '32px', alignItems: 'center' }}>
                    {/* Enhanced Donut Chart */}
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <svg width="180" height="180" viewBox="0 0 180 180">
                        {(() => {
                          const cx = 90, cy = 90, r = 65, stroke = 25;
                          const circ = 2 * Math.PI * r;
                          let offset = 0;
                          const colors = ['#10b981', '#f59e0b', '#ef4444'];
                          const vals = [metrics.completedTasks, metrics.pendingTasks, metrics.missedTasks];
                          return [
                            <circle key="bg" cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth={stroke} />,
                            ...vals.map((v, i) => {
                              const dash = total === 0 ? 0 : (v / total) * circ;
                              const el = (
                                <circle key={i} cx={cx} cy={cy} r={r} fill="none"
                                  stroke={colors[i]} strokeWidth={stroke}
                                  strokeDasharray={`${dash} ${circ - dash}`}
                                  strokeDashoffset={-offset}
                                  transform="rotate(-90 90 90)"
                                  strokeLinecap="round"
                                />
                              );
                              offset += dash;
                              return el;
                            }),
                            <text key="label" x={cx} y={cy - 8} textAnchor="middle" fill="#f1f5f9" fontSize="28" fontWeight="800">
                              {metrics.completionRate}%
                            </text>,
                            <text key="sub" x={cx} y={cy + 12} textAnchor="middle" fill="#64748b" fontSize="12">
                              completion
                            </text>,
                          ];
                        })()}
                      </svg>
                    </div>

                    {/* Progress Bars */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {bars.map(b => (
                        <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontSize: '16px' }}>{b.icon}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                              <span style={{ fontSize: '13px', color: '#cbd5e1', fontWeight: 500 }}>{b.label}</span>
                              <span style={{ fontSize: '13px', fontWeight: 700, color: b.color }}>
                                {b.value} <span style={{ color: '#64748b', fontWeight: 400 }}>({pct(b.value, total)}%)</span>
                              </span>
                            </div>
                            <div style={{ height: '10px', background: '#1e293b', borderRadius: '5px', overflow: 'hidden' }}>
                              <div style={{
                                width: `${pct(b.value, total)}%`, height: '100%',
                                background: `linear-gradient(90deg, ${b.color}, ${b.color}dd)`,
                                borderRadius: '5px',
                                transition: 'width 0.6s ease',
                                boxShadow: `0 0 12px ${b.color}40`
                              }} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
