export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

import { CCManagementTab } from "@/components/admin/CCManagementTab";
import { hasAdminAccess } from "@/lib/admin-access";
import { getCurrentUser } from "@/lib/auth";
import { hasPublicSupabaseConfig, hasSupabaseConfig } from "@/lib/env";

export default async function CCMappingPage() {
  if (!hasSupabaseConfig() || !hasPublicSupabaseConfig()) {
    redirect("/");
  }

  const user = await getCurrentUser();
  if (!user) redirect("/batch-details/login");

  const isAdmin = await hasAdminAccess(user.id);
  if (!isAdmin) redirect("/batch-details/dashboard");

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">CC Batch Mapping</h1>
        <p className="mt-1 text-sm text-slate-400">
          Assign batches to Course Coordinators and sync lecture compliance data.
        </p>
      </div>
      <CCManagementTab />
    </main>
  );
}
