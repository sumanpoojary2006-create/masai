export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect, notFound } from "next/navigation";

import { LogoutButton } from "@/components/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LectureComplianceTable } from "@/components/cc/LectureComplianceTable";
import { getCurrentUser } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase";
import { hasAdminAccess } from "@/lib/admin-access";

export default async function CCBatchPage({
  params
}: {
  params: Promise<{ batchId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const isAdmin = await hasAdminAccess(user.id);
  if (isAdmin) redirect("/admin/dashboard");

  const { batchId: batchIdStr } = await params;
  const batchId = parseInt(batchIdStr, 10);
  if (Number.isNaN(batchId)) notFound();

  // Verify this batch is assigned to the CC
  const supabase = createServerSupabase();
  const { data: assignment } = await supabase
    .from("cc_batch_assignments")
    .select("batch_name, batch_program")
    .eq("cc_user_id", user.id)
    .eq("batch_id", batchId)
    .maybeSingle();

  if (!assignment) notFound();

  return (
    <div className="min-h-screen bg-[#080d1a]">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/8 bg-[#080d1a]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/cc/dashboard"
              className="text-xs text-slate-400 hover:text-white"
            >
              ← Dashboard
            </Link>
            <span className="text-slate-600">/</span>
            <h1 className="text-sm font-bold text-white">{assignment.batch_name}</h1>
            {assignment.batch_program && (
              <span className="rounded-full bg-indigo-500/15 px-2 py-0.5 text-xs text-indigo-300">
                {assignment.batch_program}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-white">Lecture Compliance</h2>
          <p className="mt-1 text-sm text-slate-400">
            Pre-read, Notes, and Assignment upload status for each live lecture.
          </p>
        </div>
        <LectureComplianceTable batchId={batchId} />
      </main>
    </div>
  );
}
