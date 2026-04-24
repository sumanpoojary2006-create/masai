export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirectAuthenticatedUser } from "@/lib/auth";
import { hasPublicSupabaseConfig, hasSupabaseConfig } from "@/lib/env";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  if (!hasSupabaseConfig() || !hasPublicSupabaseConfig()) {
    return (
      <AuthShell
        title="Set up your environment first"
        description="Public and server-side Supabase keys are required before login can work."
      >
        <p className="theme-notice rounded-2xl px-4 py-4 text-sm">
          Add `SUPABASE_URL`, `SUPABASE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and
          `NEXT_PUBLIC_SUPABASE_ANON_KEY`, then reload this page.
        </p>
      </AuthShell>
    );
  }

  await redirectAuthenticatedUser();

  return (
    <AuthShell
      title="Welcome to MasaiLens"
      description="Choose your portal below to continue."
    >
      {/* Portal selector */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border-2 border-brand/30 bg-brand/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand">Lecture Compliance</p>
          <p className="theme-muted mt-1 text-sm">Track LMS lectures, compliance, and weekly reports.</p>
          <p className="theme-muted mt-3 text-xs font-medium">↓ Use the login form below</p>
        </div>
        <Link
          href="/batch-details/login"
          className="theme-panel group rounded-2xl border-2 border-indigo-400/35 p-5 transition duration-200 hover:-translate-y-0.5 hover:border-indigo-400/70 hover:shadow-[0_16px_40px_rgba(99,102,241,0.18)]"
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-400">Batch Details</p>
          <p className="theme-muted mt-1 text-sm">Manage batch schedules, sessions, and team assignments.</p>
          <p className="mt-3 text-xs font-medium text-indigo-300 transition group-hover:text-indigo-200 group-hover:underline">
            Go to Batch Details →
          </p>
        </Link>
      </div>

      <hr className="mb-6 border-white/10" />

      <p className="theme-muted mb-4 text-xs font-semibold uppercase tracking-widest">Lecture Compliance Login</p>
      <LoginForm />
    </AuthShell>
  );
}
