import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { hasPublicSupabaseConfig, hasSupabaseConfig } from "@/lib/env";
import { BatchDetailClient } from "@/components/batch/BatchDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function BatchDetailsBatchPage({ params }: Props) {
  if (!hasSupabaseConfig() || !hasPublicSupabaseConfig()) {
    redirect("/");
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect("/batch-details/login");
  }

  const { id } = await params;

  return (
    <main className="grid gap-6">
      <BatchDetailClient id={id} />
    </main>
  );
}
