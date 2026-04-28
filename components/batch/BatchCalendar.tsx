'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import type { EventClickArg, EventContentArg, EventMountArg } from '@fullcalendar/core'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { DateClickArg } from '@fullcalendar/interaction'
import type { Session } from '@/lib/batch-types'

interface Props { sessions: Session[] }
type CalendarView = 'all' | 'faculty' | 'industry-mentor'

function getRoleLabel(role: Session['to_be_taken_by']) {
  if (role === 'professor') return 'Faculty Session'
  if (role === 'industry-mentor') return 'Industry Mentor Session'
  if (role === 'teaching-assistant') return 'Teaching Assistant Session'
  if (role === 'program-coordinator') return 'Program Coordinator Session'
  if (role === 'curriculum-coordinator') return 'Curriculum Coordinator Session'
  if (role === 'guest-lecturer') return 'Guest Lecturer Session'
  return 'Session'
}

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
    `Type: ${getRoleLabel(s.to_be_taken_by)}`,
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

function formatDateLabel(date: string) {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(`${date}T00:00:00`))
}

function formatTimeRange(session: Session) {
  if (!session.start_time) return 'Time not set'
  return `${session.start_time.slice(0, 5)}${session.end_time ? ` - ${session.end_time.slice(0, 5)}` : ''}`
}

function renderEventContent(info: EventContentArg) {
  const session = info.event.extendedProps.session as Session | undefined
  const sessionType = getRoleLabel(session?.to_be_taken_by ?? null)

  return (
    <div style={{ display: 'grid', gap: '2px', padding: '1px 0' }}>
      <div style={{ fontSize: '10px', fontWeight: 800, lineHeight: 1.2, opacity: 0.9 }}>
        {sessionType}
      </div>
      <div style={{ fontSize: '12px', fontWeight: 700, lineHeight: 1.25, whiteSpace: 'normal' }}>
        {info.event.title}
      </div>
    </div>
  )
}

export function BatchCalendar({ sessions }: Props) {
  const calendarRef = useRef<FullCalendar>(null)
  const [calendarView, setCalendarView] = useState<CalendarView>('all')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [highlightedSessionId, setHighlightedSessionId] = useState<string | null>(null)

  const filteredSessions = useMemo(() => {
    if (calendarView === 'all') return sessions
    if (calendarView === 'faculty') {
      return sessions.filter((session) => session.to_be_taken_by === 'professor')
    }
    return sessions.filter((session) => session.to_be_taken_by === 'industry-mentor')
  }, [calendarView, sessions])

  const events = useMemo(() => {
    const seen = new Set<string>()
    return filteredSessions
      .filter(s => s.date && s.start_time)
      .flatMap(s => {
        // Dedup by schedule slot + role + title (case-insensitive) — keeps role-specific views accurate.
        const key = `${s.date}|${s.start_time}|${s.to_be_taken_by ?? 'other'}|${(s.session_title ?? '').trim().toLowerCase()}`
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
  }, [filteredSessions])

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, Session[]>()

    for (const session of filteredSessions) {
      if (!session.date) continue
      const current = map.get(session.date) ?? []
      current.push(session)
      map.set(session.date, current)
    }

    for (const [date, daySessions] of map.entries()) {
      map.set(
        date,
        [...daySessions].sort((left, right) => (left.start_time ?? '').localeCompare(right.start_time ?? ''))
      )
    }

    return map
  }, [filteredSessions])

  const selectedSessions = selectedDate ? sessionsByDate.get(selectedDate) ?? [] : []

  useEffect(() => {
    if (!selectedDate) return
    if (selectedSessions.length > 0) return
    setSelectedDate(null)
    setHighlightedSessionId(null)
  }, [selectedDate, selectedSessions])

  const hasEnd      = sessions.some(s => s.is_end_of_schedule)
  const endSession  = sessions.find(s => s.is_end_of_schedule)
  const withDates   = events.length   // after dedup
  const profCount   = sessions.filter(s => s.to_be_taken_by === 'professor').length
  const mentorCount = sessions.filter(s => s.to_be_taken_by === 'industry-mentor').length
  const activeCount = filteredSessions.length
  const activeViewLabel =
    calendarView === 'faculty'
      ? 'Faculty blocked calendar'
      : calendarView === 'industry-mentor'
        ? 'Industry Mentor blocked calendar'
        : 'Combined schedule calendar'

  function openDayDetails(date: string, sessionId?: string) {
    const daySessions = sessionsByDate.get(date) ?? []
    if (daySessions.length === 0) return
    setSelectedDate(date)
    setHighlightedSessionId(sessionId ?? daySessions[0]?.id ?? null)
  }

  function handleDateClick(info: DateClickArg) {
    openDayDetails(info.dateStr)
  }

  function handleEventClick(info: EventClickArg) {
    const session = info.event.extendedProps.session as Session | undefined
    if (!session?.date) return
    openDayDetails(session.date, session.id)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* Stat chips */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
        {[
          { label: 'Total Sessions', value: sessions.length, accent: '#5b21b6' },
          { label: 'Active View',    value: activeCount,     accent: '#0891b2' },
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

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
        {([
          { id: 'all', label: 'All Sessions' },
          { id: 'faculty', label: 'Faculty Calendar' },
          { id: 'industry-mentor', label: 'Industry Mentor Calendar' },
        ] as Array<{ id: CalendarView; label: string }>).map((view) => {
          const active = calendarView === view.id
          return (
            <button
              key={view.id}
              onClick={() => setCalendarView(view.id)}
              style={{
                borderRadius: '9999px',
                border: active ? '1px solid rgba(34, 211, 238, 0.4)' : '1px solid #334155',
                background: active ? 'rgba(6, 182, 212, 0.14)' : '#0f172a',
                color: active ? '#67e8f9' : '#cbd5e1',
                padding: '9px 14px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {view.label}
            </button>
          )
        })}
        <span style={{ color: '#94a3b8', fontSize: '13px' }}>
          {activeViewLabel} showing when these sessions are blocked.
        </span>
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
          eventContent={renderEventContent}
          height={720}
          dayMaxEvents={4}
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          slotMinTime="06:00:00"
          slotMaxTime="23:00:00"
          allDaySlot={false}
          eventDisplay="block"
          dateClick={handleDateClick}
          eventClick={handleEventClick}
          navLinks={true}
        />
      </div>

      {selectedDate && (
        <div
          onClick={() => setSelectedDate(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(2, 6, 23, 0.72)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            zIndex: 60,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(720px, 100%)',
              maxHeight: '80vh',
              overflowY: 'auto',
              borderRadius: '22px',
              border: '1px solid rgba(71, 85, 105, 0.9)',
              background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(2, 6, 23, 0.98))',
              boxShadow: '0 24px 80px rgba(0, 0, 0, 0.45)',
              padding: '24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '18px' }}>
              <div>
                <div style={{ color: '#f8fafc', fontSize: '22px', fontWeight: 800 }}>
                  {formatDateLabel(selectedDate)}
                </div>
                <div style={{ color: '#94a3b8', fontSize: '14px', marginTop: '4px' }}>
                  {selectedSessions.length} session{selectedSessions.length !== 1 ? 's' : ''} scheduled
                </div>
              </div>
              <button
                onClick={() => setSelectedDate(null)}
                style={{
                  borderRadius: '9999px',
                  border: '1px solid #334155',
                  background: '#0f172a',
                  color: '#cbd5e1',
                  padding: '8px 12px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>

            <div style={{ display: 'grid', gap: '12px' }}>
              {selectedSessions.map((session) => {
                const { bg, border } = getColors(session)
                const isHighlighted = session.id === highlightedSessionId

                return (
                  <div
                    key={session.id}
                    style={{
                      borderRadius: '18px',
                      border: `1px solid ${isHighlighted ? border : 'rgba(51, 65, 85, 0.95)'}`,
                      background: isHighlighted ? 'rgba(30, 41, 59, 0.95)' : '#0f172a',
                      boxShadow: isHighlighted ? `0 0 0 1px ${border} inset` : 'none',
                      padding: '18px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ color: '#f8fafc', fontSize: '18px', fontWeight: 700 }}>
                          {session.session_title || 'Untitled Session'}
                        </div>
                        <div style={{ color: '#cbd5e1', fontSize: '14px', marginTop: '6px' }}>
                          {formatTimeRange(session)}
                        </div>
                      </div>
                      <span
                        style={{
                          alignSelf: 'flex-start',
                          borderRadius: '9999px',
                          border: `1px solid ${border}`,
                          background: bg,
                          color: '#fff',
                          padding: '5px 10px',
                          fontSize: '12px',
                          fontWeight: 700,
                          textTransform: 'capitalize',
                        }}
                      >
                        {session.is_end_of_schedule ? 'End of Schedule' : getRoleLabel(session.to_be_taken_by)}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginTop: '16px' }}>
                      {[
                        { label: 'Instructor', value: session.instructor_name },
                        { label: 'Module', value: session.module_name },
                        { label: 'Module No.', value: session.module_number != null ? String(session.module_number) : null },
                        { label: 'Week', value: session.week_number != null ? String(session.week_number) : null },
                        { label: 'Session No.', value: session.session_number != null ? String(session.session_number) : null },
                        { label: 'Day', value: session.day },
                      ].map((item) => (
                        <div key={item.label} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '14px', padding: '12px' }}>
                          <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            {item.label}
                          </div>
                          <div style={{ color: '#e2e8f0', fontSize: '14px', fontWeight: 600, marginTop: '6px' }}>
                            {item.value || '—'}
                          </div>
                        </div>
                      ))}
                    </div>

                    {session.learning_objectives && (
                      <div style={{ marginTop: '16px', background: '#111827', border: '1px solid #1f2937', borderRadius: '14px', padding: '14px' }}>
                        <div style={{ color: '#64748b', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
                          Learning Objectives
                        </div>
                        <div style={{ color: '#cbd5e1', fontSize: '14px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                          {session.learning_objectives}
                        </div>
                      </div>
                    )}

                    {session.zoom_link && (
                      <div style={{ marginTop: '14px' }}>
                        <a
                          href={session.zoom_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            borderRadius: '9999px',
                            border: '1px solid rgba(103, 232, 249, 0.3)',
                            background: 'rgba(34, 211, 238, 0.08)',
                            color: '#67e8f9',
                            padding: '8px 14px',
                            fontSize: '13px',
                            fontWeight: 700,
                            textDecoration: 'none',
                          }}
                        >
                          Open Zoom Link
                        </a>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
