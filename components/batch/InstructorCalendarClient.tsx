'use client'

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import type { EventClickArg, EventContentArg, EventMountArg } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";

import type {
  InstructorCalendarData,
  InstructorCalendarSession,
  InstructorCalendarSummary
} from "@/lib/instructor-calendar";

type RoleFilter = "all" | "professor" | "industry-mentor";

function getRoleLabel(role: string | null) {
  if (role === "professor") return "Faculty Session";
  if (role === "industry-mentor") return "Industry Mentor Session";
  if (role === "teaching-assistant") return "Teaching Assistant Session";
  return "Session";
}

function getRoleColors(role: string | null) {
  if (role === "professor") return { bg: "#5b21b6", border: "#8b5cf6" };
  if (role === "industry-mentor") return { bg: "#065f46", border: "#34d399" };
  return { bg: "#1e3a5f", border: "#3b82f6" };
}

function formatTimeRange(session: InstructorCalendarSession) {
  if (!session.startTime) return "Time not set";
  return `${session.startTime.slice(0, 5)}${session.endTime ? ` - ${session.endTime.slice(0, 5)}` : ""}`;
}

function formatBlockedHours(totalMinutes: number) {
  const hours = totalMinutes / 60;
  if (hours === 0) return "0h";
  if (Number.isInteger(hours)) return `${hours}h`;
  return `${hours.toFixed(1)}h`;
}

function formatDateLabel(date: string | null) {
  if (!date) return "Unavailable";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata"
  }).format(new Date(`${date}T00:00:00`));
}

function renderEventContent(info: EventContentArg) {
  const session = info.event.extendedProps.session as InstructorCalendarSession | undefined;

  return (
    <div style={{ display: "grid", gap: "2px", padding: "1px 0" }}>
      <div style={{ fontSize: "10px", fontWeight: 800, lineHeight: 1.15, opacity: 0.9 }}>
        {session ? session.batchName : "Blocked"}
      </div>
      <div style={{ fontSize: "12px", fontWeight: 700, lineHeight: 1.2, whiteSpace: "normal" }}>
        {info.event.title}
      </div>
    </div>
  );
}

function onEventDidMount(info: EventMountArg) {
  const session = info.event.extendedProps.session as InstructorCalendarSession | undefined;
  if (!session) return;

  const tooltip = [
    session.sessionTitle || "Untitled Session",
    `Batch: ${session.batchName}`,
    `Type: ${getRoleLabel(session.sessionType)}`,
    `Time: ${formatTimeRange(session)}`,
    session.moduleName ? `Module: ${session.moduleName}` : ""
  ]
    .filter(Boolean)
    .join("\n");

  info.el.setAttribute("title", tooltip);
  info.el.style.cursor = "pointer";
}

function StatCard({
  label,
  value,
  note,
  accent
}: {
  label: string;
  value: string | number;
  note: string;
  accent: string;
}) {
  return (
    <div className="rounded-[22px] border border-slate-800/80 bg-slate-950/80 p-5 shadow-[0_18px_48px_rgba(2,6,23,0.28)]">
      <div className={`mb-4 h-1.5 w-16 rounded-full ${accent}`} />
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-2 text-sm text-slate-400">{note}</p>
    </div>
  );
}

export function InstructorCalendarClient() {
  const [data, setData] = useState<InstructorCalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedInstructorKey, setSelectedInstructorKey] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [selectedSession, setSelectedSession] = useState<InstructorCalendarSession | null>(null);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/batch-details/instructor-calendar", {
          credentials: "include",
          cache: "no-store"
        });

        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.message ?? "Failed to load instructor calendar.");
        }

        if (cancelled) {
          return;
        }

        setData(payload as InstructorCalendarData);
        setSelectedInstructorKey((current) =>
          current ?? (payload.instructors[0]?.instructorKey ?? null)
        );
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load instructor calendar.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredInstructors = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    const instructors = data?.instructors ?? [];

    if (!query) {
      return instructors;
    }

    return instructors.filter((instructor) => {
      return instructor.instructorName.toLowerCase().includes(query);
    });
  }, [data?.instructors, deferredSearch]);

  useEffect(() => {
    if (filteredInstructors.length === 0) {
      setSelectedInstructorKey(null);
      return;
    }

    if (!selectedInstructorKey) {
      setSelectedInstructorKey(filteredInstructors[0].instructorKey);
      return;
    }

    const stillVisible = filteredInstructors.some(
      (instructor) => instructor.instructorKey === selectedInstructorKey
    );

    if (!stillVisible) {
      setSelectedInstructorKey(filteredInstructors[0].instructorKey);
    }
  }, [filteredInstructors, selectedInstructorKey]);

  const selectedInstructor = useMemo<InstructorCalendarSummary | null>(() => {
    if (!data || !selectedInstructorKey) return null;
    return (
      data.instructors.find((instructor) => instructor.instructorKey === selectedInstructorKey) ?? null
    );
  }, [data, selectedInstructorKey]);

  const instructorSessions = useMemo(() => {
    if (!data || !selectedInstructorKey) return [];

    return data.sessions.filter((session) => {
      if (session.instructorKey !== selectedInstructorKey) {
        return false;
      }

      if (roleFilter === "all") {
        return true;
      }

      return session.sessionType === roleFilter;
    });
  }, [data, selectedInstructorKey, roleFilter]);

  const upcomingSessions = useMemo(() => {
    return instructorSessions.slice(0, 14);
  }, [instructorSessions]);

  const events = useMemo(() => {
    return instructorSessions
      .filter((session) => session.date && session.startTime)
      .map((session) => {
        const colors = getRoleColors(session.sessionType);
        return {
          id: session.id,
          title: session.sessionTitle || "Untitled Session",
          start: `${session.date}T${session.startTime}`,
          end: session.endTime ? `${session.date}T${session.endTime}` : undefined,
          backgroundColor: colors.bg,
          borderColor: colors.border,
          textColor: "#fff",
          extendedProps: { session }
        };
      });
  }, [instructorSessions]);

  const blockedBatches = useMemo(() => {
    return new Set(instructorSessions.map((session) => session.batchName)).size;
  }, [instructorSessions]);

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[24px] border border-rose-500/25 bg-rose-500/10 p-6 text-rose-200">
        {error}
      </div>
    );
  }

  if (!data || data.instructors.length === 0) {
    return (
      <div className="rounded-[24px] border border-slate-800/80 bg-slate-950/70 p-10 text-center">
        <p className="text-lg font-semibold text-white">No instructor schedule data yet</p>
        <p className="mt-2 text-sm text-slate-500">
          Once sessions with instructor names are synced, this blocked calendar will populate automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-slate-200">
      <div className="flex flex-col gap-4 rounded-[28px] border border-slate-800/90 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_26%),radial-gradient(circle_at_right,rgba(16,185,129,0.14),transparent_28%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(4,9,18,0.98))] p-6 shadow-[0_30px_80px_rgba(2,6,23,0.44)] lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-300/80">
            Instructor Blocking
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Instructor Calendar</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            A giant blocked-slot view across all batches, so you can see exactly when a given instructor is already occupied.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="/batch-details/dashboard"
            className="inline-flex h-11 items-center rounded-full border border-slate-700 bg-slate-900/80 px-4 text-sm font-medium text-slate-300 transition hover:border-slate-600 hover:text-slate-100"
          >
            ← Back to Batches
          </a>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Instructors"
          value={data.instructors.length}
          note="Total instructors with scheduled sessions"
          accent="bg-cyan-400"
        />
        <StatCard
          label="Blocked Slots"
          value={selectedInstructor ? selectedInstructor.totalSessions : 0}
          note="Scheduled sessions currently blocking this instructor"
          accent="bg-violet-400"
        />
        <StatCard
          label="Distinct Batches"
          value={blockedBatches}
          note="Batches contributing to the selected instructor's calendar"
          accent="bg-emerald-400"
        />
        <StatCard
          label="Blocked Time"
          value={selectedInstructor ? formatBlockedHours(selectedInstructor.totalBlockedMinutes) : "0h"}
          note="Computed from scheduled start and end times"
          accent="bg-amber-300"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="rounded-[26px] border border-slate-800/90 bg-slate-950/75 p-4 shadow-[0_18px_48px_rgba(2,6,23,0.28)]">
            <div className="mb-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Pick Instructor
              </p>
            </div>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search instructor…"
              className="w-full rounded-full border border-slate-700 bg-slate-950/90 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/20"
            />
            <div className="mt-4 max-h-[34rem] space-y-2 overflow-y-auto pr-1">
              {filteredInstructors.map((instructor) => {
                const active = instructor.instructorKey === selectedInstructorKey;
                return (
                  <button
                    key={instructor.instructorKey}
                    type="button"
                    onClick={() => setSelectedInstructorKey(instructor.instructorKey)}
                    className={`w-full rounded-[20px] border px-4 py-3 text-left transition ${
                      active
                        ? "border-cyan-400/30 bg-cyan-500/12 shadow-[0_14px_36px_rgba(34,211,238,0.12)]"
                        : "border-slate-800/90 bg-slate-900/70 hover:border-slate-700 hover:bg-slate-900/90"
                    }`}
                  >
                    <p className={`text-sm font-semibold ${active ? "text-cyan-100" : "text-white"}`}>
                      {instructor.instructorName}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {instructor.totalSessions} blocked slots across {instructor.distinctBatches} batches
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-[26px] border border-slate-800/90 bg-slate-950/75 p-4 shadow-[0_18px_48px_rgba(2,6,23,0.28)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Role Filter</p>
            <div className="mt-4 grid gap-2">
              {([
                { id: "all", label: "All Sessions" },
                { id: "professor", label: "Faculty Sessions" },
                { id: "industry-mentor", label: "Industry Mentor Sessions" }
              ] as Array<{ id: RoleFilter; label: string }>).map((filter) => {
                const active = roleFilter === filter.id;
                return (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setRoleFilter(filter.id)}
                    className={`rounded-full border px-4 py-2.5 text-left text-sm font-medium transition ${
                      active
                        ? "border-cyan-400/30 bg-cyan-500/12 text-cyan-100"
                        : "border-slate-700 bg-slate-900/80 text-slate-300 hover:border-slate-600"
                    }`}
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <div className="space-y-5">
          <div className="rounded-[26px] border border-slate-800/90 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(4,8,15,0.98))] p-5 shadow-[0_24px_70px_rgba(2,6,23,0.36)]">
            <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Giant Blocked Calendar
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-white">
                  {selectedInstructor?.instructorName ?? "Choose an instructor"}
                </h3>
                <p className="mt-2 text-sm text-slate-400">
                  Showing when this instructor is blocked across all batches.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
                  Faculty
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  Industry Mentor
                </span>
              </div>
            </div>

            <div className="overflow-hidden rounded-[22px] border border-slate-800/90 bg-slate-950/80 p-4">
              <FullCalendar
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                initialView="timeGridWeek"
                headerToolbar={{
                  left: "prev,next today",
                  center: "title",
                  right: "dayGridMonth,timeGridWeek,timeGridDay"
                }}
                buttonText={{ today: "Today", month: "month", week: "week", day: "day" }}
                timeZone="Asia/Kolkata"
                events={events}
                eventContent={renderEventContent}
                eventDidMount={onEventDidMount}
                eventClick={(info: EventClickArg) => {
                  const session = info.event.extendedProps.session as InstructorCalendarSession | undefined;
                  if (session) {
                    setSelectedSession(session);
                  }
                }}
                eventDisplay="block"
                allDaySlot={false}
                slotMinTime="06:00:00"
                slotMaxTime="23:00:00"
                dayMaxEvents={4}
                height={860}
                eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
              />
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-[26px] border border-slate-800/90 bg-slate-950/75 p-5 shadow-[0_18px_48px_rgba(2,6,23,0.28)]">
              <div className="mb-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Schedule Snapshot
                </p>
                <h3 className="mt-2 text-lg font-semibold text-white">Current instructor load</h3>
              </div>
              {selectedInstructor ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-[20px] border border-slate-800/90 bg-slate-900/75 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Faculty</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{selectedInstructor.facultySessions}</p>
                  </div>
                  <div className="rounded-[20px] border border-slate-800/90 bg-slate-900/75 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Industry Mentor</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{selectedInstructor.mentorSessions}</p>
                  </div>
                  <div className="rounded-[20px] border border-slate-800/90 bg-slate-900/75 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">First Block</p>
                    <p className="mt-2 text-lg font-semibold text-white">{formatDateLabel(selectedInstructor.firstSessionDate)}</p>
                  </div>
                  <div className="rounded-[20px] border border-slate-800/90 bg-slate-900/75 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Last Block</p>
                    <p className="mt-2 text-lg font-semibold text-white">{formatDateLabel(selectedInstructor.lastSessionDate)}</p>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-[26px] border border-slate-800/90 bg-slate-950/75 p-5 shadow-[0_18px_48px_rgba(2,6,23,0.28)]">
              <div className="mb-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Upcoming Blocks
                </p>
                <h3 className="mt-2 text-lg font-semibold text-white">Next scheduled slots</h3>
              </div>
              <div className="space-y-3">
                {upcomingSessions.length > 0 ? (
                  upcomingSessions.map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => setSelectedSession(session)}
                      className="w-full rounded-[18px] border border-slate-800/80 bg-slate-900/70 p-4 text-left transition hover:border-slate-700 hover:bg-slate-900/90"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">
                            {session.sessionTitle || "Untitled Session"}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {session.batchName} • {formatDateLabel(session.date)}
                          </p>
                        </div>
                        <span className="rounded-full border border-slate-700 bg-slate-950/80 px-2.5 py-1 text-[11px] font-semibold text-slate-300">
                          {formatTimeRange(session)}
                        </span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-[18px] border border-dashed border-slate-700/80 bg-slate-950/60 px-4 py-8 text-center text-sm text-slate-500">
                    No sessions found for this filter.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {selectedSession ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-8"
          onClick={() => setSelectedSession(null)}
        >
          <div
            className="w-full max-w-2xl rounded-[28px] border border-slate-700/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.56)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300/80">
                  Blocked Slot Details
                </p>
                <h3 className="mt-2 text-2xl font-semibold text-white">
                  {selectedSession.sessionTitle || "Untitled Session"}
                </h3>
                <p className="mt-2 text-sm text-slate-400">{selectedSession.batchName}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSession(null)}
                className="rounded-full border border-slate-700 bg-slate-900/80 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-600"
              >
                Close
              </button>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {[
                { label: "Instructor", value: selectedSession.instructorName },
                { label: "Type", value: getRoleLabel(selectedSession.sessionType) },
                { label: "Date", value: formatDateLabel(selectedSession.date) },
                { label: "Time", value: formatTimeRange(selectedSession) },
                { label: "Module", value: selectedSession.moduleName || "—" },
                {
                  label: "Session No.",
                  value:
                    selectedSession.sessionNumber != null ? String(selectedSession.sessionNumber) : "—"
                }
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-[18px] border border-slate-800/80 bg-slate-900/70 p-4"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    {item.label}
                  </p>
                  <p className="mt-2 text-sm font-medium text-slate-100">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
