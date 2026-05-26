import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export async function GET() {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("ticket_domain_config")
    .select("id, batch_name, domain, updated_at")
    .order("batch_name", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { mappings } = body as { mappings: { batch_name: string; domain: string }[] };
  if (!Array.isArray(mappings)) {
    return NextResponse.json({ error: "mappings must be an array" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { error } = await supabase.from("ticket_domain_config").upsert(
    mappings.map((m) => ({ batch_name: m.batch_name, domain: m.domain })),
    { onConflict: "batch_name" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
