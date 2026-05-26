import { NextRequest, NextResponse } from "next/server";
import {
  fetchOverview,
  fetchBatchWoW,
  fetchBatchMoM,
  fetchBatchLeaderboard,
  fetchCCLeaderboard,
  fetchProgramWoW,
  fetchProgramMoM,
  fetchTATByBatch,
  fetchTATByCC,
  fetchIntelligence,
  fetchDistinctBatches,
} from "@/lib/support-tickets-mysql";
import { createServerSupabase } from "@/lib/supabase";

type DomainMap = Record<string, string>;

async function getDomainMap(): Promise<DomainMap> {
  const supabase = createServerSupabase();
  const { data } = await supabase.from("ticket_domain_config").select("batch_name, domain");
  const map: DomainMap = {};
  for (const row of data ?? []) map[row.batch_name] = row.domain;
  return map;
}

function applyDomain<T extends { batchName: string | null }>(
  rows: T[],
  domainMap: DomainMap
): (T & { domain: string })[] {
  return rows.map((r) => ({
    ...r,
    domain: r.batchName ? (domainMap[r.batchName] ?? "Unassigned") : "Unassigned",
  }));
}

export async function GET(req: NextRequest) {
  const tab = req.nextUrl.searchParams.get("tab");

  try {
    switch (tab) {
      case "overview":
        return NextResponse.json(await fetchOverview());

      case "batch-wow":
        return NextResponse.json(await fetchBatchWoW());

      case "batch-mom":
        return NextResponse.json(await fetchBatchMoM());

      case "batch-leaderboard":
        return NextResponse.json(await fetchBatchLeaderboard());

      case "cc-leaderboard":
        return NextResponse.json(await fetchCCLeaderboard());

      case "domain-wow": {
        const [rows, domainMap] = await Promise.all([fetchProgramWoW(), getDomainMap()]);
        return NextResponse.json(applyDomain(rows, domainMap));
      }

      case "domain-mom": {
        const [rows, domainMap] = await Promise.all([fetchProgramMoM(), getDomainMap()]);
        return NextResponse.json(applyDomain(rows, domainMap));
      }

      case "tat": {
        const [byBatch, byCC, domainMap] = await Promise.all([
          fetchTATByBatch(),
          fetchTATByCC(),
          getDomainMap(),
        ]);
        return NextResponse.json({
          byBatch: applyDomain(byBatch, domainMap),
          byCC,
        });
      }

      case "intelligence":
        return NextResponse.json(await fetchIntelligence());

      case "batches":
        return NextResponse.json(await fetchDistinctBatches());

      default:
        return NextResponse.json({ error: "Unknown tab" }, { status: 400 });
    }
  } catch (err) {
    console.error("[support-tickets/tab] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
