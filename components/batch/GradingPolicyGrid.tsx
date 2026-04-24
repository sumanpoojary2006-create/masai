'use client'
import { useRef, useCallback, useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import type { CellValueChangedEvent, ColDef } from 'ag-grid-community'
import type { Batch, GradingComponent } from '@/lib/batch-types'

interface GradingRow extends GradingComponent {
  rowId: string
}

interface Props {
  batch: Batch
  canEdit: boolean
  onUpdate: (updates: Partial<Batch>) => Promise<{ error: string | null }>
}

export function GradingPolicyGrid({ batch, canEdit, onUpdate }: Props) {
  const gridRef = useRef<AgGridReact<GradingRow>>(null)
  const [rows, setRows] = useState<GradingRow[]>(
    () => (batch.grading_policy ?? []).map((g, i) => ({ ...g, rowId: `g_${i}_${Date.now()}` }))
  )
  const [errMsg, setErrMsg] = useState<string | null>(null)

  function showErr(msg: string) {
    setErrMsg(msg)
    setTimeout(() => setErrMsg(null), 3000)
  }

  const persist = useCallback(
    async (newRows: GradingRow[]) => {
      const policy: GradingComponent[] = newRows.map(r => ({ component: r.component, weightage: r.weightage }))
      const { error } = await onUpdate({ grading_policy: policy })
      if (error) showErr(error)
    },
    [onUpdate]
  )

  const totalWeightage = rows.reduce((sum, r) => sum + (r.weightage ?? 0), 0)
  const totalColor = totalWeightage === 100 ? '#16a34a' : totalWeightage > 100 ? '#dc2626' : '#ea580c'

  const columnDefs: ColDef<GradingRow>[] = [
    {
      headerName: '#',
      width: 50,
      editable: false,
      valueGetter: params => (params.node?.rowIndex ?? 0) + 1,
      cellStyle: { color: '#9ca3af', textAlign: 'center' },
    },
    {
      field: 'component',
      headerName: 'Component Name',
      flex: 1,
      editable: canEdit,
      cellEditor: 'agTextCellEditor',
      valueFormatter: params => params.value ?? '—',
    },
    {
      field: 'weightage',
      headerName: 'Weightage (%)',
      width: 150,
      editable: canEdit,
      cellEditor: 'agNumberCellEditor',
      valueFormatter: params => (params.value != null ? `${params.value}%` : '—'),
      cellStyle: { textAlign: 'right' },
    },
    ...(canEdit
      ? [{
          headerName: '',
          width: 50,
          editable: false,
          cellRenderer: (params: { data: GradingRow }) => (
            <button
              onClick={() => removeRow(params.data.rowId)}
              className="flex h-full items-center justify-center text-red-400 hover:text-red-600"
              title="Remove"
            >
              ×
            </button>
          ),
        } as ColDef<GradingRow>]
      : []),
  ]

  const onCellValueChanged = useCallback(
    async (e: CellValueChangedEvent<GradingRow>) => {
      const updated = rows.map(r =>
        r.rowId === e.data.rowId ? { ...r, [e.colDef.field!]: e.newValue } : r
      )
      setRows(updated)
      await persist(updated)
    },
    [rows, persist]
  )

  function addRow() {
    const newRow: GradingRow = { rowId: `g_${Date.now()}`, component: '', weightage: null }
    const updated = [...rows, newRow]
    setRows(updated)
    persist(updated)
  }

  function removeRow(rowId: string) {
    const updated = rows.filter(r => r.rowId !== rowId)
    setRows(updated)
    persist(updated)
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Grading Policy</p>
        <div className="flex items-center gap-3">
          {errMsg && <span className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-600">{errMsg}</span>}
          <span className="text-sm font-semibold" style={{ color: totalColor }}>
            Total: {totalWeightage}%
          </span>
          {canEdit && (
            <button
              onClick={addRow}
              className="inline-flex items-center gap-1 rounded-full border border-blue-300 px-3 py-0.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
            >
              + Add Component
            </button>
          )}
        </div>
      </div>
      <div
        className="ag-theme-quartz overflow-hidden rounded-md border border-gray-200"
        style={{ height: rows.length > 0 ? `${rows.length * 38 + 44}px` : '82px' }}
      >
        <AgGridReact<GradingRow>
          ref={gridRef}
          theme="legacy"
          rowData={rows}
          columnDefs={columnDefs}
          singleClickEdit={true}
          stopEditingWhenCellsLoseFocus={true}
          onCellValueChanged={onCellValueChanged}
          getRowId={p => p.data.rowId}
          suppressMovableColumns={true}
          domLayout="normal"
          headerHeight={40}
          rowHeight={38}
          overlayNoRowsTemplate="<span style='color:#9ca3af;font-size:13px'>No grading components added yet</span>"
        />
      </div>
    </div>
  )
}
