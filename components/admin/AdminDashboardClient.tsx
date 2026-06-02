"use client";

import { useState } from "react";

import { AdminSyncControls } from "@/components/batch/AdminSyncControls";
import { BatchDashboardClient } from "@/components/batch/BatchDashboardClient";
import { CCManagementTab } from "@/components/admin/CCManagementTab";
import { CurriculumTab } from "@/components/admin/CurriculumTab";
import { DomainResourcesTab } from "@/components/admin/DomainResourcesTab";
import { LeaveCoverageTab } from "@/components/admin/LeaveCoverageTab";
import { SupportTicketDashboard } from "@/components/admin/support-tickets/SupportTicketDashboard";

type Tab = "batches" | "sync" | "cc" | "leave" | "curriculum" | "tickets" | "domainResources";

interface NavItem {
  id: Tab;
  label: string;
  icon: string;
  accentColor: string;
  description: string;
  adminOnly: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    id: "batches",
    label: "Batches",
    icon: "⊞",
    accentColor: "#06b6d4",
    description: "View and manage all batches",
    adminOnly: false,
  },
  {
    id: "sync",
    label: "Sync Controls",
    icon: "↺",
    accentColor: "#3b82f6",
    description: "Pull LMS data and run compliance checks",
    adminOnly: true,
  },
  {
    id: "cc",
    label: "CC Management",
    icon: "⊕",
    accentColor: "#10b981",
    description: "Assign coordinators to batches and sync lectures",
    adminOnly: true,
  },
  {
    id: "leave",
    label: "Leave Coverage",
    icon: "◑",
    accentColor: "#f59e0b",
    description: "Manage CC coverage during leaves",
    adminOnly: true,
  },
  {
    id: "curriculum",
    label: "Curriculum",
    icon: "↑",
    accentColor: "#8b5cf6",
    description: "Upload and track curriculum data per batch",
    adminOnly: true,
  },
  {
    id: "tickets",
    label: "Support Tickets",
    icon: "🎫",
    accentColor: "#f97316",
    description: "Support ticket dashboards — 2026 data",
    adminOnly: true,
  },
  {
    id: "domainResources",
    label: "Domain Resources",
    icon: "◫",
    accentColor: "#2dd4bf",
    description: "Daily CC resource checklist by domain lead",
    adminOnly: true,
  },
];

export function AdminDashboardClient({ isAdmin }: { isAdmin: boolean }) {
  const [activeTab, setActiveTab] = useState<Tab>("batches");

  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
  const activeItem = visibleItems.find((item) => item.id === activeTab) ?? visibleItems[0];

  return (
    <div className="space-y-7">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <h1 className="font-[var(--font-heading)] text-3xl font-bold text-ink">
          Dashboard
        </h1>
        {isAdmin && (
          <span className="rounded-full border border-amber-300/30 bg-amber-300/12 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200">
            ADMIN
          </span>
        )}
      </div>

      {/* Tab navigation */}
      <nav className="admin-glass-strong flex flex-wrap gap-2 rounded-[1.25rem] p-2">
        {visibleItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-sm transition ${
                isActive
                  ? "border border-cyan-300/28 bg-cyan-400/14 font-semibold text-cyan-100 shadow-[0_12px_32px_rgba(45,212,191,0.12)]"
                  : "border border-transparent text-slate-400 hover:border-white/10 hover:bg-white/6 hover:text-slate-100"
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Section header */}
      <div className="flex items-center gap-3">
        <div
          className="h-7 w-1 shrink-0 rounded-full shadow-[0_0_18px_rgba(45,212,191,0.45)]"
          style={{ background: activeItem.accentColor }}
        />
        <div>
          <h2 className="text-lg font-bold text-ink">
            {activeItem.label}
          </h2>
          <p className="theme-muted mt-1 text-sm">
            {activeItem.description}
          </p>
        </div>
      </div>

      {/* Tab content */}
      {activeTab === "batches" && <BatchDashboardClient />}
      {isAdmin && activeTab === "sync" && <AdminSyncControls />}
      {isAdmin && activeTab === "cc" && <CCManagementTab />}
      {isAdmin && activeTab === "leave" && <LeaveCoverageTab />}
      {isAdmin && activeTab === "curriculum" && <CurriculumTab />}
      {isAdmin && activeTab === "tickets"    && <SupportTicketDashboard embedded />}
      {isAdmin && activeTab === "domainResources" && <DomainResourcesTab />}
    </div>
  );
}
