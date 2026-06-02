'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useBatches } from '@/hooks/useBatch'
import { useMyRole } from '@/hooks/useUserRole'
import { BatchListGrid } from '@/components/batch/BatchListGrid'
import { exportBatchListToXlsx } from '@/lib/batch-export'
import { createBrowserSupabase } from '@/lib/supabase-browser'

export function BatchDashboardClient() {
  const router = useRouter()
  const { batches, loading, refetch } = useBatches()
  const { canEdit } = useMyRole()
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
            className="theme-button-secondary inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium disabled:opacity-40"
          >
            {exporting ? 'Exporting…' : '↓ Export'}
          </button>
{canEdit && (
            <button
              onClick={handleCreateBatch}
              disabled={creating}
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-cyan-300/30 bg-[linear-gradient(135deg,rgba(103,232,249,0.95),rgba(45,212,191,0.9))] px-5 text-sm font-semibold text-slate-950 shadow-[0_12px_32px_rgba(34,211,238,0.22)] transition hover:translate-y-[-1px] hover:shadow-[0_16px_36px_rgba(34,211,238,0.30)] disabled:opacity-50"
            >
              {creating ? 'Creating…' : '+ New Batch'}
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by batch name, program, institute, domain…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="theme-input w-full max-w-sm rounded-full px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-300/20"
        />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
        </div>
      ) : (
        <div className="admin-glass-strong overflow-hidden rounded-[22px]" style={{ height: '600px' }}>
          <BatchListGrid batches={filtered} />
        </div>
      )}
    </div>
  )
}
