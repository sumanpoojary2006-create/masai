import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { hasPublicSupabaseConfig, hasSupabaseConfig } from "@/lib/env";
import { createAuthSupabase } from "@/lib/supabase-server";
import { AdminSyncControls } from "@/components/batch/AdminSyncControls";
import { UserRolesManager } from "@/components/batch/UserRolesManager";

export default async function BatchDetailsAdminPage() {
  if (!hasSupabaseConfig() || !hasPublicSupabaseConfig()) {
    redirect("/");
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect("/batch-details/login");
  }

  const supabase = await createAuthSupabase();
  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (roleData?.role !== "admin") {
    redirect("/batch-details/dashboard");
  }

  return (
    <div className="grid gap-6">
      {/* Admin Controls */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            marginBottom: '20px',
          }}
        >
          <div>
            <h2 style={{ color: '#f1f5f9', fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>
              Admin Controls
            </h2>
            <p style={{ color: '#64748b', fontSize: '13px' }}>
              Manually trigger syncs and compliance checks across all users.
            </p>
          </div>
          <a
            href="/batch-details/dashboard"
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              color: '#94a3b8',
              borderRadius: '9999px',
              padding: '6px 16px',
              fontSize: '13px',
              fontWeight: 500,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            ← Dashboard
          </a>
        </div>
        <AdminSyncControls />
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid #1f2937' }} />

      {/* User Access Management */}
      <div>
        <div style={{ marginBottom: '20px' }}>
          <h2 style={{ color: '#f1f5f9', fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>
            User Access Management
          </h2>
          <p style={{ color: '#64748b', fontSize: '13px' }}>
            Manage roles for all Batch Wise users. Changes take effect immediately.
          </p>
        </div>
        <UserRolesManager />
      </div>
    </div>
  );
}
