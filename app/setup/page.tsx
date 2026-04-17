export const dynamic = "force-dynamic";

import { AuthShell } from "@/components/auth-shell";
import { LogoutButton } from "@/components/logout-button";
import { SetupProfileForm } from "@/components/setup-profile-form";
import { getUserBatchConfigs, getUserProfile, requireAuthenticatedUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function SetupPage() {
  const user = await requireAuthenticatedUser();
  const [profile, batchConfigs] = await Promise.all([
    getUserProfile(user.id),
    getUserBatchConfigs(user.id)
  ]);

  if (profile?.onboarding_complete && batchConfigs.length > 0) {
    redirect("/profile");
  }

  return (
    <AuthShell
      title="Finish your LMS setup"
      description="We’re almost there. Add your LMS credentials and all the batch-specific LMS URLs you want this profile to manage."
      footer={<LogoutButton />}
    >
      <SetupProfileForm
        initialProfile={{
          email: user.email ?? "",
          lms_username: profile?.lms_username ?? "",
          lms_password: profile?.lms_password ?? "",
          slack_member_id: profile?.slack_member_id ?? ""
        }}
        initialBatchConfigs={batchConfigs}
      />
    </AuthShell>
  );
}
