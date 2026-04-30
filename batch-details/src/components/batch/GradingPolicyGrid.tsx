import { useRef, useCallback, useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import type { CellValueChangedEvent, ColDef } from 'ag-grid-community'
import { Box, Text, Button, HStack, useToast, IconButton } from '@chakra-ui/react'
import { AddIcon, DeleteIcon } from '@chakra-ui/icons'
import type { Batch, GradingComponent } from '../../types'

interface GradingRow extends GradingComponent {
  rowId: string
}

interface Props {
  batch: Batch
  canEdit: boolean
  onUpdate: (updates: Partial<Batch>) => Promise<{ error: string | null }>
}

export default function GradingPolicyGrid({ batch, canEdit, onUpdate }: Props) {
  const gridRef = useRef<AgGridReact<GradingRow>>(null)
  const toast = useToast()

  const [rows, setRows] = useState<GradingRow[]>(
    () => (batch.grading_policy ?? []).map((g, i) => ({ ...g, rowId: `g_${i}_${Date.now()}` }))
  )

  const persist = useCallback(
    async (newRows: GradingRow[]) => {
      const policy: GradingComponent[] = newRows.map(r => ({ component: r.component, weightage: r.weightage }))
      const { error } = await onUpdate({ grading_policy: policy })
      if (error) toast({ title: 'Save failed', description: error, status: 'error', duration: 3000 })
    },
    [onUpdate, toast]
  )

  const totalWeightage = rows.reduce((sum, r) => sum + (r.weightage ?? 0), 0)

  const columnDefs: ColDef<GradingRow>[] = [
    {
      headerName: '#',
      width: 50,
      editable: false,
      valueGetter: params => (params.node?.rowIndex ?? 0) + 1,
      cellStyle: { color: '#a0aec0', textAlign: 'center' },
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
            <IconButton
              aria-label="Remove row"
              icon={<DeleteIcon />}
              size="xs"
              colorScheme="red"
              variant="ghost"
              onClick={() => removeRow(params.data.rowId)}
            />
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

  const totalColor = totalWeightage === 100 ? '#38a169' : totalWeightage > 100 ? '#e53e3e' : '#dd6b20'

  return (
    <Box>
      <HStack justify="space-between" mb={2}>
        <Text fontWeight="600" fontSize="sm" color="gray.600" textTransform="uppercase" letterSpacing="0.05em">
          Grading Policy
        </Text>
        <HStack spacing={3}>
          <Text fontSize="sm" color={totalColor} fontWeight="600">
            Total: {totalWeightage}%
          </Text>
          {canEdit && (
            <Button size="xs" leftIcon={<AddIcon />} colorScheme="blue" variant="outline" onClick={addRow}>
              Add Component
            </Button>
          )}
        </HStack>
      </HStack>
      <Box
        className="ag-theme-quartz"
        height={rows.length > 0 ? `${rows.length * 38 + 44}px` : '82px'}
        border="1px"
        borderColor="gray.200"
        borderRadius="md"
        overflow="hidden"
      >
        <AgGridReact<GradingRow>
          ref={gridRef}
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
          overlayNoRowsTemplate="<span style='color:#a0aec0;font-size:13px'>No grading components added yet</span>"
        />
      </Box>
    </Box>
  )
}
