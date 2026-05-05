export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { hasAdminAccess } from "@/lib/admin-access";
import { createServerSupabase } from "@/lib/supabase";

/**
 * GET — Returns a map of batch_name → curriculum row count for all batches
 * that have a global curriculum uploaded (user_id IS NULL).
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const isAdmin = await hasAdminAccess(user.id);
    if (!isAdmin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const supabase = createServerSupabase();

    const { data, error } = await supabase
      .from("batch_curriculums")
      .select("batch_name")
      .is("user_id", null);

    if (error) throw new Error(error.message);

    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      counts[row.batch_name] = (counts[row.batch_name] ?? 0) + 1;
    }

    return NextResponse.json({ counts });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to fetch curriculum counts." },
      { status: 500 }
    );
  }
}
