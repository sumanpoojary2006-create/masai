'use client'
import { useRef, useCallback, useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import type { CellValueChangedEvent, ColDef } from 'ag-grid-community'
import { agDarkTheme } from '@/lib/ag-theme'
import type { Batch } from '@/lib/batch-types'
import {
  BATCH_STATUS_OPTIONS,
  DOMAIN_OPTIONS,
  LANGUAGE_OPTIONS,
  MODEL_NUMBER_OPTIONS,
} from '@/lib/batch-constants'

ModuleRegistry.registerModules([AllCommunityModule])

interface BatchFieldRow {
  id: string
  label: string
  field: keyof Batch
  value: string | number | null
  type: 'text' | 'select' | 'date' | 'number' | 'url'
  options?: string[]
}

interface Props {
  batch: Batch
  canEdit: boolean
  onUpdate: (updates: Partial<Batch>) => Promise<{ error: string | null }>
}

function buildRows(batch: Batch): BatchFieldRow[] {
  return [
    { id: 'batch_name', label: 'Batch Name', field: 'batch_name', value: batch.batch_name, type: 'text' },
    { id: 'program_name', label: 'Program Name', field: 'program_name', value: batch.program_name, type: 'text' },
    { id: 'institute_name', label: 'Institute Name', field: 'institute_name', value: batch.institute_name, type: 'text' },
    { id: 'model_number', label: 'Model Number', field: 'model_number', value: batch.model_number != null ? String(batch.model_number) : null, type: 'select', options: MODEL_NUMBER_OPTIONS },
    { id: 'domain', label: 'Domain', field: 'domain', value: batch.domain, type: 'select', options: DOMAIN_OPTIONS },
    { id: 'language', label: 'Language', field: 'language', value: batch.language, type: 'select', options: LANGUAGE_OPTIONS },
    { id: 'status', label: 'Status', field: 'status', value: batch.status, type: 'select', options: BATCH_STATUS_OPTIONS },
    { id: 'start_date', label: 'Start Date', field: 'start_date', value: batch.start_date, type: 'date' },
    { id: 'end_date_scheduled', label: 'End Date (Scheduled)', field: 'end_date_scheduled', value: batch.end_date_scheduled, type: 'date' },
    { id: 'actual_end_date', label: 'Actual End Date', field: 'actual_end_date', value: batch.actual_end_date, type: 'date' },
    { id: 'website_link', label: 'Website / Landing Page', field: 'website_link', value: batch.website_link, type: 'url' },
  ]
}

export function BatchInfoGrid({ batch, canEdit, onUpdate }: Props) {
  const gridRef = useRef<AgGridReact<BatchFieldRow>>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  function showErr(msg: string) {
    setErrMsg(msg)
    setTimeout(() => setErrMsg(null), 3000)
  }

  const columnDefs: ColDef<BatchFieldRow>[] = [
    {
      field: 'label',
      headerName: 'Field',
      width: 240,
      editable: false,
      cellStyle: { fontWeight: 600, color: '#cbd5e1', background: '#0f172a' },
    },
    {
      field: 'value',
      headerName: 'Value',
      flex: 1,
      editable: canEdit,
      cellEditorSelector: params => {
        const row = params.data as BatchFieldRow
        if (row.type === 'select') {
          return { component: 'agSelectCellEditor', params: { values: ['', ...(row.options ?? [])] } }
        }
        if (row.type === 'date') {
          return { component: 'agDateStringCellEditor' }
        }
        return { component: 'agTextCellEditor' }
      },
      valueFormatter: params => {
        if (params.value == null || params.value === '') return '—'
        return String(params.value)
      },
      cellRenderer: (params: { value: string | null; data: BatchFieldRow }) => {
        const val = params.value
        if (!val) return <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>—</span>
        if (params.data?.type === 'url') {
          return (
            <a
              href={val}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#67e8f9', textDecoration: 'underline' }}
              onClick={e => e.stopPropagation()}
            >
              {val}
            </a>
          )
        }
        return <span>{val}</span>
      },
    },
  ]

  const onCellValueChanged = useCallback(
    async (e: CellValueChangedEvent<BatchFieldRow>) => {
      const row = e.data
      let newVal: string | number | null = e.newValue === '' ? null : e.newValue
      if (row.field === 'model_number' && newVal != null) {
        newVal = Number(newVal)
      }
      const { error } = await onUpdate({ [row.field]: newVal } as Partial<Batch>)
      if (error) {
        showErr(error)
        e.node.setDataValue('value', e.oldValue)
      }
    },
    [onUpdate]
  )

  const rowData = buildRows(batch)

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Batch Information</p>
        {errMsg && <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-xs text-rose-300">{errMsg}</span>}
      </div>
      <div
        className="overflow-hidden rounded-[18px] border border-slate-800/90 bg-slate-950/70"
        style={{ height: `${rowData.length * 38 + 44}px` }}
      >
        <AgGridReact<BatchFieldRow>
          ref={gridRef}
          theme={agDarkTheme}
          rowData={rowData}
          columnDefs={columnDefs}
          singleClickEdit={true}
          stopEditingWhenCellsLoseFocus={true}
          onCellValueChanged={onCellValueChanged}
          getRowId={p => p.data.id}
          suppressMovableColumns={true}
          suppressColumnVirtualisation={true}
          domLayout="normal"
          headerHeight={40}
          rowHeight={38}
        />
      </div>
    </div>
  )
}
