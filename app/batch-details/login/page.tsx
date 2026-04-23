import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import { BatchDetailsLoginForm } from "@/components/batch-details-login-form";
import { getCurrentUser } from "@/lib/auth";
import { hasPublicSupabaseConfig, hasSupabaseConfig } from "@/lib/env";

export default async function BatchDetailsLoginPage() {
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

  const user = await getCurrentUser();
  if (user) {
    redirect("/batch-details/dashboard");
  }

  return (
    <AuthShell
      title="Login to Batch Details"
      description="Use your MasaiLens account to access the separate Batch Details workspace."
    >
      <BatchDetailsLoginForm />
    </AuthShell>
  );
}
