export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { hasAdminAccess } from "@/lib/admin-access";
import { createServerSupabase } from "@/lib/supabase";

/** GET — batches in lms_batch_cache that have no CC assigned */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const isAdmin = await hasAdminAccess(user.id);
    if (!isAdmin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const supabase = createServerSupabase();

    // Fetch all cached batches
    const { data: allBatches, error: batchErr } = await supabase
      .from("lms_batch_cache")
      .select("batch_id, name, program, starting, ending")
      .order("name");

    if (batchErr) throw new Error(batchErr.message);

    // Fetch assigned batch_ids
    const { data: assigned, error: assignErr } = await supabase
      .from("cc_batch_assignments")
      .select("batch_id");

    if (assignErr) throw new Error(assignErr.message);

    const assignedIds = new Set((assigned ?? []).map((r) => r.batch_id));
    const unassigned = (allBatches ?? []).filter((b) => !assignedIds.has(b.batch_id));

    return NextResponse.json({ batches: unassigned });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to fetch batches." },
      { status: 500 }
    );
  }
}
