export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

import { InstructorCalendarClient } from "@/components/batch/InstructorCalendarClient";
import { hasAdminAccess } from "@/lib/admin-access";
import { getCurrentUser } from "@/lib/auth";
import { hasPublicSupabaseConfig, hasSupabaseConfig } from "@/lib/env";

export default async function BatchDetailsInstructorCalendarPage() {
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

  return <InstructorCalendarClient />;
}
