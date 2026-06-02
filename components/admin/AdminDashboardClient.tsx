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
    <div>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#f8fafc", margin: 0 }}>
          Dashboard
        </h1>
        {isAdmin && (
          <span
            style={{
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.1em",
              color: "#f59e0b",
              background: "rgba(245,158,11,0.12)",
              border: "1px solid rgba(245,158,11,0.25)",
              borderRadius: "9999px",
              padding: "2px 10px",
            }}
          >
            ADMIN
          </span>
        )}
      </div>

      {/* Tab navigation */}
      <nav
        style={{
          display: "flex",
          gap: "3px",
          padding: "5px",
          background: "#080e1a",
          border: "1px solid #1a2235",
          borderRadius: "14px",
          marginBottom: "28px",
          flexWrap: "wrap",
        }}
      >
        {visibleItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "7px",
                padding: "8px 16px",
                borderRadius: "10px",
                border: "none",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: isActive ? 600 : 400,
                transition: "all 0.15s",
                background: isActive ? `${item.accentColor}20` : "transparent",
                color: isActive ? item.accentColor : "#4b5a6e",
                outline: isActive ? `1px solid ${item.accentColor}35` : "none",
              }}
            >
              <span style={{ fontSize: "15px", lineHeight: 1 }}>{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "22px" }}>
        <div
          style={{
            width: "3px",
            height: "22px",
            borderRadius: "9999px",
            background: activeItem.accentColor,
            flexShrink: 0,
          }}
        />
        <div>
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#f1f5f9", margin: 0 }}>
            {activeItem.label}
          </h2>
          <p style={{ color: "#4b5a6e", fontSize: "12px", margin: "2px 0 0" }}>
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
