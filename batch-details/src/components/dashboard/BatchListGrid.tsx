import { useCallback } from 'react'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef, RowClickedEvent } from 'ag-grid-community'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@chakra-ui/react'
import type { Batch } from '../../types'
import { STATUS_COLOR } from '../../constants/options'

interface Props {
  batches: Batch[]
}

export default function BatchListGrid({ batches }: Props) {
  const navigate = useNavigate()

  const columnDefs: ColDef<Batch>[] = [
    {
      field: 'batch_name',
      headerName: 'Batch Name',
      width: 220,
      cellStyle: { fontWeight: 600, color: '#2b6cb0', cursor: 'pointer' },
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
      width: 160,
      valueFormatter: params => params.value ?? '—',
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 160,
      cellRenderer: (params: { value: string | null }) => {
        if (!params.value) return <span style={{ color: '#a0aec0' }}>—</span>
        return (
          <Badge colorScheme={STATUS_COLOR[params.value] ?? 'gray'} fontSize="xs">
            {params.value}
          </Badge>
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
      width: 110,
      valueFormatter: params => params.value ?? '—',
    },
  ]

  const onRowClicked = useCallback(
    (e: RowClickedEvent<Batch>) => {
      if (e.data?.id) navigate(`/batch/${e.data.id}`)
    },
    [navigate]
  )

  return (
    <AgGridReact<Batch>
      rowData={batches}
      columnDefs={columnDefs}
      onRowClicked={onRowClicked}
      getRowId={p => p.data.id}
      suppressMovableColumns={false}
      headerHeight={40}
      rowHeight={42}
      rowClass="cursor-pointer"
      overlayNoRowsTemplate="<span style='color:#a0aec0;font-size:13px'>No batches found. Create your first batch.</span>"
    />
  )
}
