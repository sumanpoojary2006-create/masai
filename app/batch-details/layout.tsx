import { type ReactNode } from "react";
import { LogoutButton } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";

export default function BatchDetailsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell mx-auto min-h-screen w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <section className="mb-10 flex flex-col gap-6 rounded-[2rem] bg-white p-8 shadow-panel sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-[var(--font-heading)] text-3xl font-bold text-ink sm:text-4xl">Batch Details</h1>
          <p className="theme-muted mt-2 text-sm">
            Manage batch metadata, sessions, and schedule inside MasaiLens.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </section>

      <section>{children}</section>
    </div>
  );
}
