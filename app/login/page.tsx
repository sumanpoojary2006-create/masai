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
          <p className="mt-1 text-sm text-gray-500">Track LMS lectures, compliance, and weekly reports.</p>
          <p className="mt-3 text-xs font-medium text-gray-400">↓ Use the login form below</p>
        </div>
        <Link
          href="/batch-details/login"
          className="group rounded-2xl border-2 border-indigo-300 bg-indigo-50 p-5 transition hover:border-indigo-500 hover:bg-indigo-100"
        >
          <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600">Batch Details</p>
          <p className="mt-1 text-sm text-gray-500">Manage batch schedules, sessions, and team assignments.</p>
          <p className="mt-3 text-xs font-medium text-indigo-500 group-hover:underline">Go to Batch Details →</p>
        </Link>
      </div>

      <hr className="mb-6 border-gray-200" />

      <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-400">Lecture Compliance Login</p>
      <LoginForm />
    </AuthShell>
  );
}
