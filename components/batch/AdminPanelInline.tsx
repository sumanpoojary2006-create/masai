'use client'
import { useEffect, useState } from 'react'
import { AdminBatchStats, AdminLectureStats, AdminUserStats } from '@/lib/queries'
import { TaskStatus } from '@/lib/types'
import { DateTime } from 'luxon'

// ── Helpers ───────────────────────────────────────────────────────────────────
const TZ = 'Asia/Kolkata'

function ownerName(email: string | null | undefined) {
  if (!email || email === 'Unassigned') return 'Unassigned'
  const local = email.split('@')[0] ?? email
  return local.split(/[._-]+/).filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
}

function accuracy(completed: number, missed: number) {
  const total = completed + missed
  return total === 0 ? null : Math.round((completed / total) * 100)
}

function pct(a: number, b: number) { return b === 0 ? 0 : Math.round((a / b) * 100) }

function fmtDate(d: string) {
  if (!d) return '—'
  return DateTime.fromISO(d, { zone: TZ }).toFormat('dd MMM')
}

// ── Sub-components ────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: TaskStatus | null }) {
  if (!status) return <span style={{ color: '#334155', fontSize: '11px' }}>—</span>
  const cfg = {
    completed: { bg: 'rgba(16,185,129,0.12)', color: '#34d399', label: 'Done' },
    pending:   { bg: 'rgba(245,158,11,0.12)',  color: '#fbbf24', label: 'Pending' },
    missed:    { bg: 'rgba(239,68,68,0.12)',   color: '#f87171', label: 'Missed' },
  }[status]
  return (
    <span style={{ background: cfg.bg, color: cfg.color, fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '9999px' }}>
      {cfg.label}
    </span>
  )
}

function AccBar({ p }: { p: number | null }) {
  if (p === null) return <span style={{ color: '#334155', fontSize: '12px' }}>—</span>
  const color = p >= 80 ? '#10b981' : p >= 50 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '110px' }}>
      <div style={{ flex: 1, height: '5px', background: '#1e293b', borderRadius: '9999px', overflow: 'hidden' }}>
        <div style={{ width: `${p}%`, height: '100%', background: color, borderRadius: '9999px' }} />
      </div>
      <span style={{ fontSize: '12px', fontWeight: 700, color, minWidth: '32px', textAlign: 'right' }}>{p}%</span>
    </div>
  )
}

function MetCard({ label, value, sub, color, icon }: { label: string; value: string | number; sub?: string; color: string; icon: string }) {
  return (
    <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '12px', padding: '16px 18px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: color }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
        <span style={{ fontSize: '16px' }}>{icon}</span>
      </div>
      <div style={{ fontSize: '28px', fontWeight: 800, color: '#f1f5f9', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: '#475569', marginTop: '4px' }}>{sub}</div>}
    </div>
  )
}

function DarkTable({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty?: string }) {
  return (
    <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid #1f2937' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ background: '#0d1117', borderBottom: '1px solid #1f2937' }}>
            {head.map((h, i) => (
              <th key={i} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0
            ? <tr><td colSpan={head.length} style={{ padding: '24px', textAlign: 'center', color: '#334155', fontSize: '13px' }}>{empty ?? 'No data'}</td></tr>
            : rows.map((cells, ri) => (
              <tr key={ri} style={{ borderBottom: ri < rows.length - 1 ? '1px solid #1a2035' : 'none', background: ri % 2 === 0 ? '#0d1117' : '#0b0f1a' }}>
                {cells.map((cell, ci) => (
                  <td key={ci} style={{ padding: '10px 14px', color: '#cbd5e1', verticalAlign: 'middle' }}>{cell}</td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
interface AdminData {
  userStats: AdminUserStats[]
  batchStats: AdminBatchStats[]
  lectureStats: AdminLectureStats[]
}

type LbView = 'global' | 'batch'

export function AdminPanelInline() {
  const [data, setData] = useState<AdminData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lbView, setLbView] = useState<LbView>('global')
  const [selectedBatch, setSelectedBatch] = useState('')

  useEffect(() => {
    fetch('/api/admin/data?admin=true')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 0', gap: '12px' }}>
        <div style={{ width: '28px', height: '28px', border: '2px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <span style={{ color: '#475569', fontSize: '14px' }}>Loading compliance data…</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (error || !data) {
    return <div style={{ color: '#f87171', padding: '32px', textAlign: 'center', fontSize: '14px' }}>Failed to load: {error}</div>
  }

  const { userStats, batchStats, lectureStats } = data
  const today = DateTime.now().setZone(TZ).toISODate() ?? ''

  // Metrics
  const totalTasks = lectureStats.reduce((s, l) => s + [l.prereadStatus, l.notesStatus, l.assignmentStatus].filter(Boolean).length, 0)
  const completedTasks = lectureStats.reduce((s, l) => s + [l.prereadStatus, l.notesStatus, l.assignmentStatus].filter(x => x === 'completed').length, 0)
  const pendingTasks = lectureStats.reduce((s, l) => s + [l.prereadStatus, l.notesStatus, l.assignmentStatus].filter(x => x === 'pending').length, 0)
  const missedTasks = lectureStats.reduce((s, l) => s + [l.prereadStatus, l.notesStatus, l.assignmentStatus].filter(x => x === 'missed').length, 0)
  const completionRate = pct(completedTasks, totalTasks)

  // Today's pending
  const todayPending = lectureStats
    .filter(l => l.lectureDate === today)
    .flatMap(l => {
      const tasks: { l: AdminLectureStats; label: string; status: TaskStatus }[] = []
      if (l.prereadStatus && l.prereadStatus !== 'completed') tasks.push({ l, label: 'Pre-read', status: l.prereadStatus })
      if (l.notesStatus && l.notesStatus !== 'completed') tasks.push({ l, label: 'Notes', status: l.notesStatus })
      if (l.assignmentStatus && l.assignmentStatus !== 'completed') tasks.push({ l, label: 'Assignment', status: l.assignmentStatus })
      return tasks
    })

  // Leaderboard
  const allBatchNames = [...new Set(batchStats.map(b => b.batchName))].sort()
  const lbUsers = lbView === 'batch' && selectedBatch
    ? userStats.filter(u => u.batchConfigs.some(bc => bc.batch_name === selectedBatch))
    : userStats
  const leaderboard = [...lbUsers]
    .map(u => ({ ...u, acc: accuracy(u.completedTasks, u.missedTasks) }))
    .sort((a, b) => (b.acc ?? -1) - (a.acc ?? -1) || b.completedTasks - a.completedTasks)
    .slice(0, 10)

  // Batch performance
  const batchPerf = batchStats.map(b => {
    const total = b.completedTasks + b.pendingTasks + b.missedTasks
    return { ...b, total, completionPct: pct(b.completedTasks, total) }
  }).sort((a, b) => b.total - a.total)

  // Attention
  const attention = [...lectureStats]
    .map(l => ({
      ...l,
      score: (l.prereadStatus === 'missed' ? 3 : l.prereadStatus === 'pending' ? 1 : 0)
        + (l.notesStatus === 'missed' ? 3 : l.notesStatus === 'pending' ? 1 : 0)
        + (l.assignmentStatus === 'missed' ? 3 : l.assignmentStatus === 'pending' ? 1 : 0),
    }))
    .filter(l => l.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)

  const S = {
    section: { background: '#111827', border: '1px solid #1f2937', borderRadius: '14px', padding: '20px 22px' } as React.CSSProperties,
    heading: { fontSize: '14px', fontWeight: 700, color: '#f1f5f9', marginBottom: '4px' } as React.CSSProperties,
    sub: { fontSize: '12px', color: '#475569', marginBottom: '14px' } as React.CSSProperties,
    pill: (active: boolean): React.CSSProperties => ({
      padding: '4px 12px', borderRadius: '9999px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
      background: active ? '#6366f1' : '#1e293b', color: active ? '#fff' : '#64748b',
      border: active ? '1px solid #6366f1' : '1px solid #334155',
    }),
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={{ fontSize: '16px', fontWeight: 800, color: '#f1f5f9' }}>Global Compliance Overview</div>
          <div style={{ fontSize: '12px', color: '#475569' }}>
            {userStats.length} users · {lectureStats.length} lectures · {DateTime.now().setZone(TZ).toFormat('dd LLL yyyy')}
          </div>
        </div>
        <a href="/admin/dashboard" target="_blank" style={{
          background: '#1e293b', border: '1px solid #334155', color: '#94a3b8',
          borderRadius: '9999px', padding: '6px 16px', fontSize: '12px', fontWeight: 600,
          textDecoration: 'none', display: 'inline-block',
        }}>
          Open Full Dashboard ↗
        </a>
      </div>

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '14px' }}>
        <MetCard label="Total Users" value={userStats.length} sub="Onboarded" color="#6366f1" icon="👥" />
        <MetCard label="Lectures" value={lectureStats.length} sub="Active" color="#0ea5e9" icon="📚" />
        <MetCard label="Completion" value={`${completionRate}%`} sub={`${completedTasks} done`} color="#10b981" icon="✅" />
        <MetCard label="Missed Tasks" value={missedTasks} sub={`${pendingTasks} pending`} color={missedTasks > 0 ? '#ef4444' : '#10b981'} icon="⚠️" />
        <MetCard label="Today Pending" value={todayPending.length} sub="Tasks due today" color={todayPending.length > 0 ? '#f59e0b' : '#10b981'} icon="⏳" />
      </div>

      {/* Today's tasks + Leaderboard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', alignItems: 'start' }}>

        {/* Today's pending tasks */}
        <div style={{ ...S.section, display: 'flex', flexDirection: 'column', maxHeight: '480px' }}>
          <div style={S.heading}>Today's Pending Tasks</div>
          <div style={S.sub}>{todayPending.length} open tasks for {fmtDate(today)}</div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <DarkTable
              head={['Lecture', 'Batch', 'Owner', 'Task', 'Status']}
              empty="No pending tasks today 🎉"
              rows={todayPending.map(t => [
                <span key="l" style={{ fontWeight: 600, color: '#e2e8f0' }}>{t.l.lectureName || '—'}</span>,
                <span key="b" style={{ color: '#818cf8', fontSize: '11px' }}>{t.l.batchName}</span>,
                <span key="o" style={{ color: '#94a3b8' }}>{ownerName(t.l.userEmail)}</span>,
                <span key="t" style={{ color: '#cbd5e1' }}>{t.label}</span>,
                <StatusPill key="s" status={t.status} />,
              ])}
            />
          </div>
        </div>

        {/* Leaderboard */}
        <div style={{ ...S.section, display: 'flex', flexDirection: 'column', maxHeight: '480px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={S.heading}>Accuracy Leaderboard</div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['global', 'batch'] as LbView[]).map(v => (
                <button key={v} onClick={() => setLbView(v)} style={S.pill(lbView === v)}>
                  {v === 'global' ? 'Global' : 'Batch'}
                </button>
              ))}
            </div>
          </div>
          {lbView === 'batch' && (
            <select value={selectedBatch} onChange={e => setSelectedBatch(e.target.value)} style={{
              background: '#1e293b', border: '1px solid #334155', color: '#94a3b8',
              borderRadius: '8px', padding: '5px 10px', fontSize: '12px', outline: 'none',
              marginBottom: '8px', width: '100%',
            }}>
              <option value="">All batches</option>
              {allBatchNames.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
          <div style={S.sub}>Ranked by completed ÷ total tasks</div>
          <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {leaderboard.length === 0
              ? <div style={{ color: '#334155', fontSize: '13px', textAlign: 'center', padding: '16px' }}>No data</div>
              : leaderboard.map((u, i) => {
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null
                return (
                  <div key={u.userId} style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                    borderRadius: '10px', flexShrink: 0,
                    background: i === 0 ? 'rgba(99,102,241,0.08)' : '#0d1117',
                    border: `1px solid ${i === 0 ? 'rgba(99,102,241,0.2)' : '#1f2937'}`,
                  }}>
                    <div style={{ width: '22px', textAlign: 'center', flexShrink: 0 }}>
                      {medal
                        ? <span style={{ fontSize: '16px' }}>{medal}</span>
                        : <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>{i + 1}</span>}
                    </div>
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                      background: `hsl(${(u.email.charCodeAt(0) * 13) % 360}, 50%, 32%)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '13px', fontWeight: 700, color: '#fff',
                    }}>
                      {ownerName(u.email).charAt(0)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ownerName(u.email)}
                      </div>
                      <div style={{ fontSize: '11px', color: '#475569' }}>{u.completedTasks} completed · {u.missedTasks} missed</div>
                    </div>
                    <AccBar p={u.acc} />
                  </div>
                )
              })}
          </div>
        </div>
      </div>

      {/* Batch performance */}
      <div style={S.section}>
        <div style={S.heading}>Batch Performance</div>
        <div style={S.sub}>{batchPerf.length} batches · sorted by activity</div>
        <DarkTable
          head={['Batch', 'Owner', 'Lectures', 'Completion', 'Pending', 'Missed', 'Status']}
          rows={batchPerf.slice(0, 20).map(b => {
            const label = b.completionPct >= 80 ? '✅ On Track' : b.completionPct >= 50 ? '⚡ In Progress' : '⚠️ Attention'
            const lColor = b.completionPct >= 80 ? '#10b981' : b.completionPct >= 50 ? '#6366f1' : '#f59e0b'
            return [
              <span key="n" style={{ color: '#818cf8', fontWeight: 600 }}>{b.batchName}</span>,
              <span key="o" style={{ color: '#94a3b8' }}>{ownerName(b.ownerEmail)}</span>,
              <span key="l">{b.lectureCount}</span>,
              <AccBar key="c" p={b.completionPct} />,
              <span key="p" style={{ color: '#fbbf24' }}>{b.pendingTasks}</span>,
              <span key="m" style={{ color: '#f87171' }}>{b.missedTasks}</span>,
              <span key="s" style={{ color: lColor, fontSize: '12px', fontWeight: 600 }}>{label}</span>,
            ]
          })}
        />
      </div>

      {/* Needs attention */}
      {attention.length > 0 && (
        <div style={S.section}>
          <div style={S.heading}>Needs Attention</div>
          <div style={S.sub}>Lectures with highest urgency score</div>
          <DarkTable
            head={['Lecture', 'Batch', 'Date', 'Owner', 'Pre-read', 'Notes', 'Assignment', 'Score']}
            rows={attention.map(l => [
              <span key="n" style={{ fontWeight: 600, color: '#e2e8f0' }}>{l.lectureName || '—'}</span>,
              <span key="b" style={{ color: '#818cf8', fontSize: '11px' }}>{l.batchName}</span>,
              <span key="d" style={{ color: '#64748b', fontSize: '11px' }}>{fmtDate(l.lectureDate)}</span>,
              <span key="o" style={{ color: '#94a3b8' }}>{ownerName(l.userEmail)}</span>,
              <StatusPill key="p" status={l.prereadStatus} />,
              <StatusPill key="no" status={l.notesStatus} />,
              <StatusPill key="a" status={l.assignmentStatus} />,
              <span key="s" style={{
                background: l.score >= 6 ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                color: l.score >= 6 ? '#f87171' : '#fbbf24',
                borderRadius: '9999px', padding: '2px 8px', fontSize: '12px', fontWeight: 700,
              }}>{l.score}</span>,
            ])}
          />
        </div>
      )}
    </div>
  )
}
