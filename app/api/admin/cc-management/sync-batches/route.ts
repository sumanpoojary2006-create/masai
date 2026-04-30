export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { nowIST } from "@/lib/env";

import { getCurrentUser } from "@/lib/auth";
import { hasAdminAccess } from "@/lib/admin-access";
import { fetchActiveBatches } from "@/lib/lms-mysql";
import { createServerSupabase } from "@/lib/supabase";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const isAdmin = await hasAdminAccess(user.id);
    if (!isAdmin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const batches = await fetchActiveBatches();

    if (batches.length === 0) {
      return NextResponse.json({ message: "No active batches found in LMS.", synced: 0 });
    }

    const supabase = createServerSupabase();
    const { error } = await supabase.from("lms_batch_cache").upsert(
      batches.map((b) => ({
        batch_id: b.batch_id,
        name: b.name,
        program: b.program,
        starting: b.starting,
        ending: b.ending,
        active: Boolean(b.active),
        synced_at: nowIST()
      })),
      { onConflict: "batch_id" }
    );

    if (error) throw new Error(error.message);

    return NextResponse.json({
      message: `Synced ${batches.length} batches into cache.`,
      synced: batches.length
    });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Sync failed." },
      { status: 500 }
    );
  }
}
