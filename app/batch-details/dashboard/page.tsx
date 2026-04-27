export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

import { AdminSyncControls } from "@/components/batch/AdminSyncControls";
import { BatchDashboardClient } from "@/components/batch/BatchDashboardClient";
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
        <section
          style={{
            background: "#111827",
            border: "1px solid #1f2937",
            borderRadius: "16px",
            padding: "24px",
          }}
        >
          <div style={{ marginBottom: "18px" }}>
            <h2 style={{ color: "#f8fafc", fontSize: "20px", fontWeight: 700, marginBottom: "6px" }}>
              Admin Sync Controls
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "14px", lineHeight: "1.6" }}>
              Keep the lecture and compliance sync actions here without the full MasaiLens dashboard.
            </p>
          </div>
          <AdminSyncControls />
        </section>
      ) : null}
      <BatchDashboardClient />
    </main>
  );
}
