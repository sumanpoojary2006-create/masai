import { redirect } from "next/navigation";

import { createServerSupabase } from "@/lib/supabase";
import { createAuthSupabase } from "@/lib/supabase-server";
import { UserProfileRecord } from "@/lib/types";

export async function getCurrentUser() {
  const supabase = await createAuthSupabase();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error) {
    return null;
  }

  return user;
}

export async function getUserProfile(userId: string) {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("user_profiles")
    .select(
      "user_id, email, lms_username, lms_password, batch_name, lecture_batch_url, assignment_batch_url, onboarding_complete"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as UserProfileRecord | null) ?? null;
}

export async function requireAuthenticatedUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireOnboardedUser() {
  const user = await requireAuthenticatedUser();
  const profile = await getUserProfile(user.id);

  if (!profile?.onboarding_complete) {
    redirect("/setup");
  }

  return {
    user,
    profile
  };
}

export async function redirectAuthenticatedUser() {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const profile = await getUserProfile(user.id);

  if (!profile?.onboarding_complete) {
    redirect("/setup");
  }

  redirect("/");
}
