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
          --fc-page-bg-color: #111827;
          --fc-neutral-bg-color: #111827;
          --fc-border-color: #1f2937;
          --fc-button-bg-color: #1e293b;
          --fc-button-border-color: #334155;
          --fc-button-text-color: #cbd5e1;
          --fc-button-hover-bg-color: #273548;
          --fc-button-hover-border-color: #475569;
          --fc-button-active-bg-color: #6366f1;
          --fc-button-active-border-color: #6366f1;
          --fc-button-active-text-color: #fff;
          --fc-event-bg-color: #4f46e5;
          --fc-event-border-color: #4338ca;
          --fc-event-text-color: #fff;
          --fc-today-bg-color: rgba(99,102,241,0.1);
          color: #e2e8f0;
        }
        .batch-dark .fc-theme-standard td,
        .batch-dark .fc-theme-standard th {
          border-color: #1f2937;
        }
        .batch-dark .fc .fc-scrollgrid {
          border-color: #1f2937;
        }
        .batch-dark .fc .fc-col-header-cell {
          background: #0d1117;
          color: #818cf8;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          padding: 10px 0;
        }
        .batch-dark .fc .fc-daygrid-day-number {
          color: #94a3b8;
          font-size: 13px;
          font-weight: 600;
          padding: 6px 10px;
        }
        .batch-dark .fc .fc-day-today .fc-daygrid-day-number {
          background: #6366f1;
          color: #fff;
          border-radius: 9999px;
          min-width: 26px;
          height: 26px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0 6px;
          margin: 5px;
          font-weight: 700;
        }
        .batch-dark .fc .fc-toolbar-title {
          color: #f1f5f9;
          font-size: 18px;
          font-weight: 700;
        }
        .batch-dark .fc .fc-toolbar {
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 1rem;
        }
        .batch-dark .fc .fc-button {
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          padding: 6px 12px;
        }
        .batch-dark .fc .fc-button-primary:not(:disabled).fc-button-active {
          background: #6366f1 !important;
          border-color: #6366f1 !important;
          color: #fff !important;
        }
        .batch-dark .fc .fc-more-link {
          color: #818cf8;
          font-size: 11px;
          font-weight: 600;
        }
        .batch-dark .fc .fc-popover {
          background: #1e293b;
          border: 1px solid #334155;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        }
        .batch-dark .fc .fc-popover-header {
          background: #0f172a;
          color: #f1f5f9;
          border-radius: 12px 12px 0 0;
        }
        .batch-dark .fc .fc-timegrid-slot {
          border-color: #1f2937;
        }
        .batch-dark .fc .fc-timegrid-slot-label {
          color: #475569;
          font-size: 11px;
        }
        @media (max-width: 768px) {
          .batch-dark .fc .fc-toolbar-title { font-size: 15px; }
          .batch-dark .fc .fc-button { padding: 6px 10px; font-size: 11px; }
        }
      `}</style>
    </div>
  );
}
