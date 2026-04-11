"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createBrowserSupabase } from "@/lib/supabase-browser";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setMessage(null);

    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      setMessage(error.message);
      setIsPending(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <h2 className="font-[var(--font-heading)] text-2xl font-bold text-ink">Login</h2>
        <p className="theme-muted mt-2 text-sm">
          Sign in to your personal lecture tracker profile.
        </p>
      </div>

      <label className="flex flex-col gap-2 text-sm font-medium text-ink">
        Email
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="theme-input rounded-2xl px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
        />
      </label>

      <label className="flex flex-col gap-2 text-sm font-medium text-ink">
        Password
        <input
          type="password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="theme-input rounded-2xl px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
        />
      </label>

      {message ? <p className="theme-error rounded-2xl px-4 py-3 text-sm">{message}</p> : null}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-11 w-full items-center justify-center rounded-full bg-ink px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {isPending ? "Logging in..." : "Login"}
      </button>

      <p className="theme-muted text-sm">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-brand">
          Create a profile
        </Link>
      </p>
    </form>
  );
}
