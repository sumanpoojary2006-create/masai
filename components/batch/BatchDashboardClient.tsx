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
  const { canEdit, isAdmin } = useMyRole()
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
    } catch (e) {
      showErr('Export failed')
    }
    setExporting(false)
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-ink">Batches</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            {batches.length} batch{batches.length !== 1 ? 'es' : ''} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          {errMsg && <span className="rounded bg-red-50 px-3 py-1 text-xs text-red-600">{errMsg}</span>}
          <button
            onClick={handleExport}
            disabled={exporting || batches.length === 0}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-gray-300 px-4 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
          >
            {exporting ? 'Exporting…' : '↓ Export'}
          </button>
          {isAdmin && (
            <a
              href="/batch-details/admin"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-gray-300 px-4 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              ⚙ Users
            </a>
          )}
          {canEdit && (
            <button
              onClick={handleCreateBatch}
              disabled={creating}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
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
          className="w-full max-w-sm rounded-full border border-gray-300 bg-white px-4 py-2 text-sm focus:border-blue-400 focus:outline-none"
        />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        </div>
      ) : (
        <div className="ag-theme-quartz overflow-hidden rounded-md border border-gray-200 bg-white" style={{ height: '600px' }}>
          <BatchListGrid batches={filtered} />
        </div>
      )}
    </div>
  )
}
