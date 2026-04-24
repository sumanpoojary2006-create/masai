import { type ReactNode } from "react";
import { LogoutButton } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { AgGridSetup } from "@/components/batch/AgGridSetup";

import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";

export default function BatchDetailsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell mx-auto min-h-screen w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <section className="mb-8 flex flex-col gap-4 rounded-[2rem] bg-white p-6 shadow-panel sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <a href="/" className="text-sm text-gray-400 hover:text-gray-600">
            ← MasaiLens
          </a>
          <div>
            <h1 className="font-[var(--font-heading)] text-2xl font-bold text-ink sm:text-3xl">
              Batch Wise
            </h1>
            <p className="theme-muted mt-0.5 text-xs">
              Manage batch metadata, sessions, and schedules
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="/batch-details/dashboard"
            className="theme-button-secondary inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold transition"
          >
            All Batches
          </a>
          <ThemeToggle />
          <LogoutButton />
        </div>
      </section>

      <AgGridSetup />
      <section className="rounded-[2rem] bg-white p-8 shadow-panel">
        {children}
      </section>

      <style>{`
        .end-of-schedule-row {
          background-color: #fff5f5 !important;
        }
        .end-of-schedule-row:hover {
          background-color: #fee2e2 !important;
        }
        .ag-theme-quartz .ag-cell {
          display: flex;
          align-items: center;
        }
      `}</style>
    </div>
  );
}
