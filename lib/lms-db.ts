/**
 * Direct read-only connection to the Masai LMS MySQL replica.
 * Used for syncing live sessions without Playwright or GraphQL.
 */
import mysql, { RowDataPacket } from "mysql2/promise";

export interface LmsDbLecture {
  id: number;
  title: string;
  category: string;
  /** UTC datetime stored by MySQL */
  schedule: Date;
  concludes: Date | null;
  /** Integer HHMM, e.g. 2000 = 20:00, 2130 = 21:30 */
  start_time: number;
  end_time: number;
  zoom_link: string | null;
  module: string | null;
  batch_name: string;
}

/**
 * Categories that map to IM / Faculty sessions we want to track.
 * The LMS has inconsistent casing and separators — cover all variants.
 */
export const TRACKED_LMS_CATEGORIES = [
  "academic-lecture",
  "industry-mentor-lecture",
  "Academic Session",
  "main - faculty",
  "main-faculty",
  "main - im",
  "main-im",
  "foundation - im",
  "foundation - faculty",
];

let _conn: mysql.Connection | null = null;

async function getConn(): Promise<mysql.Connection> {
  if (_conn) {
    try {
      await _conn.ping();
      return _conn;
    } catch {
      _conn = null;
    }
  }

  _conn = await mysql.createConnection({
    host: process.env.LMS_DB_HOST ?? "msi-experience-rdonly.crfg8xlnzwpc.ap-south-1.rds.amazonaws.com",
    user: process.env.LMS_DB_USER ?? "metabase",
    password: process.env.LMS_DB_PASSWORD,
    database: process.env.LMS_DB_NAME ?? "prod_course",
    ssl: { rejectUnauthorized: false },
    timezone: "+00:00",
  });

  return _conn;
}

/**
 * Fetch live lectures from the LMS DB for a given batch within a UTC date range.
 *
 * @param batchId     - LMS numeric batch id
 * @param weekStartUtc - ISO string for the start of the week in UTC (e.g. "2026-04-13T18:30:00")
 * @param weekEndUtc   - ISO string for the exclusive end of the week in UTC
 */
export async function fetchWeekLecturesFromDb(
  batchId: number,
  weekStartUtc: string,
  weekEndUtc: string
): Promise<LmsDbLecture[]> {
  const conn = await getConn();

  const placeholders = TRACKED_LMS_CATEGORIES.map(() => "?").join(", ");

  const [rows] = await conn.query<RowDataPacket[]>(
    `
    SELECT
      l.id,
      l.title,
      l.category,
      l.schedule,
      l.concludes,
      l.start_time,
      l.end_time,
      l.zoom_link,
      l.module,
      b.name AS batch_name
    FROM lectures l
    JOIN batches b ON l.batch_id = b.id
    WHERE l.batch_id     = ?
      AND l.type         = 'live'
      AND l.deleted_at IS NULL
      AND l.category    IN (${placeholders})
      AND l.schedule    >= ?
      AND l.schedule    <  ?
    ORDER BY l.schedule ASC
    `,
    [batchId, ...TRACKED_LMS_CATEGORIES, weekStartUtc, weekEndUtc]
  );

  return rows as LmsDbLecture[];
}

/**
 * Convert an HHMM integer (e.g. 2000, 2130) to an "HH:mm:ss" string.
 */
export function hhmmToTimeStr(val: number): string {
  const h = Math.floor(val / 100).toString().padStart(2, "0");
  const m = (val % 100).toString().padStart(2, "0");
  return `${h}:${m}:00`;
}
