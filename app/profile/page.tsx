export const dynamic = "force-dynamic";

import Link from "next/link";

import { AuthShell } from "@/components/auth-shell";
import { LogoutButton } from "@/components/logout-button";
import { SetupProfileForm } from "@/components/setup-profile-form";
import { getUserBatchConfigs, getUserProfile, requireAuthenticatedUser } from "@/lib/auth";

export default async function ProfilePage() {
  const user = await requireAuthenticatedUser();
  const [profile, batchConfigs] = await Promise.all([
    getUserProfile(user.id),
    getUserBatchConfigs(user.id)
  ]);

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
          lms_password: profile?.lms_password ?? ""
        }}
        initialBatchConfigs={batchConfigs}
      />
    </AuthShell>
  );
}
