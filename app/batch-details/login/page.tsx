import { redirect } from "next/navigation";
import { BatchDetailsLoginForm } from "@/components/batch-details-login-form";
import { BrandLogo } from "@/components/brand-logo";
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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 border-b border-white/6 bg-[linear-gradient(90deg,rgba(45,212,191,0.18),rgba(79,70,229,0.22),rgba(8,11,20,0))]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_20%,rgba(45,212,191,0.16),transparent_32%),radial-gradient(circle_at_74%_18%,rgba(99,102,241,0.20),transparent_34%),linear-gradient(135deg,#080b14_0%,#0b1329_52%,#080b14_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.025)_0_1px,transparent_1px_76px)]" />

      <section className="relative grid w-full max-w-5xl overflow-hidden rounded-[30px] border border-white/10 bg-[#10162a]/90 shadow-[0_30px_110px_rgba(0,0,0,0.42)] backdrop-blur-2xl lg:grid-cols-[1.05fr_0.95fr]">
        <div className="flex flex-col justify-between gap-10 border-b border-white/8 bg-[linear-gradient(145deg,rgba(45,212,191,0.13),rgba(99,102,241,0.12)_46%,rgba(11,19,41,0.4))] p-6 sm:p-8 lg:min-h-[520px] lg:border-b-0 lg:border-r">
          <div>
            <div className="inline-flex rounded-2xl bg-white/8 px-3 py-2">
              <BrandLogo compact />
            </div>

            <div className="mt-8 lg:mt-10">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-300/80">
                Admin Console
              </p>
              <h1 className="mt-4 max-w-md text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                MasaiLens Batch Details
              </h1>
              <p className="mt-4 max-w-lg text-base leading-7 text-slate-300">
                Sign in to manage batch operations, schedules, and lecture compliance.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Access", "Admin"],
              ["Workspace", "Batch Wise"],
              ["Status", "Secure"]
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-[#0b1329]/70 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {label}
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-100">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex p-6 sm:p-8 lg:min-h-[520px] lg:items-center">
          <div className="w-full">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-300">
              Batch Details
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">Sign in</h2>
            <p className="mt-2 text-sm text-slate-400">Use your MasaiLens account to continue.</p>
            <div className="mt-8">
              <BatchDetailsLoginForm />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
