export const dynamic = "force-dynamic";

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
      title="Login to your resource tracker"
      description="Each profile manages its own LMS credentials, batch URLs, lectures, and compliance status."
    >
      <LoginForm />
    </AuthShell>
  );
}
