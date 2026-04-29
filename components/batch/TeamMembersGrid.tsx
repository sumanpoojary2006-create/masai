'use client'
import { useRef, useCallback, useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import type { CellValueChangedEvent, ColDef } from 'ag-grid-community'
import { agDarkTheme } from '@/lib/ag-theme'
import type { Batch, TeamMembers } from '@/lib/batch-types'

interface TeamRow {
  id: string
  role: string
  name: string | null
  isTA: boolean
  taIndex?: number
}

interface Props {
  batch: Batch
  canEdit: boolean
  onUpdate: (updates: Partial<Batch>) => Promise<{ error: string | null }>
}

function buildRows(tm: TeamMembers): TeamRow[] {
  const rows: TeamRow[] = [
    { id: 'curriculum_coordinator', role: 'Curriculum Coordinator', name: tm.curriculum_coordinator ?? null, isTA: false },
    { id: 'instructor_1', role: 'Instructor 1 (IIT/IIM Professor)', name: tm.instructor_1 ?? null, isTA: false },
    { id: 'instructor_2', role: 'Instructor 2 (Industry Mentor)', name: tm.instructor_2 ?? null, isTA: false },
    { id: 'instructor_3', role: 'Instructor 3 (Industry Mentor)', name: tm.instructor_3 ?? null, isTA: false },
  ]
  const tas = tm.teaching_assistants ?? []
  tas.forEach((ta, i) => {
    rows.push({ id: `ta_${i}`, role: `Teaching Assistant ${i + 1}`, name: ta, isTA: true, taIndex: i })
  })
  return rows
}

function rowsToTeamMembers(rows: TeamRow[]): TeamMembers {
  const tm: TeamMembers = {}
  for (const row of rows) {
    if (!row.isTA) {
      (tm as Record<string, string | undefined>)[row.id] = row.name ?? undefined
    }
  }
  tm.teaching_assistants = rows.filter(r => r.isTA).map(r => r.name ?? '')
  return tm
}

export function TeamMembersGrid({ batch, canEdit, onUpdate }: Props) {
  const gridRef = useRef<AgGridReact<TeamRow>>(null)
  const [rows, setRows] = useState<TeamRow[]>(() => buildRows(batch.team_members ?? {}))
  const [errMsg, setErrMsg] = useState<string | null>(null)

  function showErr(msg: string) {
    setErrMsg(msg)
    setTimeout(() => setErrMsg(null), 3000)
  }

  const persist = useCallback(
    async (newRows: TeamRow[]) => {
      const { error } = await onUpdate({ team_members: rowsToTeamMembers(newRows) })
      if (error) showErr(error)
    },
    [onUpdate]
  )

  const columnDefs: ColDef<TeamRow>[] = [
    {
      field: 'role',
      headerName: 'Role',
      width: 280,
      editable: false,
      cellStyle: { fontWeight: 600, color: '#cbd5e1', background: '#0f172a' },
    },
    {
      field: 'name',
      headerName: 'Name',
      flex: 1,
      editable: canEdit,
      cellEditor: 'agTextCellEditor',
      valueFormatter: params => params.value ?? '—',
    },
    ...(canEdit
      ? [{
          headerName: '',
          width: 50,
          editable: false,
          cellRenderer: (params: { data: TeamRow }) => {
            if (!params.data?.isTA) return null
            return (
              <button
                onClick={() => removeTA(params.data.taIndex!)}
                className="flex h-full items-center justify-center text-red-400 hover:text-red-600"
                title="Remove TA"
              >
                ×
              </button>
            )
          },
        } as ColDef<TeamRow>]
      : []),
  ]

  const onCellValueChanged = useCallback(
    async (e: CellValueChangedEvent<TeamRow>) => {
      const updated = rows.map(r =>
        r.id === e.data.id ? { ...r, name: e.newValue || null } : r
      )
      setRows(updated)
      await persist(updated)
    },
    [rows, persist]
  )

  function addTA() {
    const taCount = rows.filter(r => r.isTA).length
    const newRow: TeamRow = {
      id: `ta_${taCount}_${Date.now()}`,
      role: `Teaching Assistant ${taCount + 1}`,
      name: null,
      isTA: true,
      taIndex: taCount,
    }
    const updated = [...rows, newRow]
    setRows(updated)
    persist(updated)
  }

  function removeTA(taIndex: number) {
    const updated = rows
      .filter(r => !(r.isTA && r.taIndex === taIndex))
      .map(r => {
        if (r.isTA && r.taIndex! > taIndex) {
          return { ...r, taIndex: r.taIndex! - 1, role: `Teaching Assistant ${r.taIndex!}` }
        }
        return r
      })
    setRows(updated)
    persist(updated)
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Team Members</p>
        <div className="flex items-center gap-3">
          {errMsg && <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-xs text-rose-300">{errMsg}</span>}
          {canEdit && (
            <button
              onClick={addTA}
              className="inline-flex items-center gap-1 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200 transition hover:bg-cyan-400/15"
            >
              + Add TA
            </button>
          )}
        </div>
      </div>
      <div
        className="overflow-hidden rounded-[18px] border border-slate-800/90 bg-slate-950/70"
        style={{ height: `${rows.length * 38 + 44}px` }}
      >
        <AgGridReact<TeamRow>
          ref={gridRef}
          theme={agDarkTheme}
          rowData={rows}
          columnDefs={columnDefs}
          singleClickEdit={true}
          stopEditingWhenCellsLoseFocus={true}
          onCellValueChanged={onCellValueChanged}
          getRowId={p => p.data.id}
          suppressMovableColumns={true}
          domLayout="normal"
          headerHeight={40}
          rowHeight={38}
        />
      </div>
    </div>
  )
}
