/**
 * Diagnostic: find where the Zoom AI meeting summary is stored in the LMS MySQL DB.
 * Run: npx tsx scripts/check-lecture-summary-schema.ts <lms_lecture_id>
 *
 * Example: npx tsx scripts/check-lecture-summary-schema.ts 147185
 */
import mysql from "mysql2/promise";
import { readFileSync } from "fs";

const envFile = readFileSync(".env.local", "utf-8");
for (const line of envFile.split("\n")) {
  const [key, ...rest] = line.split("=");
  if (key?.trim() && rest.length) process.env[key.trim()] = rest.join("=").trim();
}

async function main() {
  const lectureId = parseInt(process.argv[2] ?? "0", 10);

  const conn = await mysql.createConnection({
    host: process.env.LMS_DB_HOST ?? "msi-experience-rdonly.crfg8xlnzwpc.ap-south-1.rds.amazonaws.com",
    user: process.env.LMS_DB_USER ?? "metabase",
    password: process.env.LMS_DB_PASSWORD,
    database: process.env.LMS_DB_NAME ?? "prod_course",
    ssl: { rejectUnauthorized: false },
    dateStrings: true,
  });

  console.log("✅ Connected to LMS DB\n");

  // 1. Show all columns in lectures table
  console.log("=== lectures table columns ===");
  const [cols] = await conn.query("DESCRIBE lectures") as any;
  console.table(cols);

  if (lectureId) {
    // 2. Show every column for this specific lecture
    console.log(`\n=== Full row for lecture id=${lectureId} ===`);
    const [rows] = await conn.query("SELECT * FROM lectures WHERE id = ? LIMIT 1", [lectureId]) as any;
    if (rows.length === 0) {
      console.log("  ⚠️  No lecture found with that id.");
    } else {
      const row = rows[0];
      for (const [key, val] of Object.entries(row)) {
        const display = typeof val === "string" && val.length > 300
          ? val.slice(0, 300) + "…"
          : val;
        console.log(`  ${key}: ${JSON.stringify(display)}`);
      }

      // 3. If there's a 'data' JSON field, expand it
      if (row.data) {
        console.log("\n=== data JSON keys ===");
        try {
          const parsed = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
          console.log("  Keys:", Object.keys(parsed));
          for (const [k, v] of Object.entries(parsed)) {
            const display = typeof v === "string" && v.length > 200 ? v.slice(0, 200) + "…" : v;
            console.log(`  data.${k}:`, JSON.stringify(display));
          }
        } catch {
          console.log("  (could not parse data as JSON)");
        }
      }
    }
  }

  // 4. Check if any summary-like tables exist
  console.log("\n=== Tables matching *summary* or *meeting* or *zoom* ===");
  const [tables] = await conn.query(
    `SHOW TABLES WHERE Tables_in_${process.env.LMS_DB_NAME ?? "prod_course"} REGEXP 'summary|meeting|zoom|transcript'`
  ) as any;
  if (tables.length === 0) console.log("  (none found)");
  else console.table(tables);

  conn.destroy();
}

main().catch(console.error);
