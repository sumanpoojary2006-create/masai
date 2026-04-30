import { useRef, useCallback } from 'react'
import { AgGridReact } from 'ag-grid-react'
import type { CellValueChangedEvent, ColDef, RowClassParams } from 'ag-grid-community'
import { Box, Button, HStack, Text, useToast, IconButton } from '@chakra-ui/react'
import { AddIcon, DeleteIcon } from '@chakra-ui/icons'
import { getDay } from 'date-fns'
import type { Session } from '../../types'
import { DAY_OPTIONS, SESSION_ROLE_OPTIONS } from '../../constants/options'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface Props {
  sessions: Session[]
  canEdit: boolean
  isAdmin: boolean
  onAdd: () => Promise<{ data: Session | null; error: string | null }>
  onUpdate: (id: string, updates: Partial<Session>) => Promise<{ error: string | null }>
  onDelete: (id: string) => Promise<{ error: string | null }>
}

export default function SessionsGrid({ sessions, canEdit, isAdmin, onAdd, onUpdate, onDelete }: Props) {
  const gridRef = useRef<AgGridReact<Session>>(null)
  const toast = useToast()

  const handleDelete = useCallback(
    async (session: Session) => {
      const { error } = await onDelete(session.id)
      if (error) toast({ title: 'Delete failed', description: error, status: 'error', duration: 3000 })
    },
    [onDelete, toast]
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
      headerName: 'Start Time',
      width: 110,
      editable: canEdit,
      cellEditor: 'agTextCellEditor',
      valueFormatter: params => params.value ?? '—',
    },
    {
      field: 'end_time',
      headerName: 'End Time',
      width: 110,
      editable: canEdit,
      cellEditor: 'agTextCellEditor',
      valueFormatter: params => params.value ?? '—',
    },
    {
      field: 'module_number',
      headerName: 'Module #',
      width: 100,
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
      headerName: 'Week #',
      width: 90,
      editable: canEdit,
      cellEditor: 'agNumberCellEditor',
      valueFormatter: params => (params.value != null ? String(params.value) : '—'),
      cellStyle: { textAlign: 'right' },
    },
    {
      field: 'session_number',
      headerName: 'Session #',
      width: 100,
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
      headerName: 'Instructor Name',
      width: 180,
      editable: canEdit,
      cellEditor: 'agTextCellEditor',
      valueFormatter: params => params.value ?? '—',
    },
    {
      field: 'rating',
      headerName: 'Rating',
      width: 90,
      editable: canEdit,
      cellEditor: 'agNumberCellEditor',
      valueFormatter: params => (params.value != null ? String(params.value) : '—'),
      cellStyle: { textAlign: 'right' },
    },
    {
      field: 'zoom_link',
      headerName: 'Zoom Link',
      width: 140,
      editable: canEdit,
      cellEditor: 'agTextCellEditor',
      cellRenderer: (params: { value: string | null }) => {
        if (!params.value) return <span style={{ color: '#a0aec0' }}>—</span>
        return (
          <a
            href={params.value}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#3182ce', textDecoration: 'underline' }}
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
        if (params.value === 'true') return <span style={{ color: '#e53e3e', fontWeight: 600 }}>✓ End</span>
        return <span style={{ color: '#a0aec0' }}>—</span>
      },
    },
    ...(isAdmin
      ? [{
          headerName: '',
          width: 50,
          editable: false,
          pinned: 'right' as const,
          cellRenderer: (params: { data: Session }) => (
            <IconButton
              aria-label="Delete session"
              icon={<DeleteIcon />}
              size="xs"
              colorScheme="red"
              variant="ghost"
              onClick={() => handleDelete(params.data)}
            />
          ),
        } as ColDef<Session>]
      : []),
  ]

  const onCellValueChanged = useCallback(
    async (e: CellValueChangedEvent<Session>) => {
      const field = e.colDef.field as keyof Session
      if (!field) return

      let newVal = e.newValue === '' ? null : e.newValue

      // Auto-derive day from date
      if (field === 'date' && newVal) {
        try {
          const d = new Date(newVal as string)
          const derivedDay = DAY_NAMES[getDay(d)]
          const { error } = await onUpdate(e.data.id, { date: newVal as string, day: derivedDay })
          if (error) {
            toast({ title: 'Save failed', description: error, status: 'error', duration: 3000 })
          } else {
            gridRef.current?.api.applyTransaction({ update: [{ ...e.data, date: newVal as string, day: derivedDay }] })
          }
          return
        } catch {
          // fall through to normal update
        }
      }

      // Handle is_end_of_schedule boolean conversion
      if (field === 'is_end_of_schedule') {
        newVal = e.newValue === 'true' ? true : e.newValue === 'false' ? false : null
      }

      const { error } = await onUpdate(e.data.id, { [field]: newVal } as Partial<Session>)
      if (error) {
        toast({ title: 'Save failed', description: error, status: 'error', duration: 3000 })
        e.node.setDataValue(field, e.oldValue)
      }
    },
    [onUpdate, toast]
  )

  async function handleAddSession() {
    const { error } = await onAdd()
    if (error) toast({ title: 'Failed to add session', description: error, status: 'error', duration: 3000 })
  }

  const getRowClass = (params: RowClassParams<Session>) => {
    if (params.data?.is_end_of_schedule) return 'end-of-schedule-row'
    return ''
  }

  const hasEndOfSchedule = sessions.some(s => s.is_end_of_schedule === true)

  return (
    <Box>
      <HStack justify="space-between" mb={2}>
        <HStack spacing={3}>
          <Text fontWeight="600" fontSize="sm" color="gray.600" textTransform="uppercase" letterSpacing="0.05em">
            Sessions
          </Text>
          <Text fontSize="xs" color="gray.400">
            {sessions.length} session{sessions.length !== 1 ? 's' : ''}
          </Text>
          {!hasEndOfSchedule && sessions.length > 0 && (
            <Text fontSize="xs" color="orange.500" fontWeight="500" bg="orange.50" px={2} py={0.5} borderRadius="full">
              Incomplete Schedule
            </Text>
          )}
          {hasEndOfSchedule && (
            <Text fontSize="xs" color="green.600" fontWeight="500" bg="green.50" px={2} py={0.5} borderRadius="full">
              Schedule Complete
            </Text>
          )}
        </HStack>
        {canEdit && (
          <Button size="sm" leftIcon={<AddIcon />} colorScheme="blue" variant="outline" onClick={handleAddSession}>
            Add Session
          </Button>
        )}
      </HStack>
      <Box
        className="ag-theme-quartz"
        height="520px"
        border="1px"
        borderColor="gray.200"
        borderRadius="md"
        overflow="hidden"
      >
        <AgGridReact<Session>
          ref={gridRef}
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
          overlayNoRowsTemplate="<span style='color:#a0aec0;font-size:13px'>No sessions yet. Click 'Add Session' to get started.</span>"
        />
      </Box>
    </Box>
  )
}
