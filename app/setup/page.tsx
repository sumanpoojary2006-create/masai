export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import { LogoutButton } from "@/components/logout-button";
import { SetupProfileForm } from "@/components/setup-profile-form";
import { getCurrentUser, getUserProfile } from "@/lib/auth";

export default async function SetupPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const profile = await getUserProfile(user.id);
  if (profile?.onboarding_complete) redirect("/");

  return (
    <AuthShell
      title="Welcome to MasaiLens"
      description="Set up your profile to get started. Your Admin will assign batches to you."
      footer={<LogoutButton />}
    >
      <SetupProfileForm
        initialDisplayName={profile?.lms_username ?? ""}
        initialSlackMemberId={profile?.slack_member_id ?? ""}
      />
    </AuthShell>
  );
}
