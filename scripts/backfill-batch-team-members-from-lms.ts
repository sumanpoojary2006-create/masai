import mysql from "mysql2/promise";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

import type { TeamMembers } from "../lib/batch-types";

const envFile = readFileSync(".env.local", "utf-8");
for (const line of envFile.split("\n")) {
  const idx = line.indexOf("=");
  if (idx > 0) {
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key) process.env[key] = val;
  }
}

type SupportEntry = {
  role?: string | null;
  users?: number[] | null;
};

type LmsBatch = {
  name: string;
  settings: {
    curriculumnSupport?: SupportEntry[];
  } | null;
};

function roleEquals(role: string | null | undefined, expected: string) {
  return String(role ?? "").trim().toLowerCase() === expected;
}

function uniqueNames(names: Array<string | null | undefined>) {
  return [...new Set(names.map((name) => name?.trim()).filter(Boolean))] as string[];
}

async function main() {
  const mysqlConn = await mysql.createConnection({
    host: process.env.LMS_DB_HOST,
    user: process.env.LMS_DB_USER,
    password: process.env.LMS_DB_PASSWORD,
    database: process.env.LMS_DB_NAME,
    ssl: { rejectUnauthorized: false },
    dateStrings: true
  });

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

  const [lmsBatches] = await mysqlConn.query(
    "SELECT name, settings FROM batches WHERE deleted_at IS NULL ORDER BY name ASC"
  );

  const supportUserIds = new Set<number>();
  for (const batch of lmsBatches as LmsBatch[]) {
    const supportEntries = batch.settings?.curriculumnSupport ?? [];
    for (const entry of supportEntries) {
      for (const userId of entry.users ?? []) {
        supportUserIds.add(Number(userId));
      }
    }
  }

  const userIdToName = new Map<number, string>();
  const allUserIds = [...supportUserIds];

  for (let index = 0; index < allUserIds.length; index += 500) {
    const chunk = allUserIds.slice(index, index + 500);
    if (chunk.length === 0) continue;

    const placeholders = chunk.map(() => "?").join(",");
    const [userRows] = await mysqlConn.query(
      `SELECT id, name FROM users WHERE id IN (${placeholders})`,
      chunk
    );

    for (const user of userRows as Array<{ id: number; name: string }>) {
      userIdToName.set(Number(user.id), String(user.name ?? "").trim());
    }
  }

  const { data: existingBatches, error: fetchError } = await supabase
    .from("batches")
    .select("id, batch_name, team_members");

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  const existingByBatchName = new Map(
    (existingBatches ?? [])
      .filter((batch) => batch.batch_name)
      .map((batch) => [batch.batch_name as string, batch])
  );

  let updatedCount = 0;

  for (const batch of lmsBatches as LmsBatch[]) {
    const existing = existingByBatchName.get(batch.name);
    if (!existing) continue;

    const supportEntries = batch.settings?.curriculumnSupport ?? [];
    const professorIds =
      supportEntries.find((entry) => roleEquals(entry.role, "professor"))?.users ?? [];
    const mentorIds =
      supportEntries.find((entry) => roleEquals(entry.role, "industry mentor"))?.users ?? [];
    const coordinatorIds =
      supportEntries.find((entry) => roleEquals(entry.role, "curriculum coordinator"))?.users ?? [];

    const professorNames = uniqueNames(professorIds.map((id) => userIdToName.get(Number(id))));
    const mentorNames = uniqueNames(mentorIds.map((id) => userIdToName.get(Number(id))));
    const coordinatorNames = uniqueNames(
      coordinatorIds.map((id) => userIdToName.get(Number(id)))
    );

    const currentTeamMembers = (existing.team_members ?? {}) as TeamMembers;

    const nextTeamMembers: TeamMembers = {
      ...currentTeamMembers,
      ...(professorNames[0] ? { instructor_1: professorNames[0] } : {}),
      ...(mentorNames[0] ? { instructor_2: mentorNames[0] } : {}),
      ...(mentorNames[1] ? { instructor_3: mentorNames[1] } : {}),
      ...(coordinatorNames[0]
        ? { curriculum_coordinator: coordinatorNames[0] }
        : {})
    };

    const before = JSON.stringify(currentTeamMembers ?? {});
    const after = JSON.stringify(nextTeamMembers);

    if (before === after) {
      continue;
    }

    const { error: updateError } = await supabase
      .from("batches")
      .update({ team_members: nextTeamMembers })
      .eq("id", existing.id);

    if (updateError) {
      throw new Error(`Failed to update ${batch.name}: ${updateError.message}`);
    }

    updatedCount += 1;
    console.log(
      `Updated ${batch.name}: professor=${professorNames.join(", ") || "—"} mentor=${mentorNames.join(", ") || "—"}`
    );
  }

  mysqlConn.destroy();
  console.log(`Done. Updated ${updatedCount} batches.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
