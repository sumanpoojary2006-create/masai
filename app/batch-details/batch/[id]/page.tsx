import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { hasPublicSupabaseConfig, hasSupabaseConfig } from "@/lib/env";

interface Props {
  params: {
    id: string;
  };
}

export default async function BatchDetailsBatchPage({ params }: Props) {
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
        <h2 className="font-[var(--font-heading)] text-2xl font-bold text-ink">Batch {params.id}</h2>
        <p className="theme-muted mt-3 text-sm">
          This batch detail page is the first placeholder for the Batch Details product. It is protected by the Batch Details login flow.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/batch-details/dashboard"
            className="theme-button-secondary inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition"
          >
            Back to Batch Dashboard
          </Link>
          <Link
            href="/"
            className="theme-button-secondary inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition"
          >
            MasaiLens Home
          </Link>
        </div>
      </section>
    </main>
  );
}
