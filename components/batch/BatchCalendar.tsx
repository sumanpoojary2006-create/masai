'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import type { EventContentArg, EventHoveringArg, EventMountArg } from '@fullcalendar/core'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import type { Session } from '@/lib/batch-types'

interface Props {
  sessions: Session[]
}

interface HoverCardState {
  session: Session
  title: string
  x: number
  y: number
}

function getEventColors(session: Session): { bg: string; border: string; glow: string } {
  if (session.is_end_of_schedule) return { bg: '#ef4444', border: '#f87171', glow: 'rgba(239,68,68,0.38)' }
  const role = session.to_be_taken_by
  if (role === 'professor') return { bg: '#7c3aed', border: '#a78bfa', glow: 'rgba(124,58,237,0.35)' }
  if (role === 'industry-mentor') return { bg: '#0f766e', border: '#2dd4bf', glow: 'rgba(45,212,191,0.32)' }
  if (role === 'teaching-assistant') return { bg: '#2563eb', border: '#60a5fa', glow: 'rgba(96,165,250,0.3)' }
  return { bg: '#334155', border: '#94a3b8', glow: 'rgba(148,163,184,0.24)' }
}

function buildEvents(sessions: Session[]) {
  const seen = new Set<string>()
  const events: Array<{
    id: string
    title: string
    start: string
    end: string | undefined
    backgroundColor: string
    borderColor: string
    textColor: string
    classNames: string[]
    extendedProps: { session: Session; glow: string }
  }> = []

  sessions
    .filter(s => s.date)
    .forEach(s => {
      const start = s.start_time ? `${s.date}T${s.start_time}` : s.date!
      const end = s.end_time ? `${s.date}T${s.end_time}` : undefined
      const colors = getEventColors(s)
      const eventTitle = s.session_title || 'Untitled Session'
      const dedupeKey = [
        s.date || '',
        s.start_time || '',
        s.end_time || '',
        eventTitle.trim().toLowerCase(),
        s.to_be_taken_by || '',
        s.instructor_name || '',
        s.is_end_of_schedule ? 'end' : 'normal',
      ].join('|')

      if (seen.has(dedupeKey)) return
      seen.add(dedupeKey)

      events.push({
        id: s.id,
        title: eventTitle,
        start,
        end,
        backgroundColor: colors.bg,
        borderColor: colors.border,
        textColor: '#ffffff',
        classNames: [
          s.is_end_of_schedule ? 'batch-calendar-event--end' : 'batch-calendar-event',
          `batch-calendar-role-${s.to_be_taken_by || 'other'}`,
        ],
        extendedProps: { session: s, glow: colors.glow },
      })
    })

  return events
}

function EventContent({ eventInfo }: { eventInfo: EventContentArg }) {
  const session = eventInfo.event.extendedProps.session as Session
  const glow = eventInfo.event.extendedProps.glow as string
  const isMonth = eventInfo.view.type === 'dayGridMonth'
  const roleLabel =
    session.is_end_of_schedule
      ? 'End of schedule'
      : session.to_be_taken_by === 'industry-mentor'
        ? 'Industry mentor'
        : session.to_be_taken_by === 'professor'
          ? 'Professor'
          : session.to_be_taken_by === 'teaching-assistant'
            ? 'Teaching assistant'
            : 'Session'

  return (
    <div
      style={{
        padding: isMonth ? '5px 8px' : '8px 10px',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: `0 0 10px ${glow}, inset 0 1px 0 rgba(255,255,255,0.06)`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: isMonth ? '2px' : '4px',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0.04))',
        backdropFilter: 'blur(8px)',
      }}
    >
      {!isMonth && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '9999px',
              background: 'rgba(255,255,255,0.92)',
              boxShadow: `0 0 8px ${glow}`,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: 'rgba(255,255,255,0.72)',
              fontWeight: 700,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              textOverflow: 'ellipsis',
            }}
          >
            {roleLabel}
          </span>
        </div>
      )}
      <div style={{
        fontSize: isMonth ? '11px' : '12px',
        fontWeight: 700,
        color: 'white',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        lineHeight: 1.3,
      }}>
        {session.is_end_of_schedule && '🏁 '}
        {eventInfo.event.title}
      </div>
      {!isMonth && session.instructor_name && (
        <div style={{
          fontSize: '11px',
          color: 'rgba(255,255,255,0.75)',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
        }}>
          {session.instructor_name}
        </div>
      )}
      {!isMonth && session.start_time && (
        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)' }}>
          {session.start_time.slice(0,5)}{session.end_time ? ` – ${session.end_time.slice(0,5)}` : ''}
        </div>
      )}
    </div>
  )
}

export function BatchCalendar({ sessions }: Props) {
  const calendarRef = useRef<FullCalendar>(null)
  const [isCompact, setIsCompact] = useState(false)
  const [isTablet, setIsTablet] = useState(false)
  const [hoverCard, setHoverCard] = useState<HoverCardState | null>(null)
  const events = buildEvents(sessions)

  useEffect(() => {
    function updateViewportFlags() {
      const width = window.innerWidth
      setIsCompact(width < 768)
      setIsTablet(width >= 768 && width < 1200)
    }

    updateViewportFlags()
    window.addEventListener('resize', updateViewportFlags)
    return () => window.removeEventListener('resize', updateViewportFlags)
  }, [])

  const calendarConfig = useMemo(() => {
    if (isCompact) {
      return {
        initialView: 'timeGridDay',
        headerToolbar: {
          left: 'title',
          center: '',
          right: 'prev,next today',
        },
        height: 'auto' as const,
        dayMaxEvents: 2,
        expandRows: false,
      }
    }

    if (isTablet) {
      return {
        initialView: 'timeGridWeek',
        headerToolbar: {
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay',
        },
        height: 760,
        dayMaxEvents: 3,
        expandRows: true,
      }
    }

    return {
      initialView: 'dayGridMonth',
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay',
      },
      height: 820,
      dayMaxEvents: 4,
      expandRows: true,
    }
  }, [isCompact, isTablet])

  const hasEndOfSchedule = sessions.some(s => s.is_end_of_schedule === true)
  const endSession = sessions.find(s => s.is_end_of_schedule === true)
  const sessionsWithDate = sessions.filter(s => s.date).length
  const totalSessions = sessions.length
  const professorCount = sessions.filter(s => s.to_be_taken_by === 'professor').length
  const mentorCount = sessions.filter(s => s.to_be_taken_by === 'industry-mentor').length
  const scheduledToday = sessions.filter(s => s.date === new Date().toISOString().slice(0, 10)).length

  function getRoleLabel(session: Session) {
    if (session.is_end_of_schedule) return 'End of schedule'
    if (session.to_be_taken_by === 'industry-mentor') return 'Industry mentor'
    if (session.to_be_taken_by === 'professor') return 'Professor'
    if (session.to_be_taken_by === 'teaching-assistant') return 'Teaching assistant'
    return 'Session'
  }

  function formatTimeRange(session: Session) {
    if (!session.start_time) return 'Time not set'
    const start = session.start_time.slice(0, 5)
    const end = session.end_time ? session.end_time.slice(0, 5) : null
    return end ? `${start} – ${end}` : start
  }

  function clampHoverPosition(x: number, y: number) {
    if (typeof window === 'undefined') return { x, y }
    const cardWidth = isCompact ? 260 : 320
    const cardHeight = 300
    const safeX = Math.min(Math.max(16, x + 18), window.innerWidth - cardWidth - 16)
    const safeY = Math.min(Math.max(16, y - 16), window.innerHeight - cardHeight - 16)
    return { x: safeX, y: safeY }
  }

  function handleEventMouseEnter(info: EventHoveringArg) {
    const session = info.event.extendedProps.session as Session
    if (!session) return
    const rect = info.el.getBoundingClientRect()
    const { x, y } = clampHoverPosition(rect.right, rect.top)
    setHoverCard({
      session,
      title: info.event.title,
      x,
      y,
    })
  }

  function handleEventMouseLeave() {
    setHoverCard(null)
  }

  function buildNativeTooltip(info: EventMountArg) {
    const session = info.event.extendedProps.session as Session
    if (!session) return

    const lines = [
      info.event.title,
      `Role: ${getRoleLabel(session)}`,
      `Date: ${session.date || 'Not set'}`,
      `Time: ${formatTimeRange(session)}`,
      `Instructor: ${session.instructor_name || 'Not assigned'}`,
      `Module: ${session.module_name || 'Not tagged'}`,
      `Week: ${session.week_number ?? '—'}`,
      `Session no: ${session.session_number ?? '—'}`,
    ]

    if (session.learning_objectives) {
      lines.push(`Learning objective: ${session.learning_objectives}`)
    }

    info.el.setAttribute('title', lines.join('\n'))
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-[24px] border border-violet-500/20 bg-[linear-gradient(135deg,rgba(124,58,237,0.2),rgba(23,37,84,0.82),rgba(15,23,42,0.96))] p-4 shadow-[0_14px_40px_rgba(2,6,23,0.25)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-200/80">Sessions</p>
          <p className="mt-2 text-3xl font-bold text-white">{totalSessions}</p>
          <p className="mt-1 text-sm text-slate-300">{sessionsWithDate} scheduled with dates</p>
        </div>
        <div className="rounded-[24px] border border-cyan-500/20 bg-[linear-gradient(135deg,rgba(6,182,212,0.18),rgba(15,23,42,0.94),rgba(8,47,73,0.7))] p-4 shadow-[0_14px_40px_rgba(2,6,23,0.25)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200/80">Today</p>
          <p className="mt-2 text-3xl font-bold text-white">{scheduledToday}</p>
          <p className="mt-1 text-sm text-slate-300">Sessions falling on today's date</p>
        </div>
        <div className="rounded-[24px] border border-emerald-500/20 bg-[linear-gradient(135deg,rgba(16,185,129,0.18),rgba(15,23,42,0.94),rgba(6,78,59,0.64))] p-4 shadow-[0_14px_40px_rgba(2,6,23,0.25)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200/80">Professor Mix</p>
          <p className="mt-2 text-3xl font-bold text-white">{professorCount}</p>
          <p className="mt-1 text-sm text-slate-300">{mentorCount} mentor-led sessions in the run</p>
        </div>
        <div className="rounded-[24px] border border-amber-500/20 bg-[linear-gradient(135deg,rgba(245,158,11,0.18),rgba(15,23,42,0.94),rgba(120,53,15,0.6))] p-4 shadow-[0_14px_40px_rgba(2,6,23,0.25)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200/80">Completion Flag</p>
          <p className="mt-2 text-xl font-bold text-white">{hasEndOfSchedule ? 'Schedule tagged' : 'Needs end marker'}</p>
          <p className="mt-1 text-sm text-slate-300">
            {hasEndOfSchedule && endSession?.date ? `Ends on ${endSession.date}` : 'Mark the final session to complete the sequence'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {!hasEndOfSchedule && totalSessions > 0 && (
          <div className="rounded-full border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-xs font-medium text-amber-200">
            ⚠ Incomplete Schedule — no session is marked as End of Schedule
          </div>
        )}
        {hasEndOfSchedule && endSession?.date && (
          <div className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-xs font-medium text-emerald-200">
            🏁 Schedule ends on {endSession.date}
          </div>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-3">
          {[
            { color: '#7c3aed', glow: 'rgba(124,58,237,0.4)', label: `Professor (${professorCount})` },
            { color: '#0f766e', glow: 'rgba(45,212,191,0.4)', label: `Industry Mentor (${mentorCount})` },
            { color: '#2563eb', glow: 'rgba(96,165,250,0.4)', label: 'Session' },
            { color: '#ef4444', glow: 'rgba(239,68,68,0.4)', label: 'End of Schedule' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">
              <span style={{
                display: 'inline-block',
                width: '10px',
                height: '10px',
                borderRadius: '9999px',
                background: item.color,
                boxShadow: `0 0 10px ${item.glow}`,
              }} />
              <span className="text-[11px] font-medium text-slate-300">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          background: 'radial-gradient(circle at top left, rgba(56,189,248,0.12), transparent 28%), radial-gradient(circle at top right, rgba(168,85,247,0.16), transparent 28%), linear-gradient(180deg, rgba(15,23,42,0.98), rgba(5,10,22,0.98))',
          border: '1px solid rgba(71,85,105,0.58)',
          borderRadius: '28px',
          padding: isCompact ? '12px' : '20px',
          overflow: 'hidden',
          boxShadow: '0 30px 90px rgba(2,6,23,0.52), inset 0 1px 0 rgba(255,255,255,0.03)',
        }}
      >
        <div className="mb-4 flex flex-col gap-4 rounded-[24px] border border-white/8 bg-black/10 p-4 backdrop-blur-xl md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200/80">Calendar intelligence</p>
            <h3 className="mt-1 text-xl font-bold text-white">Responsive session timeline</h3>
            <p className="mt-1 text-sm text-slate-400">
              Month for full-range planning, week for flow, day for delivery.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Desktop</p>
              <p className="mt-1 text-sm font-semibold text-slate-200">Month view</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Tablet</p>
              <p className="mt-1 text-sm font-semibold text-slate-200">Week view</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Mobile</p>
              <p className="mt-1 text-sm font-semibold text-slate-200">Day view</p>
            </div>
          </div>
        </div>
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView={calendarConfig.initialView}
          headerToolbar={calendarConfig.headerToolbar}
          buttonText={{
            today: 'Today',
            month: 'month',
            week: 'week',
            day: 'day',
          }}
          timeZone="Asia/Kolkata"
          events={events}
          eventContent={eventInfo => <EventContent eventInfo={eventInfo} />}
          eventMouseEnter={handleEventMouseEnter}
          eventMouseLeave={handleEventMouseLeave}
          eventDidMount={buildNativeTooltip}
          height={calendarConfig.height}
          contentHeight={isCompact ? 'auto' : undefined}
          dayMaxEvents={calendarConfig.dayMaxEvents}
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          slotMinTime="06:00:00"
          slotMaxTime="23:00:00"
          allDaySlot={false}
          eventDisplay="block"
          stickyHeaderDates
          navLinks={!isCompact}
          expandRows={calendarConfig.expandRows}
        />

        {hoverCard && (
          <div
            className="pointer-events-none fixed z-[70] hidden w-[320px] rounded-[22px] border border-cyan-400/20 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))] p-4 shadow-[0_24px_80px_rgba(2,6,23,0.65)] md:block"
            style={{ left: hoverCard.x, top: hoverCard.y }}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/75">
                  {getRoleLabel(hoverCard.session)}
                </p>
                <h4 className="mt-1 text-base font-bold leading-snug text-white">
                  {hoverCard.title}
                </h4>
              </div>
              {hoverCard.session.is_end_of_schedule && (
                <span className="rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-200">
                  Final
                </span>
              )}
            </div>

            <div className="grid gap-2">
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Schedule</p>
                <p className="mt-1 text-sm font-semibold text-slate-100">
                  {hoverCard.session.date || 'Date not set'} · {formatTimeRange(hoverCard.session)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Instructor</p>
                  <p className="mt-1 text-sm text-slate-200">
                    {hoverCard.session.instructor_name || 'Not assigned'}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Module</p>
                  <p className="mt-1 text-sm text-slate-200">
                    {hoverCard.session.module_name || 'Not tagged'}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Learning objective</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-200">
                  {hoverCard.session.learning_objectives || 'Not added yet'}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Week</p>
                  <p className="mt-1 text-sm font-semibold text-slate-200">
                    {hoverCard.session.week_number ?? '—'}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Session</p>
                  <p className="mt-1 text-sm font-semibold text-slate-200">
                    {hoverCard.session.session_number ?? '—'}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Rating</p>
                  <p className="mt-1 text-sm font-semibold text-slate-200">
                    {hoverCard.session.rating ?? '—'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
