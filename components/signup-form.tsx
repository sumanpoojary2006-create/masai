"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createBrowserSupabase } from "@/lib/supabase-browser";

export function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    setIsPending(true);
    setMessage(null);

    const supabase = createBrowserSupabase();
    const { data, error } = await supabase.auth.signUp({
      email,
      password
    });

    if (error) {
      setMessage(error.message);
      setIsPending(false);
      return;
    }

    if (data.session) {
      router.replace("/setup");
      router.refresh();
      return;
    }

    setMessage("Account created. Verify your email if confirmation is enabled, then log in.");
    setIsPending(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <h2 className="font-[var(--font-heading)] text-2xl font-bold text-ink">Sign up</h2>
        <p className="theme-muted mt-2 text-sm">
          Create a personal profile. We’ll collect your LMS and batch settings next.
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
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="theme-input rounded-2xl px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
        />
      </label>

      <label className="flex flex-col gap-2 text-sm font-medium text-ink">
        Confirm password
        <input
          type="password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          className="theme-input rounded-2xl px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
        />
      </label>

      {message ? <p className="theme-notice rounded-2xl px-4 py-3 text-sm">{message}</p> : null}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-11 w-full items-center justify-center rounded-full bg-ink px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {isPending ? "Creating account..." : "Create account"}
      </button>

      <p className="theme-muted text-sm">
        Already have a profile?{" "}
        <Link href="/login" className="font-semibold text-brand">
          Login
        </Link>
      </p>
    </form>
  );
}
