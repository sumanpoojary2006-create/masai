'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useBatches } from '@/hooks/useBatch'
import { useMyRole } from '@/hooks/useUserRole'
import { BatchListGrid } from '@/components/batch/BatchListGrid'
import { exportBatchListToXlsx } from '@/lib/batch-export'
import { createBrowserSupabase } from '@/lib/supabase-browser'

type SyncState = 'idle' | 'loading' | 'success' | 'error'

export function BatchDashboardClient() {
  const router = useRouter()
  const { batches, loading, refetch } = useBatches()
  const { canEdit, isAdmin } = useMyRole()
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [syncState, setSyncState] = useState<SyncState>('idle')
  const [syncMsg, setSyncMsg] = useState('')
  const [complianceState, setComplianceState] = useState<SyncState>('idle')
  const [complianceMsg, setComplianceMsg] = useState('')

  async function handleSyncWeek() {
    setSyncState('loading')
    setSyncMsg('')
    try {
      const res = await fetch('/api/admin/sync-week', { method: 'POST' })
      const json = await res.json()
      setSyncState(res.ok ? 'success' : 'error')
      setSyncMsg(json.message ?? (res.ok ? 'Done.' : 'Failed.'))
    } catch {
      setSyncState('error')
      setSyncMsg('Network error. Try again.')
    }
  }

  async function handleCompliance() {
    setComplianceState('loading')
    setComplianceMsg('')
    try {
      const res = await fetch('/api/admin/compliance', { method: 'POST' })
      const json = await res.json()
      setComplianceState(res.ok ? 'success' : 'error')
      setComplianceMsg(json.message ?? (res.ok ? 'Done.' : 'Failed.'))
    } catch {
      setComplianceState('error')
      setComplianceMsg('Network error. Try again.')
    }
  }

  function showErr(msg: string) {
    setErrMsg(msg)
    setTimeout(() => setErrMsg(null), 4000)
  }

  const filtered = batches.filter(b => {
    const q = search.toLowerCase()
    return (
      !q ||
      b.batch_name?.toLowerCase().includes(q) ||
      b.program_name?.toLowerCase().includes(q) ||
      b.institute_name?.toLowerCase().includes(q) ||
      b.domain?.toLowerCase().includes(q)
    )
  })

  async function handleCreateBatch() {
    setCreating(true)
    const supabase = createBrowserSupabase()
    const { data, error } = await supabase.from('batches').insert({}).select().single()
    setCreating(false)
    if (error) { showErr(error.message); return }
    await refetch()
    router.push(`/batch-details/batch/${data.id}`)
  }

  async function handleExport() {
    if (batches.length === 0) return
    setExporting(true)
    try {
      await exportBatchListToXlsx(batches)
    } catch (e) {
      showErr('Export failed')
    }
    setExporting(false)
  }

  return (
    <div className="space-y-5 text-slate-200">
      {/* Toolbar */}
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Batches</h2>
          <p className="mt-0.5 text-sm text-slate-400">
            {batches.length} batch{batches.length !== 1 ? 'es' : ''} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          {errMsg && <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs text-rose-300">{errMsg}</span>}
          <button
            onClick={handleExport}
            disabled={exporting || batches.length === 0}
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/80 px-4 text-sm font-medium text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 disabled:opacity-40"
          >
            {exporting ? 'Exporting…' : '↓ Export'}
          </button>
          {canEdit && (
            <button
              onClick={handleCreateBatch}
              disabled={creating}
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-cyan-400/20 bg-[linear-gradient(135deg,rgba(6,182,212,0.92),rgba(20,184,166,0.88))] px-5 text-sm font-semibold text-slate-950 shadow-[0_12px_32px_rgba(34,211,238,0.2)] transition hover:translate-y-[-1px] hover:shadow-[0_16px_36px_rgba(34,211,238,0.28)] disabled:opacity-50"
            >
              {creating ? 'Creating…' : '+ New Batch'}
            </button>
          )}
        </div>
      </div>

      {/* Admin Controls */}
      {isAdmin && (
        <div
          style={{
            background: '#0d1117',
            border: '1px solid #1f2937',
            borderRadius: '14px',
            padding: '16px 20px',
            marginBottom: '4px',
          }}
        >
          <p style={{ color: '#64748b', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
            Admin Controls
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {/* Sync This Week */}
            <div style={{ background: '#111827', border: '1px solid #1d4ed840', borderRadius: '10px', padding: '14px' }}>
              <p style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>Sync This Week's Lectures</p>
              <p style={{ color: '#64748b', fontSize: '11px', marginBottom: '12px', lineHeight: '1.5' }}>
                Pull latest sessions from LMS for all users.
              </p>
              <button
                onClick={handleSyncWeek}
                disabled={syncState === 'loading'}
                style={{
                  background: '#1d4ed8',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '9999px',
                  padding: '5px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: syncState === 'loading' ? 'not-allowed' : 'pointer',
                  opacity: syncState === 'loading' ? 0.6 : 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {syncState === 'loading' && <Spinner />}
                {syncState === 'loading' ? 'Syncing…' : 'Sync Lectures'}
              </button>
              {syncMsg && (
                <p style={{ marginTop: '8px', fontSize: '11px', color: syncState === 'error' ? '#f87171' : '#34d399' }}>
                  {syncState === 'success' ? '✓ ' : '✗ '}{syncMsg}
                </p>
              )}
            </div>

            {/* Compliance / Sync Up */}
            <div style={{ background: '#111827', border: '1px solid #05966940', borderRadius: '10px', padding: '14px' }}>
              <p style={{ color: '#e2e8f0', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>Sync Up — Compliance Check</p>
              <p style={{ color: '#64748b', fontSize: '11px', marginBottom: '12px', lineHeight: '1.5' }}>
                Run compliance for all users &amp; send Slack notifications.
              </p>
              <button
                onClick={handleCompliance}
                disabled={complianceState === 'loading'}
                style={{
                  background: '#059669',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '9999px',
                  padding: '5px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: complianceState === 'loading' ? 'not-allowed' : 'pointer',
                  opacity: complianceState === 'loading' ? 0.6 : 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {complianceState === 'loading' && <Spinner />}
                {complianceState === 'loading' ? 'Running…' : 'Sync Up'}
              </button>
              {complianceMsg && (
                <p style={{ marginTop: '8px', fontSize: '11px', color: complianceState === 'error' ? '#f87171' : '#34d399' }}>
                  {complianceState === 'success' ? '✓ ' : '✗ '}{complianceMsg}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by batch name, program, institute, domain…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-sm rounded-full border border-slate-700 bg-slate-950/80 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/20"
        />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
        </div>
      ) : (
        <div className="ag-theme-quartz overflow-hidden rounded-[22px] border border-slate-800/90 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.96))]" style={{ height: '600px' }}>
          <BatchListGrid batches={filtered} />
        </div>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <span style={{
      width: '11px', height: '11px', borderRadius: '50%',
      border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff',
      display: 'inline-block', animation: 'bw-spin 0.7s linear infinite',
    }}>
      <style>{`@keyframes bw-spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  )
}
