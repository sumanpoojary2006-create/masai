export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

import { EducatorProfileClient } from "@/components/batch/EducatorProfileClient";
import { hasAdminAccess } from "@/lib/admin-access";
import { getCurrentUser } from "@/lib/auth";
import { hasPublicSupabaseConfig, hasSupabaseConfig } from "@/lib/env";

export default async function EducatorProfilePage({
  params,
}: {
  params: { id: string };
}) {
  if (!hasSupabaseConfig() || !hasPublicSupabaseConfig()) {
    redirect("/");
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect("/batch-details/login");
  }

  const isAdmin = await hasAdminAccess(user.id);
  if (!isAdmin) {
    redirect("/batch-details/dashboard");
  }

  return <EducatorProfileClient educatorId={params.id} />;
}
