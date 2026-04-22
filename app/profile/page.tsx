export const dynamic = "force-dynamic";

import Link from "next/link";

import { AuthShell } from "@/components/auth-shell";
import { LogoutButton } from "@/components/logout-button";
import { SetupProfileForm } from "@/components/setup-profile-form";
import { getUserBatchConfigs, getUserProfile, requireAuthenticatedUser } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase";

export default async function ProfilePage() {
  const user = await requireAuthenticatedUser();
  const [profile, batchConfigs] = await Promise.all([
    getUserProfile(user.id),
    getUserBatchConfigs(user.id)
  ]);

  const supabase = createServerSupabase();
  const { data: curriculums } = await supabase
    .from("batch_curriculums")
    .select("batch_name")
    .eq("user_id", user.id);

  const curriculumCounts = (curriculums ?? []).reduce<Record<string, number>>((acc, curr) => {
    acc[curr.batch_name] = (acc[curr.batch_name] || 0) + 1;
    return acc;
  }, {});

  return (
    <AuthShell
      title="Manage your LMS profile"
      description="Update your LMS credentials, add more batches, or revise the scoped lecture and assignment URLs whenever your ownership changes."
      footer={
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/"
            className="theme-button-secondary inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition"
          >
            Back to dashboard
          </Link>
          <LogoutButton />
        </div>
      }
    >
      <SetupProfileForm
        initialProfile={{
          email: user.email ?? "",
          lms_username: profile?.lms_username ?? "",
          lms_password: "",
          slack_member_id: profile?.slack_member_id ?? ""
        }}
        initialBatchConfigs={batchConfigs}
        curriculumCounts={curriculumCounts}
      />
    </AuthShell>
  );
}
