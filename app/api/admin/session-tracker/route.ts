export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";

const LECTURE_URL    = "https://experience-admin.masaischool.com/lectures/detail/?id=";
const ASSIGNMENT_URL = "https://experience-admin.masaischool.com/assignment/detail/?id=";

async function getConnection() {
  return mysql.createConnection({
    host:     process.env.LMS_DB_HOST!,
    user:     process.env.LMS_DB_USER!,
    password: process.env.LMS_DB_PASSWORD!,
    database: process.env.LMS_DB_NAME ?? "prod_course",
  });
}

export async function GET(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.SESSION_TRACKER_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conn = await getConnection();

  try {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(`
      SELECT
        b.name                                  AS batch_name,
        live.title                              AS session_name,
        DATE_FORMAT(live.schedule, '%Y-%m-%d')  AS scheduled_date,
        live.id                                 AS live_id,
        pr.id                                   AS pre_read_id,
        ln.id                                   AS notes_id,
        ao.id                                   AS assign_obj_id,
        asub.id                                 AS assign_subj_id,
        COUNT(DISTINCT a.user_id)               AS students_attended,
        ROUND(AVG(lf.rating), 2)                AS avg_rating

      FROM lectures live
      JOIN batches b ON live.batch_id = b.id

      -- Pre-reads: linked via data->associatedLecture.id (plain object)
      LEFT JOIN lectures pr
        ON  pr.batch_id   = live.batch_id
        AND pr.category   = 'pre-reads'
        AND pr.deleted_at IS NULL
        AND JSON_UNQUOTE(JSON_EXTRACT(pr.data, '$.associatedLecture.id')) = CAST(live.id AS CHAR)

      -- Lecture notes: same pattern
      LEFT JOIN lectures ln
        ON  ln.batch_id   = live.batch_id
        AND ln.category   = 'notes'
        AND ln.deleted_at IS NULL
        AND JSON_UNQUOTE(JSON_EXTRACT(ln.data, '$.associatedLecture.id')) = CAST(live.id AS CHAR)

      -- Objective assignments
      LEFT JOIN assignments ao
        ON  ao.batch_id   = live.batch_id
        AND (
          ao.category = 'objective'
          OR (ao.category = 'practice-assignment' AND ao.title LIKE '%Objective%')
        )
        AND ao.deleted_at IS NULL
        AND JSON_UNQUOTE(JSON_EXTRACT(ao.data, '$.associatedLecture[0].id')) = CAST(live.id AS CHAR)

      -- Subjective assignments
      LEFT JOIN assignments asub
        ON  asub.batch_id  = live.batch_id
        AND (
          asub.category = 'subjective'
          OR (asub.category = 'practice-assignment' AND asub.title LIKE '%Subjective%')
        )
        AND asub.deleted_at IS NULL
        AND JSON_UNQUOTE(JSON_EXTRACT(asub.data, '$.associatedLecture[0].id')) = CAST(live.id AS CHAR)

      -- Attendance: status=1 means present
      LEFT JOIN attendances a
        ON  a.lecture_id = live.id
        AND a.status     = 1

      -- Ratings
      LEFT JOIN lecture_feedback lf
        ON  lf.lecture_id = live.id

      WHERE live.category   = 'Academic Session'
        AND live.deleted_at IS NULL
        AND b.deleted_at    IS NULL
        AND b.active        = 1

      GROUP BY
        b.name, live.title, live.schedule, live.id,
        pr.id, ln.id, ao.id, asub.id

      ORDER BY b.name, live.schedule
    `);

    const sessions = rows.map((r) => [
      r.batch_name        ?? "",
      r.session_name      ?? "",
      r.scheduled_date    ?? "",
      r.live_id        ? LECTURE_URL    + r.live_id        : "",
      r.pre_read_id    ? LECTURE_URL    + r.pre_read_id    : "",
      r.notes_id       ? LECTURE_URL    + r.notes_id       : "",
      r.assign_obj_id  ? ASSIGNMENT_URL + r.assign_obj_id  : "",
      r.assign_subj_id ? ASSIGNMENT_URL + r.assign_subj_id : "",
      r.students_attended ?? 0,
      r.avg_rating        ?? "",
    ]);

    return NextResponse.json({ sessions, count: sessions.length });

  } finally {
    await conn.end();
  }
}
