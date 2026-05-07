import mysql from "mysql2/promise";

function getLmsDbConfig() {
  const host = process.env.LMS_DB_HOST;
  const user = process.env.LMS_DB_USER;
  const password = process.env.LMS_DB_PASSWORD;
  const database = process.env.LMS_DB_NAME ?? "prod_course";

  if (!host || !user || !password) {
    throw new Error(
      "LMS MySQL credentials are not configured. Set LMS_DB_HOST, LMS_DB_USER, LMS_DB_PASSWORD in environment variables."
    );
  }

  return { host, user, password, database };
}

async function withConnection<T>(fn: (conn: mysql.Connection) => Promise<T>): Promise<T> {
  const conn = await mysql.createConnection(getLmsDbConfig());
  try {
    return await fn(conn);
  } finally {
    await conn.end();
  }
}

export type LmsBatch = {
  batch_id: number;
  name: string;
  program: string | null;
  starting: string | null;
  ending: string | null;
  active: boolean;
};

export type LmsLectureCompliance = {
  lecture_id: number;
  lecture_title: string;
  module: string | null;
  section_id: number | null;
  schedule: Date | null;
  concludes: Date | null;
  preread_uploaded: boolean;
  notes_uploaded: boolean;
  assignment_uploaded: boolean;
  preread_uploaded_at: string | null;
  notes_uploaded_at: string | null;
  assignment_uploaded_at: string | null;
};

/** Query 2.8 — all active batches for lms_batch_cache sync */
export async function fetchActiveBatches(): Promise<LmsBatch[]> {
  return withConnection(async (conn) => {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(`
      SELECT
        id         AS batch_id,
        name,
        program,
        \`starting\` AS starting,
        ending,
        active
      FROM batches
      WHERE deleted_at IS NULL
        AND active = 1
      ORDER BY id DESC
    `);
    return rows as LmsBatch[];
  });
}

/** Query 2.7 — full compliance view for a single batch */
export async function fetchBatchCompliance(batchId: number): Promise<LmsLectureCompliance[]> {
  return withConnection(async (conn) => {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(
      `
      SELECT
        l.id AS lecture_id,
        l.title AS lecture_title,
        l.module,
        l.section_id,
        l.schedule,
        l.concludes,

        (
          SELECT MIN(pr.created_at) FROM lectures pr
          WHERE pr.category IN ('pre-reads', 'Pre Reads')
            AND (
              JSON_EXTRACT(pr.data, '$.associatedLecture.id') = l.id
              OR JSON_OVERLAPS(COALESCE(JSON_EXTRACT(pr.data, '$.associatedLecture[*].id'), '[]'), JSON_ARRAY(l.id))
            )
            AND pr.deleted_at IS NULL
        ) AS preread_uploaded_at,

        (
          SELECT MIN(nt.created_at) FROM lectures nt
          WHERE nt.category  = 'notes'
            AND (
              JSON_EXTRACT(nt.data, '$.associatedLecture.id') = l.id
              OR JSON_OVERLAPS(COALESCE(JSON_EXTRACT(nt.data, '$.associatedLecture[*].id'), '[]'), JSON_ARRAY(l.id))
            )
            AND nt.deleted_at IS NULL
        ) AS notes_uploaded_at,

        (
          SELECT MIN(a.created_at) FROM assignments a
          WHERE a.batch_id   = l.batch_id
            AND (
              JSON_EXTRACT(a.data, '$.associatedLecture[0].id') = l.id
              OR JSON_OVERLAPS(COALESCE(JSON_EXTRACT(a.data, '$.associatedLecture[*].id'), '[]'), JSON_ARRAY(l.id))
            )
            AND a.deleted_at IS NULL
        ) AS assignment_uploaded_at

      FROM lectures l
      WHERE
        l.batch_id = ?
        AND l.type = 'live'
        AND l.deleted_at IS NULL
      ORDER BY l.schedule ASC
      `,
      [batchId]
    );

    return (rows as mysql.RowDataPacket[]).map((r) => {
      const prereadeAt = r.preread_uploaded_at instanceof Date
        ? r.preread_uploaded_at.toISOString().replace("T", " ").replace(/\.\d+Z$/, "")
        : (r.preread_uploaded_at ?? null);
      const notesAt = r.notes_uploaded_at instanceof Date
        ? r.notes_uploaded_at.toISOString().replace("T", " ").replace(/\.\d+Z$/, "")
        : (r.notes_uploaded_at ?? null);
      const assignAt = r.assignment_uploaded_at instanceof Date
        ? r.assignment_uploaded_at.toISOString().replace("T", " ").replace(/\.\d+Z$/, "")
        : (r.assignment_uploaded_at ?? null);
      return {
        lecture_id: r.lecture_id,
        lecture_title: r.lecture_title,
        module: r.module ?? null,
        section_id: r.section_id ?? null,
        schedule: r.schedule ?? null,
        concludes: r.concludes ?? null,
        preread_uploaded: prereadeAt !== null,
        notes_uploaded: notesAt !== null,
        assignment_uploaded: assignAt !== null,
        preread_uploaded_at: prereadeAt,
        notes_uploaded_at: notesAt,
        assignment_uploaded_at: assignAt,
      };
    });
  });
}
