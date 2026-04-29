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

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: '#0d1117',
    border: '1px solid #1f2937',
    borderRadius: 12,
    padding: '11px 14px',
    fontSize: 14,
    color: '#e2e8f0',
    outline: 'none',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontSize: 13,
    fontWeight: 600,
    color: '#94a3b8',
    marginBottom: 16,
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <label style={labelStyle}>
        Email
        <input
          type="email"
          required
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@masaischool.com"
          style={inputStyle}
        />
      </label>

      <label style={labelStyle}>
        Password
        <input
          type="password"
          required
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="••••••••"
          style={inputStyle}
        />
      </label>

      {message && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#fca5a5', marginBottom: 16 }}>
          {message}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        style={{
          width: '100%',
          height: 44,
          background: isPending ? '#1e293b' : 'linear-gradient(135deg,#6366f1,#4f46e5)',
          border: 'none',
          borderRadius: 12,
          color: '#fff',
          fontSize: 14,
          fontWeight: 700,
          cursor: isPending ? 'not-allowed' : 'pointer',
          marginTop: 4,
          opacity: isPending ? 0.7 : 1,
        }}
      >
        {isPending ? "Signing in…" : "Sign in"}
      </button>

      <p style={{ color: '#334155', fontSize: 12, marginTop: 14, textAlign: 'center' }}>
        Use your MasaiLens credentials to access the Batch Details workspace.
      </p>
    </form>
  );
}
