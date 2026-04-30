import { useRef, useCallback } from 'react'
import { AgGridReact } from 'ag-grid-react'
import type { CellValueChangedEvent, ColDef } from 'ag-grid-community'
import { Box, Text, useToast } from '@chakra-ui/react'
import type { Batch } from '../../types'
import {
  BATCH_STATUS_OPTIONS,
  DOMAIN_OPTIONS,
  LANGUAGE_OPTIONS,
  MODEL_NUMBER_OPTIONS,
} from '../../constants/options'

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

export default function BatchInfoGrid({ batch, canEdit, onUpdate }: Props) {
  const gridRef = useRef<AgGridReact<BatchFieldRow>>(null)
  const toast = useToast()

  const columnDefs: ColDef<BatchFieldRow>[] = [
    {
      field: 'label',
      headerName: 'Field',
      width: 240,
      editable: false,
      cellStyle: { fontWeight: 500, color: '#4a5568', background: '#f7fafc' },
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
        if (!val) return <span style={{ color: '#a0aec0', fontStyle: 'italic' }}>—</span>
        if (params.data?.type === 'url') {
          return (
            <a
              href={val}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#3182ce', textDecoration: 'underline' }}
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
        toast({ title: 'Save failed', description: error, status: 'error', duration: 3000 })
        e.node.setDataValue('value', e.oldValue)
      }
    },
    [onUpdate, toast]
  )

  const rowData = buildRows(batch)

  return (
    <Box>
      <Text fontWeight="600" fontSize="sm" color="gray.600" mb={2} textTransform="uppercase" letterSpacing="0.05em">
        Batch Information
      </Text>
      <Box className="ag-theme-quartz" height={`${rowData.length * 38 + 44}px`} border="1px" borderColor="gray.200" borderRadius="md" overflow="hidden">
        <AgGridReact<BatchFieldRow>
          ref={gridRef}
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
      </Box>
    </Box>
  )
}
