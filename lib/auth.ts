import { redirect } from "next/navigation";

import { getScopedLmsUrl } from "@/lib/lms-batch-urls";
import { decryptLmsPassword } from "@/lib/lms-password";
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

export async function getUserProfile(userId: string, options?: { includePassword?: boolean }) {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("user_profiles")
    .select("user_id, email, lms_username, lms_password, onboarding_complete, slack_member_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const profile = (data as UserProfileRecord | null) ?? null;
  if (!profile) return null;

  return {
    ...profile,
    lms_password:
      options?.includePassword && profile.lms_password
        ? decryptLmsPassword(profile.lms_password)
        : ""
  };
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

  const savedConfigs = (data ?? []) as UserBatchConfigRecord[];

  if (savedConfigs.length > 0) {
    return savedConfigs;
  }

  const { data: assignedBatches, error: assignmentError } = await supabase
    .from("cc_batch_assignments")
    .select("batch_name")
    .eq("cc_user_id", userId)
    .order("batch_name", { ascending: true });

  if (assignmentError) {
    throw new Error(assignmentError.message);
  }

  if (assignedBatches?.length) {
    return assignedBatches.map((assignment) => ({
      user_id: userId,
      batch_name: assignment.batch_name,
      lecture_batch_url: getScopedLmsUrl("lectures", assignment.batch_name) ?? "",
      assignment_batch_url: getScopedLmsUrl("assignments", assignment.batch_name) ?? ""
    }));
  }

  const [profileResult, lectureBatchesResult] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("batch_name, lecture_batch_url, assignment_batch_url")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("lectures").select("batch_name").eq("user_id", userId)
  ]);

  if (profileResult.error) {
    throw new Error(profileResult.error.message);
  }

  if (lectureBatchesResult.error) {
    throw new Error(lectureBatchesResult.error.message);
  }

  const profile = profileResult.data;
  const lectureBatches = [
    ...new Set((lectureBatchesResult.data ?? []).map((lecture) => lecture.batch_name))
  ];

  const recoveredConfigs = lectureBatches
    .map((batchName) => {
      const isPrimaryBatch = batchName === profile?.batch_name;
      const lectureBatchUrl =
        isPrimaryBatch
          ? profile?.lecture_batch_url ?? null
          : getScopedLmsUrl("lectures", batchName);
      const assignmentBatchUrl =
        isPrimaryBatch
          ? profile?.assignment_batch_url ?? null
          : getScopedLmsUrl("assignments", batchName);

      if (!lectureBatchUrl || !assignmentBatchUrl) {
        return null;
      }

      return {
        user_id: userId,
        batch_name: batchName,
        lecture_batch_url: lectureBatchUrl,
        assignment_batch_url: assignmentBatchUrl
      };
    })
    .filter((config): config is Required<Omit<UserBatchConfigRecord, "id">> => Boolean(config));

  if (recoveredConfigs.length === 0) {
    return [];
  }

  const { data: insertedConfigs, error: upsertError } = await supabase
    .from("user_batch_configs")
    .upsert(recoveredConfigs, {
      onConflict: "user_id,batch_name"
    })
    .select("id, user_id, batch_name, lecture_batch_url, assignment_batch_url")
    .order("batch_name", { ascending: true });

  if (upsertError) {
    throw new Error(upsertError.message);
  }

  return (insertedConfigs ?? []) as UserBatchConfigRecord[];
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
