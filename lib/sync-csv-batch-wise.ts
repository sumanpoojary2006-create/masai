import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";

const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1fOOgTzMuUrbp49_bcGT9fByt1t5_H1GLhWXP9U9Endw/export?format=csv&gid=1572740319";

function nullIfEmpty(v: string | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  if (!t || t === "NA" || t === "N/A" || t === "Discontinued") return null;
  return t;
}

function parseDate(v: string | undefined): string | null {
  const s = nullIfEmpty(v);
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function mapStatus(v: string | undefined): string | null {
  const s = nullIfEmpty(v);
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower.includes("completed") || lower.includes("last leg")) return "completed/last-leg";
  if (lower.includes("in order")) return "in-order";
  if (lower.includes("about to start")) return "about-to-start";
  return null;
}

function parseGradingPolicy(notes: string | undefined): Array<{ component: string; weightage: number | null }> | null {
  if (!notes) return null;
  const lines = notes.split("\n").map((l) => l.trim()).filter(Boolean);
  const results: Array<{ component: string; weightage: number | null }> = [];
  for (const line of lines) {
    const m = line.match(/^(.+?)[–\-:]+\s*(\d+(?:\.\d+)?)\s*%/);
    if (m) {
      results.push({ component: m[1].trim(), weightage: parseFloat(m[2]) });
    } else {
      results.push({ component: line, weightage: null });
    }
  }
  return results.length > 0 ? results : null;
}

export interface SyncResult {
  updated: number;
  inserted: number;
  skipped: number;
  errors: string[];
}

export async function syncCsvToBatchWise(): Promise<SyncResult> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_KEY!
  );

  // Fetch sheet as CSV
  const res = await fetch(SHEET_CSV_URL);
  if (!res.ok) throw new Error(`Failed to fetch sheet: ${res.status} ${res.statusText}`);
  const csvContent = await res.text();

  const records: Record<string, string>[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: false,
    relax_quotes: true,
    trim: false,
  });

  // Load existing batches
  const { data: existingBatches, error: fetchErr } = await supabase
    .from("batches")
    .select("id, batch_name");
  if (fetchErr) throw new Error(fetchErr.message);

  const batchNameToId: Record<string, string> = {};
  for (const b of existingBatches ?? []) {
    if (b.batch_name) batchNameToId[b.batch_name] = b.id;
  }

  // Group rows by batch_name (same batch can appear multiple times with different instructors)
  const grouped: Record<string, Record<string, string>[]> = {};
  let skipped = 0;
  for (const row of records) {
    const batchName = nullIfEmpty(row["Batch Name"]);
    if (!batchName) { skipped++; continue; }
    if (!grouped[batchName]) grouped[batchName] = [];
    grouped[batchName].push(row);
  }

  let updated = 0;
  let inserted = 0;
  const errors: string[] = [];

  for (const [batchName, rows] of Object.entries(grouped)) {
    const primary = rows[0];

    const coordinator = nullIfEmpty(primary["Curriculum coordinator"]);
    const instructor1 = nullIfEmpty(primary["Instructor 1 ( IIT / IIM Professor )"]);
    const instructor2 = nullIfEmpty(primary["Instructor 2 ( Industry Mentor )"]);
    const instructor3 = nullIfEmpty(primary["Instructor 3 ( Industry Mentor )"]);

    const taSet = new Set<string>();
    for (const row of rows) {
      for (let i = 1; i <= 9; i++) {
        const ta = nullIfEmpty(row[`Teaching Assistant ${i}`]);
        if (ta) taSet.add(ta);
      }
    }

    const teamMembers = {
      ...(coordinator ? { curriculum_coordinator: coordinator } : {}),
      ...(instructor1 ? { instructor_1: instructor1 } : {}),
      ...(instructor2 ? { instructor_2: instructor2 } : {}),
      ...(instructor3 ? { instructor_3: instructor3 } : {}),
      ...(taSet.size > 0 ? { teaching_assistants: Array.from(taSet) } : {}),
    };

    const modelRaw = nullIfEmpty(primary["Model"]);
    const modelNum = modelRaw ? parseInt(modelRaw) : null;

    const websiteLink =
      nullIfEmpty(primary["Curriculum Overview or Website Link"]) ||
      nullIfEmpty(primary["Detailed Curriculum Link"]) ||
      null;

    const gradingPolicy = parseGradingPolicy(primary["Additional Notes"]);

    const updates: Record<string, unknown> = {
      ...(modelNum !== null ? { model_number: modelNum } : {}),
      ...(nullIfEmpty(primary["Program Name"]) ? { program_name: nullIfEmpty(primary["Program Name"]) } : {}),
      ...(parseDate(primary["Batch Start Date"]) ? { start_date: parseDate(primary["Batch Start Date"]) } : {}),
      ...(parseDate(primary["Batch End Date"]) ? { end_date_scheduled: parseDate(primary["Batch End Date"]) } : {}),
      ...(mapStatus(primary["Batch Status"]) ? { status: mapStatus(primary["Batch Status"]) } : {}),
      ...(nullIfEmpty(primary["Domain"]) ? { domain: nullIfEmpty(primary["Domain"]) } : {}),
      ...(websiteLink ? { website_link: websiteLink } : {}),
      ...(Object.keys(teamMembers).length > 0 ? { team_members: teamMembers } : {}),
      ...(gradingPolicy ? { grading_policy: gradingPolicy } : {}),
    };

    const existingId = batchNameToId[batchName];

    if (existingId) {
      const { error } = await supabase.from("batches").update(updates).eq("id", existingId);
      if (error) errors.push(`Update ${batchName}: ${error.message}`);
      else updated++;
    } else {
      const { error } = await supabase.from("batches").insert({ batch_name: batchName, ...updates });
      if (error) errors.push(`Insert ${batchName}: ${error.message}`);
      else inserted++;
    }
  }

  return { updated, inserted, skipped, errors };
}
