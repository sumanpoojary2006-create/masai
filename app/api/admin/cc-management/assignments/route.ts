export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { nowIST } from "@/lib/env";

import { getCurrentUser } from "@/lib/auth";
import { nowIST } from "@/lib/env";
import { hasAdminAccess } from "@/lib/admin-access";
import { nowIST } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase";
import { nowIST } from "@/lib/env";

/** GET — list all CC→batch assignments */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const isAdmin = await hasAdminAccess(user.id);
    if (!isAdmin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("cc_batch_assignments")
      .select("id, batch_id, batch_name, batch_program, created_at, updated_at, cc_user_id")
      .order("batch_name");

    if (error) throw new Error(error.message);

    // Enrich with user emails from auth.users via admin API
    const userIds = [...new Set((data ?? []).map((r) => r.cc_user_id))];
    let emailMap: Record<string, { email: string; full_name: string }> = {};

    if (userIds.length > 0) {
      const { data: users, error: usersError } = await supabase.auth.admin.listUsers();
      if (!usersError && users) {
        for (const u of users.users) {
          emailMap[u.id] = {
            email: u.email ?? "",
            full_name: (u.user_metadata?.full_name as string) ?? ""
          };
        }
      }
    }

    const enriched = (data ?? []).map((row) => ({
      ...row,
      cc_email: emailMap[row.cc_user_id]?.email ?? "",
      cc_name: emailMap[row.cc_user_id]?.full_name ?? ""
    }));

    return NextResponse.json({ assignments: enriched });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to fetch assignments." },
      { status: 500 }
    );
  }
}

/** POST — assign a CC to a batch */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const isAdmin = await hasAdminAccess(user.id);
    if (!isAdmin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const body = (await request.json()) as {
      cc_user_id?: string;
      batch_id?: number;
      batch_name?: string;
      batch_program?: string;
    };

    if (!body.cc_user_id || !body.batch_id || !body.batch_name) {
      return NextResponse.json(
        { message: "cc_user_id, batch_id, and batch_name are required." },
        { status: 400 }
      );
    }

    const supabase = createServerSupabase();
    const { error } = await supabase.from("cc_batch_assignments").upsert(
      {
        cc_user_id: body.cc_user_id,
        batch_id: body.batch_id,
        batch_name: body.batch_name,
        batch_program: body.batch_program ?? null,
        assigned_by: user.id,
        updated_at: nowIST()
      },
      { onConflict: "batch_id" }
    );

    if (error) throw new Error(error.message);

    return NextResponse.json({ message: `Assigned batch "${body.batch_name}" to CC.` });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Assignment failed." },
      { status: 500 }
    );
  }
}

/** DELETE — remove a CC→batch assignment by batch_id */
export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const isAdmin = await hasAdminAccess(user.id);
    if (!isAdmin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { batchId } = (await request.json()) as { batchId?: number };
    if (!batchId) {
      return NextResponse.json({ message: "batchId is required." }, { status: 400 });
    }

    const supabase = createServerSupabase();
    const { error } = await supabase
      .from("cc_batch_assignments")
      .delete()
      .eq("batch_id", batchId);

    if (error) throw new Error(error.message);

    return NextResponse.json({ message: `Assignment for batch ${batchId} removed.` });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Delete failed." },
      { status: 500 }
    );
  }
}
