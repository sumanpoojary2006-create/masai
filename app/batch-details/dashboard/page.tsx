export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

import { AdminSyncControls } from "@/components/batch/AdminSyncControls";
import { BatchDashboardClient } from "@/components/batch/BatchDashboardClient";
import { CCManagementTab } from "@/components/admin/CCManagementTab";
import { hasAdminAccess } from "@/lib/admin-access";
import { getCurrentUser } from "@/lib/auth";
import { hasPublicSupabaseConfig, hasSupabaseConfig } from "@/lib/env";

export default async function BatchDetailsDashboardPage() {
  if (!hasSupabaseConfig() || !hasPublicSupabaseConfig()) {
    redirect("/");
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect("/batch-details/login");
  }

  const isAdmin = await hasAdminAccess(user.id);

  return (
    <main className="grid gap-6">
      {isAdmin ? (
        <>
          <section style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "16px", padding: "24px" }}>
            <h2 style={{ color: "#f8fafc", fontSize: "20px", fontWeight: 700, marginBottom: "6px" }}>Admin Sync Controls</h2>
            <p style={{ color: "#94a3b8", fontSize: "14px", lineHeight: "1.6", marginBottom: "18px" }}>Pull latest sessions from LMS and run compliance checks.</p>
            <AdminSyncControls />
          </section>

          <section style={{ background: "#111827", border: "1px solid #1f2937", borderRadius: "16px", padding: "24px" }}>
            <h2 style={{ color: "#f8fafc", fontSize: "20px", fontWeight: 700, marginBottom: "6px" }}>CC Management</h2>
            <p style={{ color: "#94a3b8", fontSize: "14px", lineHeight: "1.6", marginBottom: "18px" }}>Assign batches to Course Coordinators and sync lecture data.</p>
            <CCManagementTab />
          </section>
        </>
      ) : null}
      <BatchDashboardClient />
    </main>
  );
}
