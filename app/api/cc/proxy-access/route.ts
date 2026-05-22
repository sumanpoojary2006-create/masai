export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { DateTime } from "luxon";

import { getCurrentUser } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase";
import { getAppTimezone } from "@/lib/env";

export type ProxyCoordinator = {
  user_id: string;
  email: string;
  name: string;
  authorized: boolean;
};

/**
 * GET — returns all configured CCs with an `authorized` flag indicating whether
 * the current user has been assigned by an admin to cover that CC today.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const supabase = createServerSupabase();
    const today = DateTime.now().setZone(getAppTimezone()).toISODate()!;

    // All distinct CCs who have at least one batch assignment
    const { data: assignments, error: assignErr } = await supabase
      .from("cc_batch_assignments")
      .select("cc_user_id");

    if (assignErr) throw new Error(assignErr.message);

    const allCcIds = [...new Set((assignments ?? []).map((a) => a.cc_user_id as string))];

    // Which CCs is the current user authorized to cover today?
    const { data: coverages, error: coverErr } = await supabase
      .from("cc_leave_coverage")
      .select("on_leave_cc_id")
      .eq("covering_cc_id", user.id)
      .eq("coverage_date", today);

    if (coverErr) throw new Error(coverErr.message);

    const authorizedIds = new Set((coverages ?? []).map((c) => c.on_leave_cc_id as string));

    // Enrich with names from auth.users
    const { data: users } = await supabase.auth.admin.listUsers();
    const nameMap: Record<string, { email: string; full_name: string }> = {};
    for (const u of users?.users ?? []) {
      nameMap[u.id] = {
        email: u.email ?? "",
        full_name: (u.user_metadata?.full_name as string) ?? "",
      };
    }

    const coordinators: ProxyCoordinator[] = allCcIds
      .filter((id) => id !== user.id) // exclude self
      .map((id) => ({
        user_id: id,
        email: nameMap[id]?.email ?? "",
        name: nameMap[id]?.full_name || nameMap[id]?.email || id,
        authorized: authorizedIds.has(id),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ coordinators });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to fetch proxy access." },
      { status: 500 }
    );
  }
}
