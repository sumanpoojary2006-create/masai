export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { hasAdminAccess } from "@/lib/admin-access";
import { createServerSupabase } from "@/lib/supabase";

/** GET — list all Supabase auth users (for Admin CC picker) */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const isAdmin = await hasAdminAccess(user.id);
    if (!isAdmin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const supabase = createServerSupabase();
    const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });

    if (error) throw new Error(error.message);

    const users = (data?.users ?? []).map((u) => ({
      id: u.id,
      email: u.email ?? "",
      full_name: (u.user_metadata?.full_name as string) ?? ""
    }));

    return NextResponse.json({ users });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to fetch users." },
      { status: 500 }
    );
  }
}
