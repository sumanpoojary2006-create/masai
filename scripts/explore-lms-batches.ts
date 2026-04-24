/**
 * Explore LMS MySQL DB — print batch table structure and sample data.
 * Run: npx tsx scripts/explore-lms-batches.ts
 */
import mysql from "mysql2/promise";
// Load env from .env.local manually
import { readFileSync } from "fs";
const envFile = readFileSync(".env.local", "utf-8");
for (const line of envFile.split("\n")) {
  const [key, ...rest] = line.split("=");
  if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
}

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.LMS_DB_HOST,
    user: process.env.LMS_DB_USER,
    password: process.env.LMS_DB_PASSWORD,
    database: process.env.LMS_DB_NAME,
    ssl: { rejectUnauthorized: false },
    dateStrings: true,
  });

  console.log("✅ Connected to LMS DB\n");

  // Describe batches table
  console.log("=== batches table columns ===");
  const [cols] = await conn.query("DESCRIBE batches");
  console.table(cols);

  // Sample batches
  console.log("\n=== Sample batches (20) ===");
  const [batches] = await conn.query("SELECT * FROM batches LIMIT 20");
  console.table(batches);

  // Total count
  const [count] = await conn.query("SELECT COUNT(*) as total FROM batches") as any;
  console.log(`\nTotal batches: ${count[0].total}`);

  conn.destroy();
}

main().catch(console.error);
