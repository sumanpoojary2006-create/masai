/**
 * Sync Google Sheet educator data → Supabase batches table
 * Run: npx tsx scripts/sync-csv-to-batch-wise.ts
 */
import { readFileSync } from "fs";
import { syncCsvToBatchWise } from "../lib/sync-csv-batch-wise";

// Load .env.local
const envFile = readFileSync(".env.local", "utf-8");
for (const line of envFile.split("\n")) {
  const idx = line.indexOf("=");
  if (idx > 0) {
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key) process.env[key] = val;
  }
}

async function main() {
  console.log("🔄 Syncing Google Sheet → Supabase batches...\n");
  const result = await syncCsvToBatchWise();
  console.log("📊 Summary:");
  console.log(`   Updated:  ${result.updated}`);
  console.log(`   Inserted: ${result.inserted}`);
  console.log(`   Skipped:  ${result.skipped}`);
  if (result.errors.length > 0) {
    console.log(`\n❌ Errors (${result.errors.length}):`);
    result.errors.forEach((e) => console.log(`   - ${e}`));
  }
  console.log("\n🎉 Sync complete!");
}

main().catch((e) => {
  console.error("❌ Fatal:", e);
  process.exit(1);
});
