'use client'
import { useRef, useCallback, useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import type { CellValueChangedEvent, ColDef, RowClassParams } from 'ag-grid-community'
import { getDay } from 'date-fns'
import type { Session } from '@/lib/batch-types'
import { DAY_OPTIONS, SESSION_ROLE_OPTIONS } from '@/lib/batch-constants'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface Props {
  sessions: Session[]
  canEdit: boolean
  isAdmin: boolean
  onAdd: () => Promise<{ data: Session | null; error: string | null }>
  onUpdate: (id: string, updates: Partial<Session>) => Promise<{ error: string | null }>
  onDelete: (id: string) => Promise<{ error: string | null }>
}

export function SessionsGrid({ sessions, canEdit, isAdmin, onAdd, onUpdate, onDelete }: Props) {
  const gridRef = useRef<AgGridReact<Session>>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  function showErr(msg: string) {
    setErrMsg(msg)
    setTimeout(() => setErrMsg(null), 4000)
  }

  const handleDelete = useCallback(
    async (session: Session) => {
      if (!confirm(`Delete this session?`)) return
      const { error } = await onDelete(session.id)
      if (error) showErr(error)
    },
    [onDelete]
  )

  const columnDefs: ColDef<Session>[] = [
    {
      field: 'date',
      headerName: 'Date',
      width: 130,
      editable: canEdit,
      cellEditor: 'agDateStringCellEditor',
      sort: 'asc',
      valueFormatter: params => params.value ?? '—',
    },
    {
      field: 'day',
      headerName: 'Day',
      width: 110,
      editable: canEdit,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: { values: ['', ...DAY_OPTIONS] },
      valueFormatter: params => params.value ?? '—',
    },
    {
      field: 'start_time',
      headerName: 'Start',
      width: 90,
      editable: canEdit,
      cellEditor: 'agTextCellEditor',
      valueFormatter: params => params.value ?? '—',
    },
    {
      field: 'end_time',
      headerName: 'End',
      width: 90,
      editable: canEdit,
      cellEditor: 'agTextCellEditor',
      valueFormatter: params => params.value ?? '—',
    },
    {
      field: 'module_number',
      headerName: 'Mod #',
      width: 80,
      editable: canEdit,
      cellEditor: 'agNumberCellEditor',
      valueFormatter: params => (params.value != null ? String(params.value) : '—'),
      cellStyle: { textAlign: 'right' },
    },
    {
      field: 'module_name',
      headerName: 'Module Name',
      width: 160,
      editable: canEdit,
      cellEditor: 'agTextCellEditor',
      valueFormatter: params => params.value ?? '—',
    },
    {
      field: 'week_number',
      headerName: 'Wk #',
      width: 70,
      editable: canEdit,
      cellEditor: 'agNumberCellEditor',
      valueFormatter: params => (params.value != null ? String(params.value) : '—'),
      cellStyle: { textAlign: 'right' },
    },
    {
      field: 'session_number',
      headerName: 'Sess #',
      width: 75,
      editable: canEdit,
      cellEditor: 'agNumberCellEditor',
      valueFormatter: params => (params.value != null ? String(params.value) : '—'),
      cellStyle: { textAlign: 'right' },
    },
    {
      field: 'session_title',
      headerName: 'Session Title',
      flex: 1,
      minWidth: 200,
      editable: canEdit,
      cellEditor: 'agTextCellEditor',
      valueFormatter: params => params.value ?? '—',
    },
    {
      field: 'to_be_taken_by',
      headerName: 'Taken By',
      width: 180,
      editable: canEdit,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: { values: ['', ...SESSION_ROLE_OPTIONS] },
      valueFormatter: params => params.value ?? '—',
    },
    {
      field: 'instructor_name',
      headerName: 'Instructor',
      width: 170,
      editable: canEdit,
      cellEditor: 'agTextCellEditor',
      valueFormatter: params => params.value ?? '—',
    },
    {
      field: 'rating',
      headerName: 'Rating',
      width: 80,
      editable: canEdit,
      cellEditor: 'agNumberCellEditor',
      valueFormatter: params => (params.value != null ? String(params.value) : '—'),
      cellStyle: { textAlign: 'right' },
    },
    {
      field: 'zoom_link',
      headerName: 'Zoom',
      width: 80,
      editable: canEdit,
      cellEditor: 'agTextCellEditor',
      cellRenderer: (params: { value: string | null }) => {
        if (!params.value) return <span style={{ color: '#9ca3af' }}>—</span>
        return (
          <a
            href={params.value}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#2563eb', textDecoration: 'underline' }}
            onClick={e => e.stopPropagation()}
          >
            Join
          </a>
        )
      },
    },
    {
      field: 'learning_objectives',
      headerName: 'Learning Objectives',
      width: 200,
      editable: canEdit,
      cellEditor: 'agLargeTextCellEditor',
      cellEditorPopup: true,
      valueFormatter: params => params.value ?? '—',
    },
    {
      field: 'is_end_of_schedule',
      headerName: 'End of Schedule',
      width: 140,
      editable: canEdit,
      cellEditor: 'agSelectCellEditor',
      cellEditorParams: { values: ['', 'true', 'false'] },
      valueGetter: params => {
        const v = params.data?.is_end_of_schedule
        if (v === true) return 'true'
        if (v === false) return 'false'
        return ''
      },
      cellRenderer: (params: { value: string }) => {
        if (params.value === 'true')
          return <span style={{ color: '#dc2626', fontWeight: 600 }}>✓ End</span>
        return <span style={{ color: '#9ca3af' }}>—</span>
      },
    },
    ...(isAdmin
      ? [{
          headerName: '',
          width: 50,
          editable: false,
          pinned: 'right' as const,
          cellRenderer: (params: { data: Session }) => (
            <button
              onClick={() => handleDelete(params.data)}
              className="flex h-full items-center justify-center text-red-400 hover:text-red-600"
              title="Delete session"
            >
              🗑
            </button>
          ),
        } as ColDef<Session>]
      : []),
  ]

  const onCellValueChanged = useCallback(
    async (e: CellValueChangedEvent<Session>) => {
      const field = e.colDef.field as keyof Session
      if (!field) return

      let newVal = e.newValue === '' ? null : e.newValue

      if (field === 'date' && newVal) {
        try {
          const d = new Date(newVal as string)
          const derivedDay = DAY_NAMES[getDay(d)]
          const { error } = await onUpdate(e.data.id, { date: newVal as string, day: derivedDay })
          if (error) {
            showErr(error)
          } else {
            gridRef.current?.api.applyTransaction({ update: [{ ...e.data, date: newVal as string, day: derivedDay }] })
          }
          return
        } catch {
          // fall through
        }
      }

      if (field === 'is_end_of_schedule') {
        newVal = e.newValue === 'true' ? true : e.newValue === 'false' ? false : null
      }

      const { error } = await onUpdate(e.data.id, { [field]: newVal } as Partial<Session>)
      if (error) {
        showErr(error)
        e.node.setDataValue(field, e.oldValue)
      }
    },
    [onUpdate]
  )

  async function handleAddSession() {
    setAdding(true)
    const { error } = await onAdd()
    setAdding(false)
    if (error) showErr(error)
  }

  const getRowClass = (params: RowClassParams<Session>) => {
    if (params.data?.is_end_of_schedule) return 'end-of-schedule-row'
    return ''
  }

  const hasEndOfSchedule = sessions.some(s => s.is_end_of_schedule === true)

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Sessions</p>
          <span className="text-xs text-gray-400">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</span>
          {!hasEndOfSchedule && sessions.length > 0 && (
            <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-600">
              Incomplete Schedule
            </span>
          )}
          {hasEndOfSchedule && (
            <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
              Schedule Complete
            </span>
          )}
          {errMsg && <span className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-600">{errMsg}</span>}
        </div>
        {canEdit && (
          <button
            onClick={handleAddSession}
            disabled={adding}
            className="inline-flex items-center gap-1 rounded-full border border-blue-300 px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50"
          >
            {adding ? 'Adding…' : '+ Add Session'}
          </button>
        )}
      </div>
      <div className="ag-theme-quartz overflow-hidden rounded-md border border-gray-200" style={{ height: '540px' }}>
        <AgGridReact<Session>
          ref={gridRef}
          theme="legacy"
          rowData={sessions}
          columnDefs={columnDefs}
          singleClickEdit={true}
          stopEditingWhenCellsLoseFocus={true}
          onCellValueChanged={onCellValueChanged}
          getRowId={p => p.data.id}
          getRowClass={getRowClass}
          suppressMovableColumns={false}
          headerHeight={40}
          rowHeight={38}
          overlayNoRowsTemplate="<span style='color:#9ca3af;font-size:13px'>No sessions yet. Click 'Add Session' to get started.</span>"
        />
      </div>
    </div>
  )
}
