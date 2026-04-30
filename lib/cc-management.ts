import { nowIST } from "@/lib/env";
import { createServerSupabase } from "@/lib/supabase";

type RawManagedAssignment = {
  id: string;
  batch_id: number;
  batch_name: string;
  batch_program: string | null;
  created_at: string;
  updated_at: string;
  cc_user_id: string;
};

export type CcAssignmentView = {
  id: string;
  batch_id: number | null;
  batch_name: string;
  batch_program: string | null;
  cc_user_id: string;
  cc_email: string;
  cc_name: string;
  created_at: string;
  source: "managed" | "legacy";
};

function normalizeBatchName(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function formatCoordinatorName(email: string | null | undefined) {
  if (!email) {
    return "";
  }

  const localPart = email.split("@")[0] ?? email;
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function buildUserDirectory(userIds: string[]) {
  const supabase = createServerSupabase();
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const directory = new Map<string, { email: string; full_name: string }>();

  if (uniqueIds.length === 0) {
    return directory;
  }

  const [{ data: profiles, error: profileError }, usersResult] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("user_id, email")
      .in("user_id", uniqueIds),
    supabase.auth.admin.listUsers({ perPage: 1000 })
  ]);

  if (profileError) {
    throw new Error(profileError.message);
  }

  for (const profile of profiles ?? []) {
    directory.set(profile.user_id, {
      email: profile.email ?? "",
      full_name: formatCoordinatorName(profile.email ?? "")
    });
  }

  if (!usersResult.error && usersResult.data?.users) {
    for (const user of usersResult.data.users) {
      if (!uniqueIds.includes(user.id)) {
        continue;
      }

      const email = user.email ?? directory.get(user.id)?.email ?? "";
      directory.set(user.id, {
        email,
        full_name:
          (user.user_metadata?.full_name as string | undefined) ??
          directory.get(user.id)?.full_name ??
          formatCoordinatorName(email)
      });
    }
  }

  return directory;
}

async function enrichAssignments(
  rows: Array<
    Pick<RawManagedAssignment, "id" | "batch_id" | "batch_name" | "batch_program" | "created_at" | "cc_user_id"> & {
      source: "managed" | "legacy";
    }
  >
): Promise<CcAssignmentView[]> {
  const userDirectory = await buildUserDirectory(rows.map((row) => row.cc_user_id));

  return rows.map((row) => {
    const user = userDirectory.get(row.cc_user_id);
    const email = user?.email ?? "";
    return {
      ...row,
      cc_email: email,
      cc_name: user?.full_name ?? formatCoordinatorName(email),
      batch_id: row.batch_id ?? null,
      batch_program: row.batch_program ?? null,
      created_at: row.created_at,
      source: row.source
    };
  });
}

export async function backfillCcAssignmentsFromLegacy() {
  const supabase = createServerSupabase();

  const { count, error: countError } = await supabase
    .from("cc_batch_assignments")
    .select("id", { count: "exact", head: true });

  if (countError) {
    throw new Error(countError.message);
  }

  if ((count ?? 0) > 0) {
    return;
  }

  const [{ data: legacyConfigs, error: legacyError }, { data: cachedBatches, error: cacheError }] =
    await Promise.all([
      supabase
        .from("user_batch_configs")
        .select("user_id, batch_name")
        .order("batch_name", { ascending: true }),
      supabase
        .from("lms_batch_cache")
        .select("batch_id, name, program")
    ]);

  if (legacyError) {
    throw new Error(legacyError.message);
  }

  if (cacheError) {
    throw new Error(cacheError.message);
  }

  const cacheByName = new Map(
    (cachedBatches ?? []).map((batch) => [normalizeBatchName(batch.name), batch])
  );

  const rowsToInsert = (legacyConfigs ?? [])
    .map((config) => {
      const matchedBatch = cacheByName.get(normalizeBatchName(config.batch_name));
      if (!matchedBatch) {
        return null;
      }

      return {
        cc_user_id: config.user_id,
        batch_id: matchedBatch.batch_id,
        batch_name: matchedBatch.name,
        batch_program: matchedBatch.program ?? null,
        created_at: nowIST(),
        updated_at: nowIST()
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (rowsToInsert.length === 0) {
    return;
  }

  const { error: upsertError } = await supabase
    .from("cc_batch_assignments")
    .upsert(rowsToInsert, { onConflict: "batch_id" });

  if (upsertError) {
    throw new Error(upsertError.message);
  }
}

export async function listCcAssignments(): Promise<CcAssignmentView[]> {
  const supabase = createServerSupabase();

  await backfillCcAssignmentsFromLegacy();

  const { data: managedRows, error: managedError } = await supabase
    .from("cc_batch_assignments")
    .select("id, batch_id, batch_name, batch_program, created_at, updated_at, cc_user_id")
    .order("batch_name");

  if (managedError) {
    throw new Error(managedError.message);
  }

  if ((managedRows ?? []).length > 0) {
    return enrichAssignments(
      (managedRows ?? []).map((row) => ({
        ...row,
        source: "managed" as const
      }))
    );
  }

  const [{ data: legacyConfigs, error: legacyError }, { data: cachedBatches, error: cacheError }] =
    await Promise.all([
      supabase
        .from("user_batch_configs")
        .select("user_id, batch_name")
        .order("batch_name", { ascending: true }),
      supabase
        .from("lms_batch_cache")
        .select("batch_id, name, program")
    ]);

  if (legacyError) {
    throw new Error(legacyError.message);
  }

  if (cacheError) {
    throw new Error(cacheError.message);
  }

  const cacheByName = new Map(
    (cachedBatches ?? []).map((batch) => [normalizeBatchName(batch.name), batch])
  );

  return enrichAssignments(
    (legacyConfigs ?? []).map((config, index) => {
      const matchedBatch = cacheByName.get(normalizeBatchName(config.batch_name));
      return {
        id: `legacy:${config.user_id}:${config.batch_name}:${index}`,
        batch_id: matchedBatch?.batch_id ?? null,
        batch_name: config.batch_name,
        batch_program: matchedBatch?.program ?? null,
        cc_user_id: config.user_id,
        created_at: new Date(0).toISOString(),
        source: "legacy" as const
      };
    })
  );
}
