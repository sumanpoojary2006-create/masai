'use client'
import { useMemo, useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import type { EventMountArg } from '@fullcalendar/core'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { Session } from '@/lib/batch-types'

interface Props { sessions: Session[] }

function getColors(s: Session) {
  if (s.is_end_of_schedule)          return { bg: '#991b1b', border: '#ef4444' }
  if (s.to_be_taken_by === 'professor')          return { bg: '#5b21b6', border: '#8b5cf6' }
  if (s.to_be_taken_by === 'industry-mentor')    return { bg: '#065f46', border: '#34d399' }
  if (s.to_be_taken_by === 'teaching-assistant') return { bg: '#1e40af', border: '#60a5fa' }
  return { bg: '#1e3a5f', border: '#3b82f6' }
}

// Stable callback — defined outside the component so its reference never changes
function onEventDidMount(info: EventMountArg) {
  const s = info.event.extendedProps.session as Session
  if (!s) return
  const lines = [
    info.event.title,
    s.to_be_taken_by ? `Role: ${s.to_be_taken_by}` : '',
    s.date ? `Date: ${s.date}` : '',
    s.start_time ? `Time: ${s.start_time.slice(0,5)}${s.end_time ? ' – ' + s.end_time.slice(0,5) : ''}` : '',
    s.instructor_name ? `Instructor: ${s.instructor_name}` : '',
    s.module_name ? `Module: ${s.module_name}` : '',
    s.week_number != null ? `Week: ${s.week_number}` : '',
    s.session_number != null ? `Session #: ${s.session_number}` : '',
    s.learning_objectives ? `LO: ${s.learning_objectives}` : '',
  ].filter(Boolean).join('\n')
  info.el.setAttribute('title', lines)
  info.el.style.cursor = 'pointer'
}

export function BatchCalendar({ sessions }: Props) {
  const calendarRef = useRef<FullCalendar>(null)

  const events = useMemo(() => {
    const seen = new Set<string>()
    return sessions
      .filter(s => s.date && s.start_time)
      .flatMap(s => {
        // Dedup by date + title (case-insensitive) — catches multi-instructor duplicates
        const key = `${s.date}|${(s.session_title ?? '').trim().toLowerCase()}`
        if (seen.has(key)) return []
        seen.add(key)

        const { bg, border } = getColors(s)
        return [{
          id: s.id,
          title: s.session_title || 'Untitled Session',
          start: `${s.date}T${s.start_time}`,
          end: s.end_time ? `${s.date}T${s.end_time}` : undefined,
          backgroundColor: bg,
          borderColor: border,
          textColor: '#fff',
          extendedProps: { session: s },
        }]
      })
  }, [sessions])

  const hasEnd      = sessions.some(s => s.is_end_of_schedule)
  const endSession  = sessions.find(s => s.is_end_of_schedule)
  const withDates   = events.length   // after dedup
  const profCount   = sessions.filter(s => s.to_be_taken_by === 'professor').length
  const mentorCount = sessions.filter(s => s.to_be_taken_by === 'industry-mentor').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* Stat chips */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
        {[
          { label: 'Total Sessions', value: sessions.length, accent: '#5b21b6' },
          { label: 'On Calendar',    value: withDates,       accent: '#065f46' },
          { label: 'Professor',      value: profCount,       accent: '#7c3aed' },
          { label: 'Ind. Mentor',    value: mentorCount,     accent: '#0f766e' },
        ].map(c => (
          <div key={c.label} style={{
            background: '#111827', border: '1px solid #1f2937', borderRadius: '12px',
            padding: '12px 14px', borderLeft: `3px solid ${c.accent}`,
          }}>
            <div style={{ fontSize: '10px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>{c.label}</div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#f1f5f9', marginTop: '3px' }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Status + legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
        {!hasEnd && sessions.length > 0 && (
          <span style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#fbbf24', borderRadius: '8px', padding: '5px 10px', fontSize: '12px' }}>
            ⚠ No End of Schedule marked
          </span>
        )}
        {hasEnd && endSession?.date && (
          <span style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', color: '#34d399', borderRadius: '8px', padding: '5px 10px', fontSize: '12px' }}>
            🏁 Ends {endSession.date}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {[
            { color: '#5b21b6', label: 'Professor' },
            { color: '#065f46', label: 'Industry Mentor' },
            { color: '#1e40af', label: 'Teaching Asst.' },
            { color: '#1e3a5f', label: 'Other' },
            { color: '#991b1b', label: 'End of Schedule' },
          ].map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: '#0d1117', border: '1px solid #1f2937', borderRadius: '9999px', padding: '3px 10px' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: l.color, display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontSize: '11px', color: '#64748b' }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Calendar — no custom eventContent, no state, no re-renders */}
      <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '14px', padding: '16px', overflow: 'hidden' }}>
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }}
          buttonText={{ today: 'Today', month: 'month', week: 'week', day: 'day' }}
          timeZone="Asia/Kolkata"
          events={events}
          eventDidMount={onEventDidMount}
          height={720}
          dayMaxEvents={4}
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          slotMinTime="06:00:00"
          slotMaxTime="23:00:00"
          allDaySlot={false}
          eventDisplay="block"
          navLinks={true}
        />
      </div>
    </div>
  )
}
