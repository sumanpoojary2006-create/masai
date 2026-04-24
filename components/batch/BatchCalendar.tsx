'use client'
import { useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import type { EventContentArg } from '@fullcalendar/core'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { Session } from '@/lib/batch-types'

interface Props {
  sessions: Session[]
}

function buildEvents(sessions: Session[]) {
  return sessions
    .filter(s => s.date)
    .map(s => {
      const start = s.start_time ? `${s.date}T${s.start_time}` : s.date!
      const end = s.end_time ? `${s.date}T${s.end_time}` : undefined
      return {
        id: s.id,
        title: s.session_title || 'Untitled Session',
        start,
        end,
        backgroundColor: s.is_end_of_schedule ? '#dc2626' : '#2563eb',
        borderColor: s.is_end_of_schedule ? '#b91c1c' : '#1d4ed8',
        textColor: '#ffffff',
        extendedProps: { session: s },
      }
    })
}

function EventContent({ eventInfo }: { eventInfo: EventContentArg }) {
  const session = eventInfo.event.extendedProps.session as Session
  return (
    <div style={{ padding: '2px 4px', overflow: 'hidden', width: '100%' }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'white', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        {session.is_end_of_schedule && '🏁 '}
        {eventInfo.event.title}
      </div>
      {session.instructor_name && (
        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.85)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
          {session.instructor_name}
        </div>
      )}
    </div>
  )
}

export function BatchCalendar({ sessions }: Props) {
  const calendarRef = useRef<FullCalendar>(null)
  const events = buildEvents(sessions)

  const hasEndOfSchedule = sessions.some(s => s.is_end_of_schedule === true)
  const endSession = sessions.find(s => s.is_end_of_schedule === true)
  const sessionsWithDate = sessions.filter(s => s.date).length
  const totalSessions = sessions.length

  return (
    <div>
      {/* Status banner */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {!hasEndOfSchedule && totalSessions > 0 && (
          <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-1.5 text-sm font-medium text-orange-700">
            ⚠ Incomplete Schedule — no session is marked as "End of Schedule"
          </div>
        )}
        {hasEndOfSchedule && endSession?.date && (
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700">
            🏁 Schedule ends on {endSession.date}
          </div>
        )}
        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm bg-blue-600" />
            <span className="text-xs text-gray-600">Session</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm bg-red-600" />
            <span className="text-xs text-gray-600">End of Schedule</span>
          </div>
          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
            {sessionsWithDate}/{totalSessions} with dates
          </span>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-gray-200 bg-white p-3">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          timeZone="Asia/Kolkata"
          events={events}
          eventContent={eventInfo => <EventContent eventInfo={eventInfo} />}
          height="680px"
          dayMaxEvents={3}
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          slotMinTime="06:00:00"
          slotMaxTime="23:00:00"
          allDaySlot={false}
        />
      </div>
    </div>
  )
}
