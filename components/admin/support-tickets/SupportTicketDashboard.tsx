"use client";

import { useState } from "react";
import { LiveOverview } from "./LiveOverview";
import { BatchWoW } from "./BatchWoW";
import { BatchMoM } from "./BatchMoM";
import { BatchLeaderboard } from "./BatchLeaderboard";
import { CCLeaderboard } from "./CCLeaderboard";
import { DomainWoW } from "./DomainWoW";
import { DomainMoM } from "./DomainMoM";
import { TATTracking } from "./TATTracking";
import { TicketIntelligence } from "./TicketIntelligence";
import { DomainConfig } from "./DomainConfig";

type TabKey =
  | "overview" | "batch-wow" | "batch-mom" | "batch-leaderboard"
  | "cc-leaderboard" | "domain-wow" | "domain-mom" | "tat" | "intelligence"
  | "domain-config";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview",          label: "Live Overview" },
  { key: "batch-wow",         label: "Batch WoW" },
  { key: "batch-mom",         label: "Batch MoM" },
  { key: "batch-leaderboard", label: "Batch Leaderboard" },
  { key: "cc-leaderboard",    label: "CC Leaderboard" },
  { key: "domain-wow",        label: "Domain WoW" },
  { key: "domain-mom",        label: "Domain MoM" },
  { key: "tat",               label: "TAT Tracking" },
  { key: "intelligence",      label: "Intelligence" },
  { key: "domain-config",     label: "⚙ Domain Config" },
];

export function SupportTicketDashboard({ embedded = false }: { embedded?: boolean }) {
  const [active, setActive] = useState<TabKey>("overview");

  const inner = (
    <>
      {/* Sub-tab nav */}
      {embedded ? (
        <div style={{ overflowX: "auto", marginBottom: "24px" }}>
          <nav style={{ display: "flex", gap: "3px", padding: "4px", background: "#050a14", border: "1px solid #1a2235", borderRadius: "12px", width: "fit-content", minWidth: "100%" }}>
            {TABS.map((tab) => {
              const isActive = active === tab.key;
              const isConfig = tab.key === "domain-config";
              return (
                <button
                  key={tab.key}
                  onClick={() => setActive(tab.key)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "8px",
                    border: "none",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: isActive ? 600 : 400,
                    whiteSpace: "nowrap",
                    transition: "all 0.15s",
                    background: isActive
                      ? isConfig ? "rgba(251,191,36,0.15)" : "rgba(99,102,241,0.18)"
                      : "transparent",
                    color: isActive
                      ? isConfig ? "#fbbf24" : "#818cf8"
                      : "#4b5a6e",
                    outline: isActive
                      ? `1px solid ${isConfig ? "rgba(251,191,36,0.3)" : "rgba(99,102,241,0.3)"}`
                      : "none",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      ) : (
        <div className="border-b border-zinc-800 px-6 overflow-x-auto">
          <nav className="flex gap-0 min-w-max">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActive(tab.key)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  active === tab.key
                    ? "border-indigo-500 text-indigo-400"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                } ${tab.key === "domain-config" ? "text-amber-400 hover:text-amber-300" : ""}`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      )}

      {/* Tab content */}
      <div className={embedded ? "" : "p-6"}>
        {active === "overview"          && <LiveOverview />}
        {active === "batch-wow"         && <BatchWoW />}
        {active === "batch-mom"         && <BatchMoM />}
        {active === "batch-leaderboard" && <BatchLeaderboard />}
        {active === "cc-leaderboard"    && <CCLeaderboard />}
        {active === "domain-wow"        && <DomainWoW />}
        {active === "domain-mom"        && <DomainMoM />}
        {active === "tat"               && <TATTracking />}
        {active === "intelligence"      && <TicketIntelligence />}
        {active === "domain-config"     && <DomainConfig />}
      </div>
    </>
  );

  if (embedded) return inner;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="border-b border-zinc-800 px-6 py-4">
        <h1 className="text-xl font-semibold tracking-tight">Support Ticket Dashboards</h1>
        <p className="text-xs text-zinc-500 mt-0.5">2026 data · Live from LMS</p>
      </div>
      {inner}
    </div>
  );
}
