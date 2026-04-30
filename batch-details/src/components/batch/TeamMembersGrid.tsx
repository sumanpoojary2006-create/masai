import { useRef, useCallback, useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import type { CellValueChangedEvent, ColDef } from 'ag-grid-community'
import { Box, Text, Button, HStack, useToast, IconButton } from '@chakra-ui/react'
import { AddIcon, DeleteIcon } from '@chakra-ui/icons'
import type { Batch, TeamMembers } from '../../types'

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

export default function TeamMembersGrid({ batch, canEdit, onUpdate }: Props) {
  const gridRef = useRef<AgGridReact<TeamRow>>(null)
  const toast = useToast()
  const [rows, setRows] = useState<TeamRow[]>(() => buildRows(batch.team_members ?? {}))

  const persist = useCallback(
    async (newRows: TeamRow[]) => {
      const { error } = await onUpdate({ team_members: rowsToTeamMembers(newRows) })
      if (error) toast({ title: 'Save failed', description: error, status: 'error', duration: 3000 })
    },
    [onUpdate, toast]
  )

  const columnDefs: ColDef<TeamRow>[] = [
    {
      field: 'role',
      headerName: 'Role',
      width: 280,
      editable: false,
      cellStyle: { fontWeight: 500, color: '#4a5568', background: '#f7fafc' },
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
              <IconButton
                aria-label="Remove TA"
                icon={<DeleteIcon />}
                size="xs"
                colorScheme="red"
                variant="ghost"
                onClick={() => removeTA(params.data.taIndex!)}
              />
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
    <Box>
      <HStack justify="space-between" mb={2}>
        <Text fontWeight="600" fontSize="sm" color="gray.600" textTransform="uppercase" letterSpacing="0.05em">
          Team Members
        </Text>
        {canEdit && (
          <Button size="xs" leftIcon={<AddIcon />} colorScheme="blue" variant="outline" onClick={addTA}>
            Add TA
          </Button>
        )}
      </HStack>
      <Box className="ag-theme-quartz" height={`${rows.length * 38 + 44}px`} border="1px" borderColor="gray.200" borderRadius="md" overflow="hidden">
        <AgGridReact<TeamRow>
          ref={gridRef}
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
      </Box>
    </Box>
  )
}
