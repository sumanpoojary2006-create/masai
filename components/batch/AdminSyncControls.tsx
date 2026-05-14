"use client";

import { useEffect, useRef, useState } from "react";

import { TopProgressBar } from "@/components/top-progress-bar";

type ActionState = "idle" | "loading" | "success" | "error";

const SYNC_UP_STEPS = [
  "Fetching CC profiles…",
  "Checking LMS task statuses…",
  "Syncing batch cache…",
  "Updating completed tasks…",
  "Finalising…",
];

function useAdminAction(endpoint: string, body?: Record<string, unknown>, onSuccess?: () => void) {
  const [state, setState] = useState<ActionState>("idle");
  const [message, setMessage] = useState("");

  async function trigger() {
    setState("loading");
    setMessage("");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      if (!res.ok) {
        setState("error");
        setMessage(json.message ?? "Something went wrong.");
      } else {
        setState("success");
        setMessage(json.message ?? "Done.");
        onSuccess?.();
      }
    } catch {
      setState("error");
      setMessage("Network error. Please try again.");
    }
  }

  return { state, message, trigger };
}

export function AdminSyncControls() {
  const sync       = useAdminAction("/api/admin/sync-week",               undefined,              () => window.location.reload());
  const slackPush  = useAdminAction("/api/admin/push-slack-notification", { type: "normal" });
  const slackAlert = useAdminAction("/api/admin/push-slack-notification", { type: "alert" });
  const compliance = useAdminAction("/api/admin/compliance",              undefined,              () => { slackPush.trigger(); window.location.reload(); });

  const [syncStep, setSyncStep] = useState(0);
  const stepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (compliance.state === "loading") {
      setSyncStep(0);
      stepIntervalRef.current = setInterval(() => {
        setSyncStep((prev) => Math.min(prev + 1, SYNC_UP_STEPS.length - 1));
      }, 2000);
    } else {
      if (stepIntervalRef.current) {
        clearInterval(stepIntervalRef.current);
        stepIntervalRef.current = null;
      }
    }
    return () => {
      if (stepIntervalRef.current) clearInterval(stepIntervalRef.current);
    };
  }, [compliance.state]);

  const isAnyLoading =
    sync.state === "loading" ||
    compliance.state === "loading" ||
    slackPush.state === "loading" ||
    slackAlert.state === "loading";

  return (
    <>
    <TopProgressBar isLoading={isAnyLoading} />
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        description="Run compliance check for all users, update resource statuses from LMS, and automatically push Slack notifications."
        buttonLabel="Sync Up"
        loadingLabel="Running…"
        state={compliance.state}
        message={compliance.message}
        onTrigger={compliance.trigger}
        borderColor="#065f46"
        buttonStyle={{ background: '#059669', color: '#fff' }}
      />
      <ActionCard
        title="Push Slack Notification"
        description="Run a DB check and send completed and pending resource status to all coordinators on Slack."
        buttonLabel="Push Notification"
        loadingLabel="Sending…"
        state={slackPush.state}
        message={slackPush.message}
        onTrigger={slackPush.trigger}
        borderColor="#7c3aed"
        buttonStyle={{ background: '#7c3aed', color: '#fff' }}
        badge="Completed + Pending"
      />
      <ActionCard
        title="Slack Alert"
        description="Run a DB check and send only the pending resources as an urgent alert to all coordinators."
        buttonLabel="Send Alert"
        loadingLabel="Sending…"
        state={slackAlert.state}
        message={slackAlert.message}
        onTrigger={slackAlert.trigger}
        borderColor="#b45309"
        buttonStyle={{ background: '#d97706', color: '#fff' }}
        badge="Pending Only"
      />
    </div>

    {/* Full-screen overlay while Sync Up is running */}
    {compliance.state === "loading" && (
      <div style={{
        position: "fixed", inset: 0, zIndex: 9998,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
      }}>
        <div style={{
          width: "100%", maxWidth: "360px",
          background: "#0f172a", border: "1px solid #1e293b",
          borderRadius: "24px", padding: "32px", boxShadow: "0 25px 50px rgba(0,0,0,0.6)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
            <span style={{
              width: "20px", height: "20px", borderRadius: "50%",
              border: "2px solid #0f766e", borderTopColor: "#2dd4bf",
              display: "inline-block", animation: "spin 0.7s linear infinite",
            }} />
            <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.18em", color: "#2dd4bf", textTransform: "uppercase" }}>
              Syncing…
            </span>
          </div>
          <div style={{ height: "8px", borderRadius: "9999px", background: "#1e293b", overflow: "hidden", marginBottom: "20px" }}>
            <div style={{
              height: "100%", borderRadius: "9999px", background: "#0d9488",
              width: `${((syncStep + 1) / SYNC_UP_STEPS.length) * 100}%`,
              transition: "width 0.7s ease-out",
            }} />
          </div>
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
            {SYNC_UP_STEPS.map((label, index) => (
              <li key={label} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px" }}>
                {index < syncStep ? (
                  <span style={{
                    width: "20px", height: "20px", borderRadius: "50%",
                    background: "#0d9488", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "10px", fontWeight: 700, color: "#fff", flexShrink: 0,
                  }}>✓</span>
                ) : index === syncStep ? (
                  <span style={{
                    width: "20px", height: "20px", borderRadius: "50%",
                    border: "2px solid #0f766e", borderTopColor: "#2dd4bf",
                    display: "inline-block", animation: "spin 0.7s linear infinite", flexShrink: 0,
                  }} />
                ) : (
                  <span style={{
                    width: "20px", height: "20px", borderRadius: "50%",
                    border: "1px solid #334155", flexShrink: 0,
                  }} />
                )}
                <span style={{
                  color: index < syncStep ? "#2dd4bf" : index === syncStep ? "#f1f5f9" : "#475569",
                  textDecoration: index < syncStep ? "line-through" : "none",
                  fontWeight: index === syncStep ? 600 : 400,
                }}>
                  {label}
                </span>
              </li>
            ))}
          </ol>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )}
    </>
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
  badge,
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
  badge?: string;
}) {
  return (
    <div
      style={{
        background: '#111827',
        border: `1px solid ${borderColor}40`,
        borderRadius: '12px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
        <h3 style={{ color: '#f1f5f9', fontSize: '14px', fontWeight: 600, margin: 0, flex: 1 }}>
          {title}
        </h3>
        {badge && (
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              color: borderColor,
              background: `${borderColor}18`,
              border: `1px solid ${borderColor}40`,
              borderRadius: '9999px',
              padding: '2px 8px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {badge}
          </span>
        )}
      </div>
      <p style={{ color: '#94a3b8', fontSize: '12px', lineHeight: '1.5', flex: 1 }}>
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
          alignSelf: 'flex-start',
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
