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
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    )
  }

  if (!batch) {
    return (
      <div className="py-16 text-center">
        <p className="text-gray-500">Batch not found.</p>
        <button
          onClick={() => router.push('/batch-details/dashboard')}
          className="mt-4 text-sm text-blue-600 underline"
        >
          Back to Dashboard
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Batch header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <button
            onClick={() => router.push('/batch-details/dashboard')}
            className="mt-0.5 text-sm text-gray-400 hover:text-gray-600"
          >
            ← Batches
          </button>
          <div>
            <h2 className="text-xl font-bold text-ink">
              {batch.batch_name || <span className="italic text-gray-400">Untitled Batch</span>}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {batch.program_name && <span className="text-sm text-gray-600">{batch.program_name}</span>}
              {batch.institute_name && <span className="text-sm text-gray-400">· {batch.institute_name}</span>}
              {batch.status && (
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-semibold"
                  style={{ background: STATUS_BG[batch.status] ?? '#f3f4f6', color: STATUS_COLOR[batch.status] ?? '#374151' }}
                >
                  {batch.status}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {msg && (
            <span className={`rounded px-3 py-1 text-xs font-medium ${msg.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>
              {msg.text}
            </span>
          )}
          <button
            onClick={handleExport}
            disabled={exporting || sessions.length === 0}
            className="inline-flex h-9 items-center gap-1 rounded-full border border-gray-300 px-4 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            {exporting ? 'Exporting…' : '↓ Export'}
          </button>
          {canEdit && (
            <button
              onClick={handleClone}
              disabled={cloning}
              className="inline-flex h-9 items-center gap-1 rounded-full border border-gray-300 px-4 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
            >
              {cloning ? 'Cloning…' : '⧉ Clone'}
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex h-9 items-center gap-1 rounded-full border border-red-200 px-4 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              🗑 Delete
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-gray-200">
        {(['overview', 'sessions', 'calendar'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition ${
              tab === t
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-800'
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
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-ink">Delete Batch</h3>
            <p className="mt-2 text-sm text-gray-600">
              Are you sure you want to delete{' '}
              <strong>{batch.batch_name || 'this batch'}</strong>?
              All sessions will also be deleted. This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteBatch}
                disabled={deleting}
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
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
