/**
 * Direct read-only connection to the Masai LMS MySQL replica.
 * Used for syncing live sessions without Playwright or GraphQL.
 */
import mysql, { RowDataPacket } from "mysql2/promise";

export interface LmsDbLecture {
  id: number;
  title: string;
  category: string;
  /**
   * ISO date string "YYYY-MM-DD" — the IST date of the lecture.
   * Comes from the `start_date` DATE column which stores the correct local date.
   */
  start_date: string;
  /** Integer HHMM in IST, e.g. 2000 = 20:00, 2130 = 21:30 */
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

/** Close the shared MySQL connection. Call this at the end of every script. */
export async function closeLmsDb(): Promise<void> {
  if (_conn) {
    await _conn.end().catch(() => undefined);
    _conn = null;
  }
}

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
    // NOTE: datetime columns in this DB store local (IST) times, not UTC.
    // We use `start_date` (a plain DATE column) for the IST date, and the
    // `start_time` HHMM integer for the IST time — no timezone conversion needed.
    dateStrings: true,  // return date/datetime as raw strings, not JS Date objects
  });

  return _conn;
}

/**
 * Fetch live lectures from the LMS DB for a given batch within an IST week.
 *
 * Uses `start_date` (plain DATE column, IST) for filtering — avoids the
 * timezone ambiguity of the `schedule` datetime column which stores local times.
 *
 * @param batchId       - LMS numeric batch id
 * @param weekStartDate - "YYYY-MM-DD" — Monday of the week in IST
 * @param weekEndDate   - "YYYY-MM-DD" — Sunday of the week in IST (inclusive)
 */
export async function fetchWeekLecturesFromDb(
  batchId: number,
  weekStartDate: string,
  weekEndDate: string
): Promise<LmsDbLecture[]> {
  const conn = await getConn();

  const placeholders = TRACKED_LMS_CATEGORIES.map(() => "?").join(", ");

  const [rows] = await conn.query<RowDataPacket[]>(
    `
    SELECT
      l.id,
      l.title,
      l.category,
      l.start_date,
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
      AND l.start_date  >= ?
      AND l.start_date  <= ?
    ORDER BY l.start_date ASC, l.start_time ASC
    `,
    [batchId, ...TRACKED_LMS_CATEGORIES, weekStartDate, weekEndDate]
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

// ─────────────────────────────────────────────────────────────────────────────
// Task-completion checking
// ─────────────────────────────────────────────────────────────────────────────

export interface LmsTaskCheck {
  preread: boolean;
  notes: boolean;
  assignment: boolean;
  /** Zoom / session link for the live lecture (null if not found) */
  session_link: string | null;
}

/**
 * Strip common prefixes so "Faculty Session 25 - Fine-Tuning LLMs" →
 * "Fine-Tuning LLMs" for fuzzy matching against pre-read/notes titles.
 */
function extractTopic(name: string): string {
  return name
    .replace(
      /^(faculty\s+session\s*[-–]?\s*\d+\s*[-–]\s*|im\s+session\s+\d+\s*[-–]\s*|academic\s+session\s*\d*\s*[-–]\s*|tutorial\s+session\s*[-–]?\s*\d*\s*[-–]\s*)/i,
      ""
    )
    .trim();
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Returns true if `readingTitle` is semantically close to the live
 * session `topic`.  Uses substring + 60 % keyword-overlap fallback.
 */
function titleMatches(readingTitle: string, topic: string): boolean {
  if (!topic) return false;
  const r = normalize(readingTitle);
  const t = normalize(topic);
  if (r.includes(t) || t.includes(r)) return true;
  const words = t.split(" ").filter((w) => w.length >= 3);
  if (words.length === 0) return false;
  const hit = words.filter((w) => r.includes(w)).length;
  return hit / words.length >= 0.6;
}

/**
 * Check whether the LMS DB already has pre-read, lecture notes, and/or an
 * assignment for the given live lecture, and return the zoom/session link.
 *
 * Matching is done by:
 *  • same batch_id
 *  • start_date within a ±14-day window
 *  • fuzzy title match (suffix after "Faculty Session N –" prefix stripped)
 *
 * @param batchId      LMS numeric batch id
 * @param lectureName  Name as stored in our Supabase lectures table
 * @param lectureDate  "YYYY-MM-DD" (IST)
 */
export async function checkLmsTasksForLecture(
  batchId: number,
  lectureName: string,
  lectureDate: string
): Promise<LmsTaskCheck> {
  const conn = await getConn();
  const topic = extractTopic(lectureName);

  // Wide window: pre-reads up to 14 days before, notes/assignments up to 7 days after
  const base = new Date(lectureDate);
  const windowStart = new Date(base);
  windowStart.setDate(windowStart.getDate() - 14);
  const windowEnd = new Date(base);
  windowEnd.setDate(windowEnd.getDate() + 7);
  const startStr = windowStart.toISOString().slice(0, 10);
  const endStr = windowEnd.toISOString().slice(0, 10);

  // ── reading records (pre-reads + notes) ──────────────────────────────────
  // Existence of the record is sufficient — pre-reads uploaded as files have
  // notes=NULL but content in faculty_resources, so we don't filter by has_content.
  const [readingRows] = await conn.query<RowDataPacket[]>(
    `
    SELECT title, category
    FROM lectures
    WHERE batch_id    = ?
      AND type        = 'reading'
      AND category    IN ('pre-reads', 'Pre Reads', 'notes')
      AND start_date  BETWEEN ? AND ?
      AND deleted_at IS NULL
    `,
    [batchId, startStr, endStr]
  );

  // ── assignments ───────────────────────────────────────────────────────────
  const [assignRows] = await conn.query<RowDataPacket[]>(
    `
    SELECT title
    FROM assignments
    WHERE batch_id    = ?
      AND start_date  BETWEEN ? AND ?
      AND deleted_at IS NULL
    `,
    [batchId, startStr, endStr]
  );

  // ── LMS lecture id for this live session (to build detail page URL) ─────
  const [liveRows] = await conn.query<RowDataPacket[]>(
    `
    SELECT id
    FROM lectures
    WHERE batch_id  = ?
      AND type      = 'live'
      AND start_date = ?
      AND deleted_at IS NULL
    ORDER BY ABS(start_time - 2000) ASC
    LIMIT 1
    `,
    [batchId, lectureDate]
  );

  let preread = false;
  let notes = false;
  let assignment = false;

  for (const row of readingRows as Array<{ title: string; category: string }>) {
    if (!titleMatches(row.title, topic)) continue;
    const cat = row.category.toLowerCase();
    if (cat.includes("pre")) preread = true;
    else if (cat === "notes") notes = true;
  }

  for (const row of assignRows as Array<{ title: string }>) {
    if (titleMatches(row.title, topic)) { assignment = true; break; }
  }

  const lmsId = (liveRows[0] as { id?: number } | undefined)?.id ?? null;
  const session_link = lmsId
    ? `https://experience-admin.masaischool.com/lectures/detail/?id=${lmsId}`
    : null;

  return { preread, notes, assignment, session_link };
}
