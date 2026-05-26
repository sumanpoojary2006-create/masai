import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

export async function GET() {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("ticket_domain_config")
    .select("id, program, domain, updated_at")
    .order("program", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { mappings } = body as { mappings: { program: string; domain: string }[] };
  if (!Array.isArray(mappings)) {
    return NextResponse.json({ error: "mappings must be an array" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { error } = await supabase.from("ticket_domain_config").upsert(
    mappings.map((m) => ({ program: m.program, domain: m.domain })),
    { onConflict: "program" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
