export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const preferredRegion = "ap-south-1"; // same region as RDS — eliminates cross-region latency

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
    // Run 7 simple fast queries and join in memory
    // Much faster than one mega-JOIN with JSON_EXTRACT conditions

    // 1. All Academic Session lectures across active batches
    const [lectures] = await conn.execute<mysql.RowDataPacket[]>(`
      SELECT live.id, b.name AS batch_name, live.title, DATE_FORMAT(live.schedule, '%Y-%m-%d') AS scheduled_date
      FROM lectures live
      JOIN batches b ON live.batch_id = b.id
      WHERE live.category   = 'Academic Session'
        AND live.deleted_at IS NULL
        AND b.deleted_at    IS NULL
        AND b.active        = 1
      ORDER BY b.name, live.schedule
    `);

    // 2. Pre-reads — all at once, keyed by associatedLecture.id
    const [prereads] = await conn.execute<mysql.RowDataPacket[]>(`
      SELECT id, JSON_UNQUOTE(JSON_EXTRACT(data, '$.associatedLecture.id')) AS lecture_id
      FROM lectures
      WHERE category   = 'pre-reads'
        AND deleted_at IS NULL
        AND JSON_EXTRACT(data, '$.associatedLecture.id') IS NOT NULL
    `);

    // 3. Lecture notes
    const [notes] = await conn.execute<mysql.RowDataPacket[]>(`
      SELECT id, JSON_UNQUOTE(JSON_EXTRACT(data, '$.associatedLecture.id')) AS lecture_id
      FROM lectures
      WHERE category   = 'notes'
        AND deleted_at IS NULL
        AND JSON_EXTRACT(data, '$.associatedLecture.id') IS NOT NULL
    `);

    // 4. Objective assignments
    const [objAssignments] = await conn.execute<mysql.RowDataPacket[]>(`
      SELECT id, JSON_UNQUOTE(JSON_EXTRACT(data, '$.associatedLecture[0].id')) AS lecture_id
      FROM assignments
      WHERE (category = 'objective' OR (category = 'practice-assignment' AND title LIKE '%Objective%'))
        AND deleted_at IS NULL
        AND JSON_EXTRACT(data, '$.associatedLecture[0].id') IS NOT NULL
    `);

    // 5. Subjective assignments
    const [subjAssignments] = await conn.execute<mysql.RowDataPacket[]>(`
      SELECT id, JSON_UNQUOTE(JSON_EXTRACT(data, '$.associatedLecture[0].id')) AS lecture_id
      FROM assignments
      WHERE (category = 'subjective' OR (category = 'practice-assignment' AND title LIKE '%Subjective%'))
        AND deleted_at IS NULL
        AND JSON_EXTRACT(data, '$.associatedLecture[0].id') IS NOT NULL
    `);

    // 6. Attendance count per lecture (status=1 means present)
    const [attendance] = await conn.execute<mysql.RowDataPacket[]>(`
      SELECT lecture_id, COUNT(DISTINCT user_id) AS student_count
      FROM attendances
      WHERE status = 1
      GROUP BY lecture_id
    `);

    // 7. Average rating per lecture
    const [ratings] = await conn.execute<mysql.RowDataPacket[]>(`
      SELECT lecture_id, ROUND(AVG(rating), 2) AS avg_rating
      FROM lecture_feedback
      GROUP BY lecture_id
    `);

    // Build lookup maps
    const prereadMap   = new Map(prereads.map((r)       => [String(r.lecture_id), r.id]));
    const notesMap     = new Map(notes.map((r)           => [String(r.lecture_id), r.id]));
    const objMap       = new Map(objAssignments.map((r)  => [String(r.lecture_id), r.id]));
    const subjMap      = new Map(subjAssignments.map((r) => [String(r.lecture_id), r.id]));
    const attendMap    = new Map(attendance.map((r)      => [String(r.lecture_id), r.student_count]));
    const ratingMap    = new Map(ratings.map((r)         => [String(r.lecture_id), r.avg_rating]));

    // Assemble final rows
    const sessions = lectures.map((l) => {
      const lid       = String(l.id);
      const preId     = prereadMap.get(lid);
      const notesId   = notesMap.get(lid);
      const objId     = objMap.get(lid);
      const subjId    = subjMap.get(lid);

      return [
        l.batch_name     ?? "",
        l.title          ?? "",
        l.scheduled_date ?? "",
        LECTURE_URL    + l.id,
        preId   ? LECTURE_URL    + preId   : "",
        notesId ? LECTURE_URL    + notesId : "",
        objId   ? ASSIGNMENT_URL + objId   : "",
        subjId  ? ASSIGNMENT_URL + subjId  : "",
        attendMap.get(lid) ?? 0,
        ratingMap.get(lid) ?? "",
      ];
    });

    return NextResponse.json({ sessions, count: sessions.length });

  } finally {
    await conn.end();
  }
}
