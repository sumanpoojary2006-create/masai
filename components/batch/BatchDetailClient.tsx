'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useBatch } from '@/hooks/useBatch'
import { useSessions } from '@/hooks/useSessions'
import { useMyRole } from '@/hooks/useUserRole'
import { BatchInfoGrid } from '@/components/batch/BatchInfoGrid'
import { TeamMembersGrid } from '@/components/batch/TeamMembersGrid'
import { GradingPolicyGrid } from '@/components/batch/GradingPolicyGrid'
import { SessionsGrid } from '@/components/batch/SessionsGrid'
import { BatchCalendar } from '@/components/batch/BatchCalendar'
import { exportSessionsToXlsx } from '@/lib/batch-export'
import { STATUS_COLOR, STATUS_BG } from '@/lib/batch-constants'
import { createBrowserSupabase } from '@/lib/supabase-browser'

type Tab = 'overview' | 'sessions' | 'calendar'

interface Props {
  id: string
}

export function BatchDetailClient({ id }: Props) {
  const router = useRouter()
  const { batch, loading, updateBatch, cloneBatch } = useBatch(id)
  const { sessions, addSession, updateSession, deleteSession } = useSessions(id)
  const { canEdit, isAdmin } = useMyRole()
  const [tab, setTab] = useState<Tab>('overview')
  const [cloning, setCloning] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [msg, setMsg] = useState<{ text: string; type: 'error' | 'success' } | null>(null)

  function showMsg(text: string, type: 'error' | 'success' = 'error') {
    setMsg({ text, type })
    setTimeout(() => setMsg(null), 4000)
  }

  async function handleDeleteBatch() {
    setDeleting(true)
    const supabase = createBrowserSupabase()
    const { error } = await supabase.from('batches').delete().eq('id', id)
    setDeleting(false)
    if (error) { showMsg(error.message); return }
    router.push('/batch-details/dashboard')
  }

  async function handleClone() {
    setCloning(true)
    const { data, error } = await cloneBatch()
    setCloning(false)
    if (error) { showMsg(error); return }
    showMsg(`Batch cloned successfully!`, 'success')
    if (data) router.push(`/batch-details/batch/${data.id}`)
  }

  async function handleExport() {
    if (!batch) return
    setExporting(true)
    try {
      await exportSessionsToXlsx(batch, sessions)
    } catch {
      showMsg('Export failed')
    }
    setExporting(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
      </div>
    )
  }

  if (!batch) {
    return (
      <div className="py-16 text-center">
        <p className="text-slate-400">Batch not found.</p>
        <button
          onClick={() => router.push('/batch-details/dashboard')}
          className="mt-4 text-sm text-cyan-300 underline underline-offset-4"
        >
          Back to Dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-8 text-slate-200">
      {/* Batch header */}
      <div className="mb-6 flex flex-col justify-between gap-5 rounded-[28px] border border-slate-700/60 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.12),transparent_24%),radial-gradient(circle_at_right,rgba(99,102,241,0.14),transparent_28%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(5,10,20,0.98))] p-6 shadow-[0_30px_80px_rgba(2,6,23,0.45)] lg:flex-row lg:items-start">
        <div className="flex items-start gap-4">
          <button
            onClick={() => router.push('/batch-details/dashboard')}
            className="mt-0.5 rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-sm text-slate-400 transition hover:border-slate-600 hover:text-slate-200"
          >
            ← Batches
          </button>
          <div>
            <h2 className="text-2xl font-bold text-white">
              {batch.batch_name || <span className="italic text-slate-500">Untitled Batch</span>}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {batch.program_name && <span className="text-sm text-slate-300">{batch.program_name}</span>}
              {batch.institute_name && <span className="text-sm text-slate-500">· {batch.institute_name}</span>}
              {batch.status && (
                <span
                  className="rounded-full border border-white/10 px-2.5 py-1 text-xs font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                  style={{ background: STATUS_BG[batch.status] ?? '#0f172a', color: STATUS_COLOR[batch.status] ?? '#e2e8f0' }}
                >
                  {batch.status}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {msg && (
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${msg.type === 'error' ? 'border border-rose-500/30 bg-rose-500/10 text-rose-300' : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'}`}>
              {msg.text}
            </span>
          )}
          <button
            onClick={handleExport}
            disabled={exporting || sessions.length === 0}
            className="inline-flex h-10 items-center gap-1 rounded-full border border-slate-700 bg-slate-900/80 px-4 text-sm font-medium text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 disabled:opacity-40"
          >
            {exporting ? 'Exporting…' : '↓ Export'}
          </button>
          {canEdit && (
            <button
              onClick={handleClone}
              disabled={cloning}
              className="inline-flex h-10 items-center gap-1 rounded-full border border-slate-700 bg-slate-900/80 px-4 text-sm font-medium text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 disabled:opacity-40"
            >
              {cloning ? 'Cloning…' : '⧉ Clone'}
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex h-10 items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-4 text-sm font-medium text-rose-300 transition hover:bg-rose-500/20"
            >
              🗑 Delete
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-2 rounded-[22px] border border-slate-800/80 bg-slate-950/60 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        {(['overview', 'sessions', 'calendar'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-2 text-sm font-medium capitalize transition ${
              tab === t
                ? 'bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-400/30 shadow-[0_10px_30px_rgba(34,211,238,0.14)]'
                : 'text-slate-400 hover:bg-slate-900/60 hover:text-slate-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {tab === 'overview' && (
        <div className="flex flex-col gap-8">
          <BatchInfoGrid batch={batch} canEdit={canEdit} onUpdate={updateBatch} />
          <TeamMembersGrid batch={batch} canEdit={canEdit} onUpdate={updateBatch} />
          <GradingPolicyGrid batch={batch} canEdit={canEdit} onUpdate={updateBatch} />
        </div>
      )}

      {tab === 'sessions' && (
        <SessionsGrid
          sessions={sessions}
          canEdit={canEdit}
          isAdmin={isAdmin}
          onAdd={addSession}
          onUpdate={updateSession}
          onDelete={deleteSession}
        />
      )}

      {tab === 'calendar' && <BatchCalendar sessions={sessions} />}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-[24px] border border-slate-700/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
            <h3 className="text-lg font-bold text-white">Delete Batch</h3>
            <p className="mt-2 text-sm text-slate-400">
              Are you sure you want to delete{' '}
              <strong>{batch.batch_name || 'this batch'}</strong>?
              All sessions will also be deleted. This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-full border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-900"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteBatch}
                disabled={deleting}
                className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
