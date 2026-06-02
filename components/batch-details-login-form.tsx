"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createBrowserSupabase } from "@/lib/supabase-browser";

export function BatchDetailsLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setMessage(null);
    try {
      const supabase = createBrowserSupabase();
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Request timed out. Check your Supabase configuration.")), 12000)
      );
      const { error } = await Promise.race([
        supabase.auth.signInWithPassword({ email, password }),
        timeout
      ]);
      if (error) { setMessage(error.message); setIsPending(false); return; }
      router.push("/batch-details/dashboard");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Login failed. Please try again.");
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <label className="flex flex-col gap-2 text-sm font-semibold text-slate-300">
        <span>Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@masaischool.com"
          className="h-[52px] w-full rounded-2xl border border-white/10 bg-[#080d18] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10"
        />
      </label>

      <label className="flex flex-col gap-2 text-sm font-semibold text-slate-300">
        <span>Password</span>
        <input
          type="password"
          required
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="••••••••"
          className="h-[52px] w-full rounded-2xl border border-white/10 bg-[#080d18] px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-violet-400 focus:ring-4 focus:ring-violet-500/10"
        />
      </label>

      {message && (
        <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {message}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="mt-1 h-[52px] w-full rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-500 px-5 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(79,70,229,0.38)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
