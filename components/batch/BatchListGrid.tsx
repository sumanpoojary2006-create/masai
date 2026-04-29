'use client'
import { useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { AgGridReact } from 'ag-grid-react'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community'
import type { ColDef, RowClickedEvent } from 'ag-grid-community'
import type { Batch } from '@/lib/batch-types'
import { STATUS_COLOR, STATUS_BG } from '@/lib/batch-constants'
import { agDarkTheme } from '@/lib/ag-theme'

ModuleRegistry.registerModules([AllCommunityModule])

interface Props {
  batches: Batch[]
}

export function BatchListGrid({ batches }: Props) {
  const router = useRouter()
  const gridRef = useRef<AgGridReact<Batch>>(null)

  const columnDefs: ColDef<Batch>[] = [
    {
      field: 'batch_name',
      headerName: 'Batch Name',
      width: 220,
      cellStyle: { fontWeight: 700, color: '#67e8f9', cursor: 'pointer' },
      valueFormatter: params => params.value ?? '—',
    },
    {
      field: 'program_name',
      headerName: 'Program',
      flex: 1,
      minWidth: 240,
      valueFormatter: params => params.value ?? '—',
    },
    {
      field: 'institute_name',
      headerName: 'Institute',
      width: 200,
      valueFormatter: params => params.value ?? '—',
    },
    {
      field: 'domain',
      headerName: 'Domain',
      width: 170,
      valueFormatter: params => params.value ?? '—',
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 170,
      cellRenderer: (params: { value: string | null }) => {
        if (!params.value) return <span style={{ color: '#9ca3af' }}>—</span>
        return (
          <span
            style={{
              background: STATUS_BG[params.value] ?? '#f3f4f6',
              color: STATUS_COLOR[params.value] ?? '#374151',
              border: '1px solid rgba(255,255,255,0.08)',
              padding: '4px 10px',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: 600,
            }}
          >
            {params.value}
          </span>
        )
      },
    },
    {
      field: 'start_date',
      headerName: 'Start Date',
      width: 130,
      valueFormatter: params => params.value ?? '—',
    },
    {
      field: 'language',
      headerName: 'Language',
      width: 120,
      valueFormatter: params => params.value ?? '—',
    },
  ]

  const onRowClicked = useCallback(
    (e: RowClickedEvent<Batch>) => {
      if (e.data?.id) router.push(`/batch-details/batch/${e.data.id}`)
    },
    [router]
  )

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <AgGridReact<Batch>
        ref={gridRef}
        theme={agDarkTheme}
        rowData={batches}
        columnDefs={columnDefs}
        onRowClicked={onRowClicked}
        getRowId={p => p.data.id}
        suppressMovableColumns={false}
        headerHeight={40}
        rowHeight={42}
        rowClass="cursor-pointer"
        overlayNoRowsTemplate="<span style='color:#64748b;font-size:13px'>No batches found. Create your first batch.</span>"
      />
    </div>
  )
}
