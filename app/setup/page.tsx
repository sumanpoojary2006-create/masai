export const dynamic = "force-dynamic";

import { AuthShell } from "@/components/auth-shell";
import { LogoutButton } from "@/components/logout-button";
import { SetupProfileForm } from "@/components/setup-profile-form";
import { requireAuthenticatedUser, getUserProfile } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function SetupPage() {
  const user = await requireAuthenticatedUser();
  const profile = await getUserProfile(user.id);

  if (profile?.onboarding_complete) {
    redirect("/");
  }

  return (
    <AuthShell
      title="Finish your LMS setup"
      description="We’re almost there. Add your LMS credentials, batch name, and the scoped LMS URLs for that batch so your profile can run the same compliance process independently."
      footer={<LogoutButton />}
    >
      <SetupProfileForm
        initialProfile={{
          email: user.email ?? "",
          lms_username: profile?.lms_username ?? "",
          lms_password: profile?.lms_password ?? "",
          batch_name: profile?.batch_name ?? "",
          lecture_batch_url: profile?.lecture_batch_url ?? "",
          assignment_batch_url: profile?.assignment_batch_url ?? ""
        }}
      />
    </AuthShell>
  );
}
