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
  { key: "domain-config",     label: "Domain Config" },
];

export function SupportTicketDashboard() {
  const [active, setActive] = useState<TabKey>("overview");

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="border-b border-zinc-800 px-6 py-4">
        <h1 className="text-xl font-semibold tracking-tight">Support Ticket Dashboards</h1>
        <p className="text-xs text-zinc-500 mt-0.5">2026 data · Live from LMS</p>
      </div>

      {/* Tab nav */}
      <div className="border-b border-zinc-800 px-6 overflow-x-auto">
        <nav className="flex gap-0 min-w-max">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActive(tab.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                active === tab.key
                  ? "border-indigo-500 text-indigo-400"
                  : "border-transparent text-zinc-400 hover:text-zinc-200"
              } ${tab.key === "domain-config" ? "ml-auto text-amber-400 hover:text-amber-300" : ""}`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="p-6">
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
    </div>
  );
}
