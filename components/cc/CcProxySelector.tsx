"use client";

import { useRouter } from "next/navigation";
import { useTransition, useState, useRef, useEffect } from "react";

export type ProxyCoordinator = {
  user_id: string;
  email: string;
  name: string;
  authorized: boolean;
};

type Props = {
  coordinators: ProxyCoordinator[];
  currentProxyId: string | null;
  currentProxyName: string | null;
  /** Base path for proxy navigation, defaults to "/cc/dashboard" */
  basePath?: string;
};

const SYNC_STEPS = [
  "Pulling LMS task statuses…",
  "Syncing batch cache…",
  "Checking pending deadlines…",
  "Sending Slack notification to CC…",
  "Finalizing…",
];

export function CcProxySelector({ coordinators, currentProxyId, currentProxyName, basePath = "/cc/dashboard" }: Props) {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStep, setSyncStep] = useState(0);
  const [syncStatus, setSyncStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const stepRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isSyncing) {
      setSyncStep(0);
      stepRef.current = setInterval(() => {
        setSyncStep((prev) => Math.min(prev + 1, SYNC_STEPS.length - 1));
      }, 1800);
    } else {
      if (stepRef.current) {
        clearInterval(stepRef.current);
        stepRef.current = null;
      }
    }
    return () => {
      if (stepRef.current) clearInterval(stepRef.current);
    };
  }, [isSyncing]);

  function handleSelectChange(value: string) {
    if (value === "__self__") {
      router.push(basePath);
    } else {
      router.push(`${basePath}?proxy=${value}`);
    }
  }

  function handleSync() {
    if (!currentProxyId) return;

    startTransition(async () => {
      setIsSyncing(true);
      setSyncStatus("idle");
      setMessage(null);

      try {
        const response = await fetch("/api/compliance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target_cc_id: currentProxyId }),
        });

        let payload: { message?: string; result?: { checkedLectures: number; updatedTasks: number } } = {};
        try {
          payload = await response.json();
        } catch {
          // non-JSON response
        }

        if (!response.ok) {
          setSyncStatus("error");
          setMessage(payload.message ?? "Unable to run compliance sync.");
          setIsSyncing(false);
          return;
        }

        setSyncStatus("success");
        setMessage(
          payload.result
            ? `Checked ${payload.result.checkedLectures} lectures · ${payload.result.updatedTasks} tasks updated. ${currentProxyName} has been notified on Slack.`
            : payload.message ?? "Sync completed."
        );
        setIsSyncing(false);
        router.refresh();
      } catch {
        setSyncStatus("error");
        setMessage("Unable to run compliance sync. Please try again.");
        setIsSyncing(false);
      }
    });
  }

  const selectedValue = currentProxyId ?? "__self__";

  return (
    <div className="space-y-3">
      {/* CC Dropdown */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium text-slate-400">Viewing dashboard for</label>
        <select
          value={selectedValue}
          onChange={(e) => handleSelectChange(e.target.value)}
          className="rounded-xl border border-white/10 bg-[#1a2236] px-4 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none min-w-[220px]"
        >
          <option value="__self__">My Dashboard</option>
          {coordinators.length > 0 && (
            <optgroup label="Other Coordinators">
              {coordinators.map((cc) => (
                <option
                  key={cc.user_id}
                  value={cc.user_id}
                  disabled={!cc.authorized}
                  title={cc.authorized ? undefined : "Not configured by admin"}
                >
                  {cc.authorized
                    ? cc.name
                    : `${cc.name} — Not configured by admin`}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      {/* Cover banner + Sync Up (only in proxy mode) */}
      {currentProxyId && currentProxyName && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-amber-300">
                You are viewing <span className="font-bold">{currentProxyName}&apos;s</span> dashboard as cover.
              </p>
              <p className="mt-0.5 text-xs text-amber-400/80">
                Any sync you run will update their data and notify them on Slack — not you.
              </p>
            </div>

            <button
              type="button"
              disabled={isSyncing}
              onClick={handleSync}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-amber-500 px-5 text-sm font-semibold text-white transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-slate-500"
            >
              {isSyncing && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              )}
              {isSyncing ? "Syncing…" : "Sync Up Now"}
            </button>
          </div>

          {/* Sync progress */}
          {isSyncing && (
            <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-950/30 px-4 py-3">
              <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-amber-900/50">
                <div
                  className="h-full rounded-full bg-amber-400 transition-all duration-700 ease-out"
                  style={{ width: `${((syncStep + 1) / SYNC_STEPS.length) * 100}%` }}
                />
              </div>
              <ol className="space-y-1">
                {SYNC_STEPS.map((label, idx) => (
                  <li key={label} className="flex items-center gap-2 text-xs">
                    {idx < syncStep ? (
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-amber-950">✓</span>
                    ) : idx === syncStep ? (
                      <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-amber-600 border-t-amber-300" />
                    ) : (
                      <span className="h-4 w-4 shrink-0 rounded-full border border-amber-800" />
                    )}
                    <span
                      className={
                        idx < syncStep
                          ? "text-amber-400 line-through"
                          : idx === syncStep
                          ? "font-semibold text-amber-200"
                          : "text-amber-700"
                      }
                    >
                      {label}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Sync result */}
          {!isSyncing && message && (
            <div
              className={`mt-3 flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium ${
                syncStatus === "error"
                  ? "bg-rose-950/40 text-rose-300"
                  : "bg-emerald-950/40 text-emerald-300"
              }`}
            >
              <span className="mt-px shrink-0">{syncStatus === "error" ? "✗" : "✓"}</span>
              <span>{message}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
