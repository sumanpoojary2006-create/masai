import { isAdminUser } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase";

export async function hasAdminAccess(userId: string): Promise<boolean> {
  if (isAdminUser(userId)) {
    return true;
  }

  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();

  return data?.role === "admin";
}
