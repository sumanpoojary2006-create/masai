export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { DateTime } from "luxon";

import { getCurrentUser } from "@/lib/auth";
import { hasAdminAccess } from "@/lib/admin-access";
import { createServerSupabase } from "@/lib/supabase";
import { getAppTimezone } from "@/lib/env";

/** GET ?date=YYYY-MM-DD — list coverage assignments for a date (defaults today) */
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const isAdmin = await hasAdminAccess(user.id);
    if (!isAdmin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const date =
      searchParams.get("date") ??
      DateTime.now().setZone(getAppTimezone()).toISODate();

    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("cc_leave_coverage")
      .select("id, on_leave_cc_id, covering_cc_id, coverage_date, assigned_by, created_at")
      .eq("coverage_date", date)
      .order("created_at");

    if (error) throw new Error(error.message);

    // Enrich with names from auth.users
    const allUserIds = [
      ...new Set(
        (data ?? []).flatMap((r) => [r.on_leave_cc_id, r.covering_cc_id, r.assigned_by])
      ),
    ];

    let nameMap: Record<string, { email: string; full_name: string }> = {};
    if (allUserIds.length > 0) {
      const { data: users } = await supabase.auth.admin.listUsers();
      for (const u of users?.users ?? []) {
        nameMap[u.id] = {
          email: u.email ?? "",
          full_name: (u.user_metadata?.full_name as string) ?? "",
        };
      }
    }

    const enriched = (data ?? []).map((r) => ({
      ...r,
      on_leave_name: nameMap[r.on_leave_cc_id]?.full_name || nameMap[r.on_leave_cc_id]?.email || r.on_leave_cc_id,
      on_leave_email: nameMap[r.on_leave_cc_id]?.email ?? "",
      covering_name: nameMap[r.covering_cc_id]?.full_name || nameMap[r.covering_cc_id]?.email || r.covering_cc_id,
      covering_email: nameMap[r.covering_cc_id]?.email ?? "",
      assigned_by_name: nameMap[r.assigned_by]?.full_name || nameMap[r.assigned_by]?.email || r.assigned_by,
    }));

    return NextResponse.json({ coverages: enriched, date });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to fetch coverages." },
      { status: 500 }
    );
  }
}

/** POST — assign a covering CC for an on-leave CC on a given date */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const isAdmin = await hasAdminAccess(user.id);
    if (!isAdmin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const body = (await request.json()) as {
      on_leave_cc_id?: string;
      covering_cc_id?: string;
      coverage_date?: string;
    };

    if (!body.on_leave_cc_id || !body.covering_cc_id || !body.coverage_date) {
      return NextResponse.json(
        { message: "on_leave_cc_id, covering_cc_id, and coverage_date are required." },
        { status: 400 }
      );
    }

    if (body.on_leave_cc_id === body.covering_cc_id) {
      return NextResponse.json(
        { message: "A CC cannot cover for themselves." },
        { status: 400 }
      );
    }

    const supabase = createServerSupabase();
    const { error } = await supabase.from("cc_leave_coverage").upsert(
      {
        on_leave_cc_id: body.on_leave_cc_id,
        covering_cc_id: body.covering_cc_id,
        coverage_date: body.coverage_date,
        assigned_by: user.id,
      },
      { onConflict: "on_leave_cc_id,coverage_date" }
    );

    if (error) throw new Error(error.message);

    return NextResponse.json({ message: "Coverage assigned successfully." });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to assign coverage." },
      { status: 500 }
    );
  }
}

/** DELETE — remove a coverage assignment by id */
export async function DELETE(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const isAdmin = await hasAdminAccess(user.id);
    if (!isAdmin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { id } = (await request.json()) as { id?: string };
    if (!id) {
      return NextResponse.json({ message: "id is required." }, { status: 400 });
    }

    const supabase = createServerSupabase();
    const { error } = await supabase.from("cc_leave_coverage").delete().eq("id", id);

    if (error) throw new Error(error.message);

    return NextResponse.json({ message: "Coverage removed." });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to remove coverage." },
      { status: 500 }
    );
  }
}
