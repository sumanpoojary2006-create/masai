/**
 * Sync LMS MySQL → Supabase Batch Wise
 * Extracts all batches + their live sessions from the LMS DB
 * and upserts them into the Supabase batches + sessions tables.
 *
 * Run: npx tsx scripts/sync-lms-to-batch-wise.ts
 */
import mysql, { RowDataPacket } from "mysql2/promise";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

// ── Load .env.local ───────────────────────────────────────────────────────────
const envFile = readFileSync(".env.local", "utf-8");
for (const line of envFile.split("\n")) {
  const idx = line.indexOf("=");
  if (idx > 0) {
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key) process.env[key] = val;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function hhmmToTimeStr(val: number | null): string | null {
  if (val == null) return null;
  const h = Math.floor(val / 100).toString().padStart(2, "0");
  const m = (val % 100).toString().padStart(2, "0");
  return `${h}:${m}:00`;
}

function deriveDay(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[new Date(dateStr).getDay()];
}

function parseModelNumber(model: string | null): number | null {
  if (!model) return null;
  const match = model.match(/(\d+)/);
  return match ? parseInt(match[1]) : null;
}

function deriveStatus(active: number, starting: string | null, ending: string | null): string | null {
  const now = new Date();
  const start = starting ? new Date(starting) : null;
  const end = ending ? new Date(ending) : null;
  if (start && start > now) return "about-to-start";
  if (end && end < now) return "completed/last-leg";
  if (active) return "in-order";
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // MySQL connection
  const mysqlConn = await mysql.createConnection({
    host: process.env.LMS_DB_HOST,
    user: process.env.LMS_DB_USER,
    password: process.env.LMS_DB_PASSWORD,
    database: process.env.LMS_DB_NAME,
    ssl: { rejectUnauthorized: false },
    dateStrings: true,
  });
  console.log("✅ Connected to LMS MySQL DB");

  // Supabase client (using secret key to bypass RLS)
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_KEY!
  );
  console.log("✅ Connected to Supabase\n");

  // ── Step 1: Fetch all batches ───────────────────────────────────────────────
  console.log("📦 Fetching all batches from LMS...");
  const [lmsBatches] = await mysqlConn.query<RowDataPacket[]>(
    `SELECT id, name, \`starting\`, \`ending\`, program, partners, language,
            program_domain, model, active, duration
     FROM batches
     WHERE deleted_at IS NULL
     ORDER BY \`starting\` DESC`
  );
  console.log(`   Found ${lmsBatches.length} batches`);

  // ── Step 2: Upsert batches into Supabase ───────────────────────────────────
  console.log("⬆️  Upserting batches into Supabase...");

  const batchRows = lmsBatches.map((b: any) => ({
    batch_name:          b.name,
    program_name:        b.program || null,
    institute_name:      b.partners || null,
    start_date:          b.starting || null,
    end_date_scheduled:  b.ending || null,
    language:            b.language || null,
    domain:              b.program_domain || null,
    model_number:        parseModelNumber(b.model),
    status:              deriveStatus(b.active, b.starting, b.ending),
  }));

  // Check which batch_names already exist to avoid duplicates
  const { data: existingBatches } = await supabase.from("batches").select("batch_name");
  const existingNames = new Set((existingBatches ?? []).map((b: any) => b.batch_name));
  const newBatchRows = batchRows.filter(b => b.batch_name && !existingNames.has(b.batch_name));
  console.log(`   ${existingNames.size} already exist, inserting ${newBatchRows.length} new batches`);

  let batchUpserted = 0;
  for (let i = 0; i < newBatchRows.length; i += 100) {
    const chunk = newBatchRows.slice(i, i + 100);
    const { error } = await supabase.from("batches").insert(chunk);
    if (error) {
      console.error(`\n   ❌ Batch insert error (chunk ${i}):`, error.message);
    } else {
      batchUpserted += chunk.length;
      process.stdout.write(`\r   ✅ ${batchUpserted}/${newBatchRows.length} batches inserted`);
    }
  }
  console.log();

  // ── Step 3: Build batch_name → supabase_id map ─────────────────────────────
  console.log("\n🗺️  Loading Supabase batch IDs...");
  const { data: supabaseBatches, error: fetchErr } = await supabase
    .from("batches")
    .select("id, batch_name");
  if (fetchErr) throw new Error(fetchErr.message);

  const batchNameToId: Record<string, string> = {};
  for (const b of supabaseBatches ?? []) {
    if (b.batch_name) batchNameToId[b.batch_name] = b.id;
  }

  // Also build LMS batch id → batch_name map
  const lmsBatchIdToName: Record<number, string> = {};
  for (const b of lmsBatches as any[]) {
    lmsBatchIdToName[b.id] = b.name;
  }

  // ── Step 4: Fetch all live sessions from LMS ───────────────────────────────
  console.log("📅 Fetching all live sessions from LMS...");
  const [lmsSessions] = await mysqlConn.query<RowDataPacket[]>(
    `SELECT
       l.id,
       l.title,
       l.category,
       l.start_date,
       l.start_time,
       l.end_time,
       l.zoom_link,
       l.module,
       l.batch_id
     FROM lectures l
     WHERE l.type = 'live'
       AND l.deleted_at IS NULL
       AND l.category IN (
         'academic-lecture','industry-mentor-lecture',
         'Academic Session','main - faculty','main-faculty',
         'main - im','main-im','foundation - im','foundation - faculty'
       )
     ORDER BY l.batch_id, l.start_date ASC`
  );
  console.log(`   Found ${lmsSessions.length} live sessions`);

  // ── Step 5: Upsert sessions into Supabase ──────────────────────────────────
  console.log("⬆️  Upserting sessions into Supabase...");

  const sessionRows: any[] = [];
  let skipped = 0;

  for (const s of lmsSessions as any[]) {
    const batchName = lmsBatchIdToName[s.batch_id];
    const batchId = batchName ? batchNameToId[batchName] : null;
    if (!batchId) { skipped++; continue; }

    sessionRows.push({
      batch_id:           batchId,
      date:               s.start_date || null,
      day:                deriveDay(s.start_date),
      start_time:         hhmmToTimeStr(s.start_time),
      end_time:           hhmmToTimeStr(s.end_time),
      session_title:      s.title || null,
      module_name:        s.module || null,
      zoom_link:          s.zoom_link || null,
      to_be_taken_by:     mapCategory(s.category),
    });
  }

  if (skipped > 0) console.log(`   ⚠️  Skipped ${skipped} sessions (batch not found in Supabase)`);

  // Upsert sessions in chunks of 200
  let sessUpserted = 0;
  for (let i = 0; i < sessionRows.length; i += 200) {
    const chunk = sessionRows.slice(i, i + 200);
    const { error } = await supabase.from("sessions").insert(chunk);
    if (error) {
      // Ignore duplicate errors, log others
      if (!error.message.includes("duplicate") && !error.message.includes("unique")) {
        console.error(`\n   ❌ Session insert error (chunk ${i}):`, error.message);
      }
    } else {
      sessUpserted += chunk.length;
    }
    process.stdout.write(`\r   ✅ ${Math.min(i + 200, sessionRows.length)}/${sessionRows.length} sessions processed`);
  }
  console.log(`\n   Inserted: ${sessUpserted} sessions`);

  mysqlConn.destroy();
  console.log("\n🎉 Sync complete!");
}

function mapCategory(cat: string | null): string | null {
  if (!cat) return null;
  const c = cat.toLowerCase();
  if (c.includes("faculty") || c.includes("academic")) return "professor";
  if (c.includes("im") || c.includes("industry")) return "industry-mentor";
  return null;
}

main().catch(e => {
  console.error("❌ Fatal:", e);
  process.exit(1);
});
