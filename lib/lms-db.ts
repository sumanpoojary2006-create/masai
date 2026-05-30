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
export function closeLmsDb(): void {
  if (_conn) {
    _conn.destroy();   // immediate — never hangs, unlike end()
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
 * Extract the numeric LMS lecture id from a session link URL.
 * Supports both /lectures/detail/?id=123 and /lectures/123 formats.
 */
export function extractLmsLectureIdFromUrl(sessionLink: string): number | null {
  const queryIdMatch = sessionLink.match(/[?&]id=(\d+)/);
  const pathIdMatch = sessionLink.match(/\/lectures\/(\d+)/);
  const match = queryIdMatch ?? pathIdMatch;
  if (!match) return null;
  const id = parseInt(match[1], 10);
  return isNaN(id) ? null : id;
}

/**
 * Fetch the AI-generated meeting summary (or transcript) for a lecture
 * from the LMS `lectures_ai` table.
 * Returns null if the row doesn't exist yet (summary not yet generated).
 */
export async function fetchLectureSummaryFromDb(lmsLectureId: number): Promise<string | null> {
  const conn = await getConn();

  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT summary, transcript FROM lectures_ai WHERE lectureId = ? LIMIT 1`,
    [lmsLectureId]
  );

  const row = (rows as RowDataPacket[])[0];
  if (!row) return null;

  // Prefer the AI summary; fall back to raw transcript if summary not yet generated
  const text = (row.summary as string | null) ?? (row.transcript as string | null) ?? "";
  return text.trim().length > 50 ? text.trim() : null;
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
  preread_at?: string | null;
  notes: boolean;
  notes_at?: string | null;
  assignment: boolean;
  assignment_at?: string | null;
  /** Zoom / session link for the live lecture (null if not found) */
  session_link: string | null;
}

/**
 * Strip common prefixes so "Faculty Session 25 - Fine-Tuning LLMs" →
 * "Fine-Tuning LLMs" for fuzzy matching (title-based fallback only).
 */
function extractTopic(name: string): string {
  return name
    .replace(
      /^(faculty\s+session\s*[-–]?\s*\d+\s*(?:[-–]\s*)?|im\s+session\s+\d+\s*(?:[-–]\s*)?|academic\s+session\s*\d*\s*(?:[-–]\s*)?|tutorial\s+session\s*[-–]?\s*\d*\s*(?:[-–]\s*)?)/i,
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

const STOPWORDS = new Set([
  "and", "the", "with", "for", "from", "into", "using", "via",
  "its", "are", "was", "has", "have", "had", "that", "this",
  "data", "session", "lecture", "introduction", "intro", "basics",
  "advanced", "overview", "part", "workshop"
]);

/**
 * Returns true if `readingTitle` is semantically close to the live
 * session `topic`. Uses strict substring match first, then a 70%
 * keyword-overlap on meaningful (non-stopword) words only.
 */
function titleMatches(readingTitle: string, topic: string): boolean {
  if (!topic) return false;
  const r = normalize(readingTitle);
  const t = normalize(topic);
  if (r.includes(t) || t.includes(r)) return true;
  // Only match on meaningful words (length >= 4, not a stopword)
  const words = t.split(" ").filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  if (words.length === 0) return false;
  const hit = words.filter((w) => r.includes(w)).length;
  return hit / words.length >= 0.7;
}

/**
 * Check whether the LMS DB already has pre-read, lecture notes, and/or an
 * assignment for the given live lecture, and return the zoom/session link.
 *
 * Live lecture resolution (in priority order):
 *   1. Exact title match — most reliable when titles are in sync
 *   2. Session-number match — handles lectures renamed in LMS after sync
 *      (e.g. Supabase: "IM Session 33 - Topic A", LMS: "IM Session 33 - Topic B")
 *   3. Date proximity ±1 day + tracked category — absorbs IST→UTC date drift
 *
 * Resource lookup (in priority order):
 *   1. data.associatedLecture.id — direct link set by faculty, immune to renames
 *   2. Fuzzy title match in a ±14/+7 day window — fallback for resources
 *      uploaded without an associatedLecture link
 *
 * Both lookups run independently per resource type so a partial association
 * result never blocks the title fallback for the remaining missing types.
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

  // ── Step 1: resolve the live lecture's LMS id ────────────────────────────
  const categoryPlaceholders = TRACKED_LMS_CATEGORIES.map(() => "?").join(", ");

  // Extract "33" from "IM Session 33 - …" for session-number fallback.
  const sessionNumber = lectureName.match(/\bsession\s+(\d+)\b/i)?.[1] ?? null;

  // Priority 1: exact title match (no date constraint needed).
  let [liveRows] = await conn.query<RowDataPacket[]>(
    `SELECT id FROM lectures
     WHERE batch_id = ? AND type = 'live' AND title = ? AND deleted_at IS NULL
     LIMIT 1`,
    [batchId, lectureName]
  );

  // Priority 2: same session number, category-filtered (lecture may be renamed in LMS).
  if (!(liveRows as RowDataPacket[]).length && sessionNumber) {
    [liveRows] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM lectures
       WHERE batch_id = ? AND type = 'live' AND deleted_at IS NULL
         AND category IN (${categoryPlaceholders})
         AND REGEXP_LIKE(title, CONCAT('session[[:space:]]+', ?, '([^[:digit:]]|$)'), 'i')
       ORDER BY ABS(DATEDIFF(start_date, ?)) ASC, ABS(start_time - 2000) ASC
       LIMIT 1`,
      [batchId, ...TRACKED_LMS_CATEGORIES, sessionNumber, lectureDate]
    );
  }

  // Priority 3: date proximity ±1 day, category-filtered (absorbs IST→UTC drift).
  if (!(liveRows as RowDataPacket[]).length) {
    [liveRows] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM lectures
       WHERE batch_id = ? AND type = 'live' AND deleted_at IS NULL
         AND start_date BETWEEN DATE_SUB(?, INTERVAL 1 DAY) AND DATE_ADD(?, INTERVAL 1 DAY)
         AND category IN (${categoryPlaceholders})
       ORDER BY ABS(DATEDIFF(start_date, ?)) ASC, ABS(start_time - 2000) ASC
       LIMIT 1`,
      [batchId, lectureDate, lectureDate, ...TRACKED_LMS_CATEGORIES, lectureDate]
    );
  }

  const lmsId = (liveRows[0] as { id?: number } | undefined)?.id ?? null;
  const session_link = lmsId
    ? `https://experience-admin.masaischool.com/lectures/detail/?id=${lmsId}`
    : null;

  let preread = false;
  let preread_at: string | null = null;
  let notes = false;
  let notes_at: string | null = null;
  let assignment = false;
  let assignment_at: string | null = null;

  // ── Step 2: association-based lookup (primary per resource type) ─────────
  // data.associatedLecture is an object {id,title} on readings and an array
  // [{id,title}] on assignments — handle both formats.
  if (lmsId) {
    const assocClause = `(
      JSON_EXTRACT(data, '$.associatedLecture.id') = ?
      OR JSON_OVERLAPS(COALESCE(JSON_EXTRACT(data, '$.associatedLecture[*].id'), '[]'), JSON_ARRAY(?))
    )`;

    const [assocReadings] = await conn.query<RowDataPacket[]>(
      `SELECT title, category, GREATEST(created_at, COALESCE(schedule, created_at)) AS effective_at FROM lectures
       WHERE batch_id = ? AND type = 'reading'
         AND category IN ('pre-reads', 'Pre Reads', 'notes')
         AND deleted_at IS NULL AND ${assocClause}`,
      [batchId, lmsId, lmsId]
    );

    for (const row of assocReadings as Array<{ title: string; category: string; effective_at: string }>) {
      const cat = row.category.toLowerCase();
      if (cat.includes("pre")) { preread = true; preread_at = row.effective_at; }
      else if (cat === "notes") { notes = true; notes_at = row.effective_at; }
    }

    const [assocAssigns] = await conn.query<RowDataPacket[]>(
      `SELECT created_at FROM assignments
       WHERE batch_id = ? AND deleted_at IS NULL AND ${assocClause}
       ORDER BY created_at ASC LIMIT 1`,
      [batchId, lmsId, lmsId]
    );

    if ((assocAssigns as Array<{ created_at: string }>).length > 0) {
      assignment = true;
      assignment_at = (assocAssigns as Array<{ created_at: string }>)[0].created_at;
    }
  }

  // ── Step 3: title-based fallback — only when lmsId could not be resolved ────
  // When we have a valid lmsId we trust only the associatedLecture.id link from
  // Step 2 so that resources belonging to a *different* lecture with a similar
  // topic (e.g. another "Decision Trees" session) are never picked up by mistake.
  if (!lmsId && (!preread || !notes || !assignment)) {
    const topic = extractTopic(lectureName);

    const base = new Date(lectureDate);
    const windowStart = new Date(base);
    windowStart.setDate(windowStart.getDate() - 14);
    const windowEnd = new Date(base);
    windowEnd.setDate(windowEnd.getDate() + 7);
    const startStr = windowStart.toISOString().slice(0, 10);
    const endStr   = windowEnd.toISOString().slice(0, 10);

    // Only match resources with NO associatedLecture set — if a resource has
    // associatedLecture.id pointing to any lecture (even the wrong one), it must
    // be found via the association-based Step 2 above, not by title guessing.
    // This prevents notes/prereads linked to a non-live or wrong lecture from
    // being counted as completed just because the title happens to match.
    const [readingRows] = await conn.query<RowDataPacket[]>(
      `SELECT title, category, GREATEST(created_at, COALESCE(schedule, created_at)) AS effective_at FROM lectures
       WHERE batch_id = ? AND type = 'reading'
         AND category IN ('pre-reads', 'Pre Reads', 'notes')
         AND start_date BETWEEN ? AND ? AND deleted_at IS NULL
         AND JSON_EXTRACT(data, '$.associatedLecture.id') IS NULL
         AND JSON_EXTRACT(data, '$.associatedLecture[0].id') IS NULL`,
      [batchId, startStr, endStr]
    );

    const [assignRows] = await conn.query<RowDataPacket[]>(
      `SELECT title, created_at FROM assignments
       WHERE batch_id = ? AND start_date BETWEEN ? AND ? AND deleted_at IS NULL
         AND JSON_EXTRACT(data, '$.associatedLecture[0].id') IS NULL`,
      [batchId, startStr, endStr]
    );

    for (const row of readingRows as Array<{ title: string; category: string; effective_at: string }>) {
      if (!titleMatches(row.title, topic)) continue;
      const cat = row.category.toLowerCase();
      if (cat.includes("pre") && !preread) { preread = true; preread_at = row.effective_at; }
      else if (cat === "notes" && !notes) { notes = true; notes_at = row.effective_at; }
    }

    if (!assignment) {
      for (const row of assignRows as Array<{ title: string; created_at: string }>) {
        if (titleMatches(row.title, topic)) {
          assignment = true;
          assignment_at = row.created_at;
          break;
        }
      }
    }
  }

  return { preread, preread_at, notes, notes_at, assignment, assignment_at, session_link };
}
