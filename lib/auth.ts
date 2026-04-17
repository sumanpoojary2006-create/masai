import { redirect } from "next/navigation";

import { createServerSupabase } from "@/lib/supabase";
import { createAuthSupabase } from "@/lib/supabase-server";
import { UserBatchConfigRecord, UserProfileRecord } from "@/lib/types";

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
    .select("user_id, email, lms_username, lms_password, onboarding_complete, slack_member_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as UserProfileRecord | null) ?? null;
}

export async function getUserBatchConfigs(userId: string) {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("user_batch_configs")
    .select("id, user_id, batch_name, lecture_batch_url, assignment_batch_url")
    .eq("user_id", userId)
    .order("batch_name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as UserBatchConfigRecord[];
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
  const [profile, batchConfigs] = await Promise.all([
    getUserProfile(user.id),
    getUserBatchConfigs(user.id)
  ]);

  if (!profile?.onboarding_complete || batchConfigs.length === 0) {
    redirect("/setup");
  }

  return {
    user,
    profile,
    batchConfigs
  };
}

export async function redirectAuthenticatedUser() {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const [profile, batchConfigs] = await Promise.all([
    getUserProfile(user.id),
    getUserBatchConfigs(user.id)
  ]);

  if (!profile?.onboarding_complete || batchConfigs.length === 0) {
    redirect("/setup");
  }

  redirect("/");
}
