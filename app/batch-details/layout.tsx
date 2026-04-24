import { type ReactNode } from "react";
import { LogoutButton } from "@/components/logout-button";
import { AgGridSetup } from "@/components/batch/AgGridSetup";

import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";

export default function BatchDetailsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="batch-dark min-h-screen w-full" style={{ background: '#080b14' }}>
      {/* Header */}
      <header style={{ background: '#0d1117', borderBottom: '1px solid #1f2937' }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <a
              href="/"
              style={{ color: '#4b5563', fontSize: '13px' }}
              className="hover:text-gray-300 transition-colors"
            >
              ← MasaiLens
            </a>
            <div>
              <h1 style={{ color: '#f1f5f9', fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em' }}>
                Batch Wise
              </h1>
              <p style={{ color: '#475569', fontSize: '11px', marginTop: '1px' }}>
                Manage batch metadata, sessions &amp; schedules
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/batch-details/dashboard"
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                color: '#94a3b8',
                borderRadius: '9999px',
                padding: '6px 16px',
                fontSize: '13px',
                fontWeight: 500,
              }}
              className="hover:text-slate-200 transition-colors"
            >
              All Batches
            </a>
            <LogoutButton />
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <AgGridSetup />
        <div
          style={{
            background: '#0d1117',
            border: '1px solid #1f2937',
            borderRadius: '16px',
            padding: '28px',
          }}
        >
          {children}
        </div>
      </main>

      <style>{`
        /* ── AG Grid Dark Override ─────────────────────────── */
        .batch-dark .ag-theme-quartz {
          --ag-background-color: #111827;
          --ag-header-background-color: #0d1117;
          --ag-border-color: #1f2937;
          --ag-row-border-color: #1f2937;
          --ag-foreground-color: #e2e8f0;
          --ag-header-foreground-color: #94a3b8;
          --ag-secondary-foreground-color: #64748b;
          --ag-row-hover-color: #1e293b;
          --ag-selected-row-background-color: #1e3a5f;
          --ag-cell-horizontal-border: solid #1f2937;
          --ag-input-focus-border-color: #6366f1;
          --ag-range-selection-border-color: #6366f1;
          --ag-odd-row-background-color: #0f1623;
          --ag-modal-overlay-background-color: rgba(0,0,0,0.7);
          --ag-popup-background-color: #1e293b;
          --ag-list-item-height: 36px;
          --ag-checkbox-unchecked-color: #334155;
          --ag-checkbox-checked-color: #6366f1;
          --ag-font-size: 13px;
        }
        .batch-dark .ag-theme-quartz .ag-header-cell {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .batch-dark .ag-theme-quartz .ag-cell {
          display: flex;
          align-items: center;
          color: #cbd5e1;
        }
        .batch-dark .ag-theme-quartz .ag-row-selected {
          background-color: #1e3a5f !important;
        }
        .batch-dark .end-of-schedule-row {
          background-color: #1f0a0a !important;
        }
        .batch-dark .end-of-schedule-row:hover {
          background-color: #2d0f0f !important;
        }

        /* ── FullCalendar Dark Override ────────────────────── */
        .batch-dark .fc {
          --fc-page-bg-color: #0b1220;
          --fc-neutral-bg-color: #0a1020;
          --fc-border-color: rgba(148, 163, 184, 0.12);
          --fc-button-bg-color: rgba(30, 41, 59, 0.72);
          --fc-button-border-color: rgba(148, 163, 184, 0.18);
          --fc-button-text-color: #cbd5e1;
          --fc-button-hover-bg-color: rgba(51, 65, 85, 0.88);
          --fc-button-hover-border-color: rgba(148, 163, 184, 0.28);
          --fc-button-active-bg-color: #6366f1;
          --fc-button-active-border-color: #6366f1;
          --fc-button-active-text-color: #fff;
          --fc-event-bg-color: #4f46e5;
          --fc-event-border-color: #4338ca;
          --fc-event-text-color: #fff;
          --fc-today-bg-color: rgba(99, 102, 241, 0.14);
          --fc-non-business-color: rgba(0,0,0,0.15);
          color: #e2e8f0;
        }
        .batch-dark .fc,
        .batch-dark .fc .fc-scrollgrid,
        .batch-dark .fc .fc-view-harness,
        .batch-dark .fc .fc-daygrid-body,
        .batch-dark .fc .fc-daygrid-body table,
        .batch-dark .fc .fc-timegrid-body,
        .batch-dark .fc .fc-timegrid-body table,
        .batch-dark .fc-theme-standard td,
        .batch-dark .fc-theme-standard th {
          background-color: transparent;
        }
        .batch-dark .fc .fc-daygrid-day-frame,
        .batch-dark .fc .fc-timegrid-col-frame {
          background:
            linear-gradient(180deg, rgba(18, 26, 48, 0.82), rgba(10, 15, 30, 0.54)),
            radial-gradient(circle at top left, rgba(148, 163, 184, 0.08), transparent 55%);
          border: 1px solid rgba(148, 163, 184, 0.1);
          border-radius: 22px;
          margin: 6px;
          backdrop-filter: blur(14px);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.04),
            0 14px 30px rgba(2, 6, 23, 0.18);
          transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
          overflow: hidden;
        }
        .batch-dark .fc .fc-daygrid-day-frame:hover,
        .batch-dark .fc .fc-timegrid-col-frame:hover {
          transform: translateY(-2px);
          border-color: rgba(125, 211, 252, 0.24);
          background:
            linear-gradient(180deg, rgba(30, 41, 59, 0.88), rgba(15, 23, 42, 0.7)),
            radial-gradient(circle at top left, rgba(125, 211, 252, 0.12), transparent 55%);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.06),
            0 18px 36px rgba(8, 47, 73, 0.18),
            0 0 0 1px rgba(125, 211, 252, 0.1);
        }
        .batch-dark .fc .fc-col-header-cell {
          background: rgba(7, 11, 22, 0.94);
          color: #818cf8;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.14em;
          padding: 12px 0;
        }
        .batch-dark .fc .fc-daygrid-day-number {
          color: #f8fafc;
          font-size: 16px;
          font-weight: 800;
          letter-spacing: -0.02em;
          padding: 10px 12px;
          text-shadow: 0 4px 14px rgba(15, 23, 42, 0.65);
        }
        .batch-dark .fc .fc-day-today .fc-daygrid-day-number {
          background: linear-gradient(135deg, #818cf8, #6366f1);
          color: #fff;
          border-radius: 9999px;
          min-width: 34px;
          height: 34px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          margin: 8px;
          box-shadow:
            0 10px 26px rgba(99, 102, 241, 0.35),
            inset 0 1px 0 rgba(255,255,255,0.24);
        }
        .batch-dark .fc .fc-toolbar-title {
          color: #f1f5f9;
          font-size: 20px;
          font-weight: 800;
          letter-spacing: -0.02em;
        }
        .batch-dark .fc .fc-toolbar {
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 1.2rem;
        }
        .batch-dark .fc .fc-toolbar-chunk {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .batch-dark .fc .fc-button {
          border-radius: 9999px;
          font-size: 12px;
          font-weight: 700;
          padding: 8px 14px;
          transition: all 0.18s ease;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.06),
            0 8px 24px rgba(2,6,23,0.18);
          backdrop-filter: blur(12px);
        }
        .batch-dark .fc .fc-button:hover {
          transform: translateY(-1px);
        }
        .batch-dark .fc .fc-button-primary:not(:disabled).fc-button-active {
          background: #6366f1 !important;
          border-color: #6366f1 !important;
          color: #fff !important;
        }
        .batch-dark .fc .fc-daygrid-day.fc-day-sat .fc-daygrid-day-frame,
        .batch-dark .fc .fc-daygrid-day.fc-day-sun .fc-daygrid-day-frame {
          background:
            linear-gradient(180deg, rgba(41, 37, 89, 0.5), rgba(15, 23, 42, 0.58)),
            radial-gradient(circle at top left, rgba(129, 140, 248, 0.08), transparent 55%);
        }
        .batch-dark .fc .fc-more-link {
          color: #c4b5fd;
          font-size: 11px;
          font-weight: 700;
          padding-left: 10px;
        }
        .batch-dark .fc .fc-popover {
          background: linear-gradient(180deg, rgba(15,23,42,0.98), rgba(2,6,23,0.96));
          border: 1px solid rgba(148, 163, 184, 0.16);
          border-radius: 18px;
          box-shadow: 0 24px 80px rgba(0,0,0,0.62);
          backdrop-filter: blur(16px);
        }
        .batch-dark .fc .fc-popover-header {
          background: #0f172a;
          color: #f1f5f9;
          border-radius: 18px 18px 0 0;
        }
        .batch-dark .fc .fc-timegrid-slot {
          border-color: #1f2937;
        }
        .batch-dark .fc .fc-timegrid-slot-label {
          color: #475569;
          font-size: 11px;
        }
        .batch-dark .fc .fc-daygrid-day.fc-day-today .fc-daygrid-day-frame,
        .batch-dark .fc .fc-timegrid-col.fc-day-today {
          background:
            linear-gradient(180deg, rgba(99,102,241,0.18), rgba(34,211,238,0.08)),
            radial-gradient(circle at top left, rgba(255,255,255,0.08), transparent 55%);
          border-color: rgba(129, 140, 248, 0.26);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.08),
            0 16px 34px rgba(99,102,241,0.12);
        }
        .batch-dark .fc .fc-scrollgrid {
          border-color: #1f2937;
          border-radius: 28px;
          overflow: hidden;
        }
        .batch-dark .fc td, .batch-dark .fc th {
          border-color: rgba(148, 163, 184, 0.1);
        }
        @media (max-width: 768px) {
          .batch-dark .fc .fc-toolbar-title {
            font-size: 16px;
          }
          .batch-dark .fc .fc-button {
            padding: 8px 12px;
            font-size: 11px;
          }
          .batch-dark .fc .fc-daygrid-day-frame,
          .batch-dark .fc .fc-timegrid-col-frame {
            border-radius: 18px;
            margin: 4px;
          }
          .batch-dark .fc .fc-daygrid-day-number {
            font-size: 15px;
            padding: 8px 10px;
          }
        }
      `}</style>
    </div>
  );
}
