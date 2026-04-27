"use client";

import { useState } from "react";

type ActionState = "idle" | "loading" | "success" | "error";

function useAdminAction(endpoint: string) {
  const [state, setState] = useState<ActionState>("idle");
  const [message, setMessage] = useState("");

  async function trigger() {
    setState("loading");
    setMessage("");
    try {
      const res = await fetch(endpoint, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setState("error");
        setMessage(json.message ?? "Something went wrong.");
      } else {
        setState("success");
        setMessage(json.message ?? "Done.");
      }
    } catch {
      setState("error");
      setMessage("Network error. Please try again.");
    }
  }

  return { state, message, trigger };
}

export function AdminSyncControls() {
  const sync = useAdminAction("/api/admin/sync-week");
  const compliance = useAdminAction("/api/admin/compliance");

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <ActionCard
        title="Sync This Week's Lectures"
        description="Pull the latest sessions from LMS for all users and refresh their dashboards."
        buttonLabel="Sync Lectures"
        loadingLabel="Syncing…"
        state={sync.state}
        message={sync.message}
        onTrigger={sync.trigger}
        borderColor="#1d4ed8"
        buttonStyle={{ background: '#1d4ed8', color: '#fff' }}
      />
      <ActionCard
        title="Sync Up — Compliance Check"
        description="Run compliance check for all users and send Slack notifications for pending or missed resources."
        buttonLabel="Sync Up"
        loadingLabel="Running…"
        state={compliance.state}
        message={compliance.message}
        onTrigger={compliance.trigger}
        borderColor="#065f46"
        buttonStyle={{ background: '#059669', color: '#fff' }}
      />
    </div>
  );
}

function ActionCard({
  title,
  description,
  buttonLabel,
  loadingLabel,
  state,
  message,
  onTrigger,
  borderColor,
  buttonStyle,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  loadingLabel: string;
  state: ActionState;
  message: string;
  onTrigger: () => void;
  borderColor: string;
  buttonStyle: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: '#111827',
        border: `1px solid ${borderColor}40`,
        borderRadius: '12px',
        padding: '20px',
      }}
    >
      <h3 style={{ color: '#f1f5f9', fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>
        {title}
      </h3>
      <p style={{ color: '#94a3b8', fontSize: '12px', lineHeight: '1.5' }}>
        {description}
      </p>

      <button
        onClick={onTrigger}
        disabled={state === "loading"}
        style={{
          ...buttonStyle,
          marginTop: '16px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          borderRadius: '9999px',
          padding: '6px 16px',
          fontSize: '12px',
          fontWeight: 600,
          border: 'none',
          cursor: state === "loading" ? 'not-allowed' : 'pointer',
          opacity: state === "loading" ? 0.6 : 1,
          transition: 'opacity 0.15s',
        }}
      >
        {state === "loading" && (
          <span
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.3)',
              borderTopColor: '#fff',
              animation: 'spin 0.7s linear infinite',
              display: 'inline-block',
            }}
          />
        )}
        {state === "loading" ? loadingLabel : buttonLabel}
      </button>

      {message && (
        <p
          style={{
            marginTop: '10px',
            fontSize: '12px',
            fontWeight: 500,
            color: state === "error" ? '#f87171' : '#34d399',
          }}
        >
          {state === "success" ? "✓ " : "✗ "}
          {message}
        </p>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
