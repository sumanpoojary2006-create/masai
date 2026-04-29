export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase";

/** GET — return all batches assigned to the logged-in CC */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("cc_batch_assignments")
      .select("batch_id, batch_name, batch_program, created_at")
      .eq("cc_user_id", user.id)
      .order("batch_name");

    if (error) throw new Error(error.message);

    return NextResponse.json({ batches: data ?? [] });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to fetch batches." },
      { status: 500 }
    );
  }
}
