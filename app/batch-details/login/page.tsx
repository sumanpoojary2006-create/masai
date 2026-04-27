import { redirect } from "next/navigation";
import { BatchDetailsLoginForm } from "@/components/batch-details-login-form";
import { getCurrentUser } from "@/lib/auth";
import { hasPublicSupabaseConfig, hasSupabaseConfig } from "@/lib/env";

export default async function BatchDetailsLoginPage() {
  if (!hasSupabaseConfig() || !hasPublicSupabaseConfig()) {
    return (
      <div style={{ maxWidth: 420, margin: '60px auto', background: '#111827', border: '1px solid #1f2937', borderRadius: 20, padding: 32, color: '#94a3b8', fontSize: 14 }}>
        Configure <code>SUPABASE_URL</code>, <code>SUPABASE_KEY</code>,{' '}
        <code>NEXT_PUBLIC_SUPABASE_URL</code>, and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, then reload.
      </div>
    );
  }

  const user = await getCurrentUser();
  if (user) redirect("/batch-details/dashboard");

  return (
    <div style={{ maxWidth: 440, margin: '40px auto' }}>
      <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 20, padding: '36px 32px' }}>
        <p style={{ color: '#6366f1', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.18em', marginBottom: 10 }}>
          Batch Details
        </p>
        <h1 style={{ color: '#f1f5f9', fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 6 }}>
          Sign in
        </h1>
        <p style={{ color: '#475569', fontSize: 13, marginBottom: 28 }}>
          Use your MasaiLens account to continue.
        </p>
        <BatchDetailsLoginForm />
      </div>
    </div>
  );
}
