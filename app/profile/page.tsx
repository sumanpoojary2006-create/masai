export const dynamic = "force-dynamic";

import Link from "next/link";

import { AuthShell } from "@/components/auth-shell";
import { LogoutButton } from "@/components/logout-button";
import { SetupProfileForm } from "@/components/setup-profile-form";
import { getUserProfile, requireAuthenticatedUser } from "@/lib/auth";

export default async function ProfilePage() {
  const user = await requireAuthenticatedUser();
  const profile = await getUserProfile(user.id);

  return (
    <AuthShell
      title="Your Profile"
      description="Update your display name and Slack member ID."
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
        initialDisplayName={profile?.lms_username ?? ""}
        initialSlackMemberId={profile?.slack_member_id ?? ""}
      />
    </AuthShell>
  );
}
