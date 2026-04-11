export const dynamic = "force-dynamic";

import { AuthShell } from "@/components/auth-shell";
import { SignupForm } from "@/components/signup-form";
import { redirectAuthenticatedUser } from "@/lib/auth";
import { hasPublicSupabaseConfig, hasSupabaseConfig } from "@/lib/env";

export default async function SignupPage() {
  if (!hasSupabaseConfig() || !hasPublicSupabaseConfig()) {
    return (
      <AuthShell
        title="Set up your environment first"
        description="Public and server-side Supabase keys are required before signup can work."
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
      title="Create your profile"
      description="We’ll set up your login first, then collect the LMS and batch details this tracker should use for your isolated workspace."
    >
      <SignupForm />
    </AuthShell>
  );
}
