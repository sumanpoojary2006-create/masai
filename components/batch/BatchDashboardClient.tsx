'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useBatches } from '@/hooks/useBatch'
import { useMyRole } from '@/hooks/useUserRole'
import { BatchListGrid } from '@/components/batch/BatchListGrid'
import { AdminPanelInline } from '@/components/batch/AdminPanelInline'
import { exportBatchListToXlsx } from '@/lib/batch-export'
import { createBrowserSupabase } from '@/lib/supabase-browser'

type Tab = 'batches' | 'admin'

export function BatchDashboardClient() {
  const router = useRouter()
  const { batches, loading, refetch } = useBatches()
  const { canEdit, isAdmin } = useMyRole()
  const [tab, setTab] = useState<Tab>('batches')
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)

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
    } catch {
      showErr('Export failed')
    }
    setExporting(false)
  }

  return (
    <div className="space-y-5 text-slate-200">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">
            {tab === 'batches' ? 'Batches' : 'Global Admin'}
          </h2>
          <p className="mt-0.5 text-sm text-slate-400">
            {tab === 'batches'
              ? `${batches.length} batch${batches.length !== 1 ? 'es' : ''} total`
              : 'MasaiLens compliance — users, tasks & leaderboard'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {errMsg && (
            <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs text-rose-300">
              {errMsg}
            </span>
          )}
          {tab === 'batches' && (
            <>
              <button
                onClick={handleExport}
                disabled={exporting || batches.length === 0}
                className="inline-flex h-10 items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/80 px-4 text-sm font-medium text-slate-300 transition hover:border-slate-600 hover:bg-slate-800 disabled:opacity-40"
              >
                {exporting ? 'Exporting…' : '↓ Export'}
              </button>
              {isAdmin && (
                <a
                  href="/batch-details/admin"
                  className="inline-flex h-10 items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/80 px-4 text-sm font-medium text-slate-300 transition hover:border-slate-600 hover:bg-slate-800"
                >
                  ⚙ Users
                </a>
              )}
              {canEdit && (
                <button
                  onClick={handleCreateBatch}
                  disabled={creating}
                  className="inline-flex h-10 items-center gap-1.5 rounded-full border border-cyan-400/20 bg-[linear-gradient(135deg,rgba(6,182,212,0.92),rgba(20,184,166,0.88))] px-5 text-sm font-semibold text-slate-950 shadow-[0_12px_32px_rgba(34,211,238,0.2)] transition hover:-translate-y-px hover:shadow-[0_16px_36px_rgba(34,211,238,0.28)] disabled:opacity-50"
                >
                  {creating ? 'Creating…' : '+ New Batch'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid #1f2937', paddingBottom: '0' }}>
        {([
          { key: 'batches', label: '📦 Batches' },
          { key: 'admin',   label: '🌐 Global Admin' },
        ] as { key: Tab; label: string }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 18px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              border: 'none',
              background: 'transparent',
              color: tab === t.key ? '#6366f1' : '#475569',
              borderBottom: tab === t.key ? '2px solid #6366f1' : '2px solid transparent',
              marginBottom: '-1px',
              transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Batches tab */}
      {tab === 'batches' && (
        <>
          <div>
            <input
              type="text"
              placeholder="Search by batch name, program, institute, domain…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full max-w-sm rounded-full border border-slate-700 bg-slate-950/80 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/20"
            />
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
            </div>
          ) : (
            <div
              className="ag-theme-quartz overflow-hidden rounded-[22px] border border-slate-800/90 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.96))]"
              style={{ height: '600px' }}
            >
              <BatchListGrid batches={filtered} />
            </div>
          )}
        </>
      )}

      {/* Global Admin tab */}
      {tab === 'admin' && <AdminPanelInline />}
    </div>
  )
}
