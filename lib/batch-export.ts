import type { Batch, Session } from '@/lib/batch-types'

function formatDate(d: string | null) {
  return d ?? ''
}

function formatTime(t: string | null) {
  return t ?? ''
}

export async function exportSessionsToXlsx(batch: Batch, sessions: Session[]) {
  const XLSX = await import('xlsx')

  const headers = [
    'Date', 'Day', 'Start Time', 'End Time',
    'Module #', 'Module Name', 'Week #', 'Session #',
    'Session Title', 'Learning Objectives',
    'Taken By', 'Instructor Name', 'Rating', 'Zoom Link',
    'End of Schedule',
  ]

  const rows = sessions.map(s => [
    formatDate(s.date),
    s.day ?? '',
    formatTime(s.start_time),
    formatTime(s.end_time),
    s.module_number ?? '',
    s.module_name ?? '',
    s.week_number ?? '',
    s.session_number ?? '',
    s.session_title ?? '',
    s.learning_objectives ?? '',
    s.to_be_taken_by ?? '',
    s.instructor_name ?? '',
    s.rating ?? '',
    s.zoom_link ?? '',
    s.is_end_of_schedule ? 'Yes' : '',
  ])

  const wsData = [headers, ...rows]
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Column widths
  ws['!cols'] = [
    { wch: 12 }, { wch: 10 }, { wch: 11 }, { wch: 11 },
    { wch: 10 }, { wch: 20 }, { wch: 8 }, { wch: 10 },
    { wch: 35 }, { wch: 50 },
    { wch: 22 }, { wch: 22 }, { wch: 8 }, { wch: 40 },
    { wch: 15 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sessions')

  // Batch info sheet
  const batchRows = [
    ['Field', 'Value'],
    ['Batch Name', batch.batch_name ?? ''],
    ['Program Name', batch.program_name ?? ''],
    ['Institute Name', batch.institute_name ?? ''],
    ['Model Number', batch.model_number ?? ''],
    ['Domain', batch.domain ?? ''],
    ['Language', batch.language ?? ''],
    ['Status', batch.status ?? ''],
    ['Start Date', formatDate(batch.start_date)],
    ['End Date (Scheduled)', formatDate(batch.end_date_scheduled)],
    ['Actual End Date', formatDate(batch.actual_end_date)],
    ['Website Link', batch.website_link ?? ''],
  ]
  const wsBatch = XLSX.utils.aoa_to_sheet(batchRows)
  wsBatch['!cols'] = [{ wch: 25 }, { wch: 50 }]
  XLSX.utils.book_append_sheet(wb, wsBatch, 'Batch Info')

  const filename = `${batch.batch_name ?? 'batch'}-sessions.xlsx`
  XLSX.writeFile(wb, filename)
}

export async function exportBatchListToXlsx(batches: Batch[]) {
  const XLSX = await import('xlsx')

  const headers = [
    'Batch Name', 'Program Name', 'Institute Name',
    'Domain', 'Language', 'Status', 'Model #',
    'Start Date', 'End Date (Scheduled)', 'Actual End Date',
    'Website Link',
  ]

  const rows = batches.map(b => [
    b.batch_name ?? '',
    b.program_name ?? '',
    b.institute_name ?? '',
    b.domain ?? '',
    b.language ?? '',
    b.status ?? '',
    b.model_number ?? '',
    formatDate(b.start_date),
    formatDate(b.end_date_scheduled),
    formatDate(b.actual_end_date),
    b.website_link ?? '',
  ])

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws['!cols'] = [
    { wch: 22 }, { wch: 40 }, { wch: 22 },
    { wch: 20 }, { wch: 12 }, { wch: 18 }, { wch: 8 },
    { wch: 12 }, { wch: 20 }, { wch: 16 },
    { wch: 40 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Batches')
  XLSX.writeFile(wb, 'batches-export.xlsx')
}
