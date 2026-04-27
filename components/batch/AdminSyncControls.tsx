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
        accentClass="border-blue-200 bg-blue-50"
        buttonClass="bg-blue-600 hover:bg-blue-700 text-white"
      />
      <ActionCard
        title="Sync Up — Compliance Check"
        description="Run compliance check for all users and send Slack notifications for pending or missed resources."
        buttonLabel="Sync Up"
        loadingLabel="Running…"
        state={compliance.state}
        message={compliance.message}
        onTrigger={compliance.trigger}
        accentClass="border-emerald-200 bg-emerald-50"
        buttonClass="bg-emerald-600 hover:bg-emerald-700 text-white"
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
  accentClass,
  buttonClass
}: {
  title: string;
  description: string;
  buttonLabel: string;
  loadingLabel: string;
  state: ActionState;
  message: string;
  onTrigger: () => void;
  accentClass: string;
  buttonClass: string;
}) {
  return (
    <div className={`rounded-xl border p-5 ${accentClass}`}>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1 text-xs text-gray-500">{description}</p>

      <button
        onClick={onTrigger}
        disabled={state === "loading"}
        className={`mt-4 inline-flex h-9 items-center gap-2 rounded-full px-4 text-xs font-semibold transition disabled:opacity-60 ${buttonClass}`}
      >
        {state === "loading" && (
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
        )}
        {state === "loading" ? loadingLabel : buttonLabel}
      </button>

      {message && (
        <p
          className={`mt-3 text-xs font-medium ${
            state === "error" ? "text-red-600" : "text-emerald-700"
          }`}
        >
          {state === "success" ? "✓ " : "✗ "}
          {message}
        </p>
      )}
    </div>
  );
}
