import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { hasPublicSupabaseConfig, hasSupabaseConfig } from "@/lib/env";

export default async function BatchDetailsDashboardPage() {
  if (!hasSupabaseConfig() || !hasPublicSupabaseConfig()) {
    redirect("/");
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect("/batch-details/login");
  }

  return (
    <main className="grid gap-8">
      <section className="rounded-[2rem] bg-white p-8 shadow-panel">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-[var(--font-heading)] text-2xl font-bold text-ink">Batch Details Dashboard</h2>
            <p className="theme-muted mt-2 text-sm">
              Signed in as {user.email}. This area will host the batch management product.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/"
              className="theme-button-secondary inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition"
            >
              Return to MasaiLens
            </Link>
            <Link
              href="/batch-details/batch/sample"
              className="theme-button inline-flex h-11 items-center justify-center rounded-full bg-ink px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Open sample batch
            </Link>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] bg-white p-8 shadow-panel">
        <h3 className="text-xl font-semibold text-ink">Batch Details product is connected.</h3>
        <p className="theme-muted mt-3 text-sm leading-7">
          The dedicated login and dashboard shell are now active. Next, we can wire the actual batch list, batch detail editor, and session calendar from the Batch Details product.
        </p>
      </section>
    </main>
  );
}
