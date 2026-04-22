import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";

export function AuthShell({
  title,
  description,
  footer,
  children
}: {
  title: string;
  description: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="app-shell mx-auto flex min-h-screen w-full max-w-6xl flex-col overflow-x-hidden px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="font-[var(--font-heading)] text-2xl font-bold text-ink">
          Masai Resource Tracker
        </Link>
        <ThemeToggle />
      </div>

      <div className="mx-auto flex w-full max-w-3xl flex-1 py-10">
        <div className="flex w-full min-w-0 flex-col gap-6">
          <section className="theme-panel min-w-0 rounded-[2rem] p-8 shadow-panel">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">
              Multi-profile Access
            </p>
            <h1 className="mt-4 font-[var(--font-heading)] text-4xl font-bold text-ink sm:text-5xl">
              {title}
            </h1>
            <p className="theme-muted mt-4 text-base leading-7">{description}</p>
          </section>

          <section className="theme-panel min-w-0 rounded-[2rem] p-8 shadow-panel">
            {children}
            {footer ? <div className="mt-6 text-sm">{footer}</div> : null}
          </section>
        </div>
      </div>
    </main>
  );
}
