import mysql from "mysql2/promise";

function getConfig() {
  const host = process.env.LMS_DB_HOST;
  const user = process.env.LMS_DB_USER;
  const password = process.env.LMS_DB_PASSWORD;
  const database = process.env.LMS_DB_NAME ?? "prod_course";
  if (!host || !user || !password) throw new Error("LMS MySQL credentials not configured");
  return { host, user, password, database };
}

async function withConn<T>(fn: (conn: mysql.Connection) => Promise<T>): Promise<T> {
  const conn = await mysql.createConnection(getConfig());
  try { return await fn(conn); }
  finally { await conn.end(); }
}

// Extracts batch_id integer from info.log JSON text (2026 ticket format)
const BID_EXPR = `CAST(NULLIF(TRIM(REPLACE(
  COALESCE(REGEXP_SUBSTR(JSON_UNQUOTE(JSON_EXTRACT(t.info, '$.log')), 'batch_id [0-9]+'), ''),
  'batch_id ', ''
)), '') AS UNSIGNED)`;

const YEAR_FILTER = `t.deleted_at IS NULL AND t.created_at >= '2026-01-01'`;

// ─── Types ────────────────────────────────────────────────────────────────────

export type OverviewSummary = {
  open: number; resolved: number; reopened: number; automatic: number; total: number;
  overdue24h: number;
  ccOverdue: { ccName: string; ccEmail: string; count: number }[];
  todayNew: number;
  todayResolved: number;
};

export type BatchWeekRow = {
  batchName: string | null; program: string | null;
  yw: number; weekStart: string; total: number; resolved: number; reopened: number;
};

export type BatchMonthRow = {
  batchName: string | null; program: string | null;
  month: string; total: number; open: number; resolved: number; reopened: number;
};

export type BatchLeaderboardRow = {
  batchName: string | null; program: string | null;
  total: number; avgTat: number; reopenRate: number;
};

export type CCLeaderboardRow = {
  ccName: string; ccEmail: string;
  ticketsHandled: number; avgTat: number; reopenedCount: number; avgRating: number;
};

export type ProgramWeekRow = {
  batchName: string | null; yw: number; weekStart: string; total: number;
};

export type ProgramMonthRow = {
  batchName: string | null; month: string; total: number;
};

export type TATByBatchRow = {
  batchName: string | null; program: string | null;
  avgTat: number; breached24h: number; breached48h: number; totalResolved: number;
};

export type TATByCCRow = {
  ccName: string; ccEmail: string;
  avgTat: number; breached24h: number; breached48h: number; totalResolved: number;
};

export type IntelligenceData = {
  topCategories: { category: string; count: number }[];
  dayOfWeek: { day: string; dow: number; count: number }[];
  reopenByCategory: { category: string; total: number; reopened: number; reopenRate: number }[];
  categoryMoM: { category: string; month: string; count: number }[];
};

export type DistinctBatch = { batchName: string; ticketCount: number };

// ─── 1. Overview ─────────────────────────────────────────────────────────────

export async function fetchOverview(): Promise<OverviewSummary> {
  return withConn(async (conn) => {
    const [[summary]] = await conn.execute<mysql.RowDataPacket[]>(`
      SELECT
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END)                                              AS open_count,
        SUM(CASE WHEN status IN ('resolved','closed','automatic') THEN 1 ELSE 0 END)                   AS resolved_count,
        SUM(CASE WHEN status = 're-opened' THEN 1 ELSE 0 END)                                          AS reopened_count,
        SUM(CASE WHEN status = 'automatic' THEN 1 ELSE 0 END)                                          AS automatic_count,
        COUNT(*)                                                                                        AS total,
        SUM(CASE WHEN status = 'open' AND TIMESTAMPDIFF(HOUR, created_at, NOW()) > 24 THEN 1 ELSE 0 END) AS overdue24h,
        SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END)                                 AS today_new,
        SUM(CASE WHEN DATE(closed_at) = CURDATE() THEN 1 ELSE 0 END)                                  AS today_resolved
      FROM tickets t
      WHERE ${YEAR_FILTER}
    `);

    const [ccOverdueRows] = await conn.execute<mysql.RowDataPacket[]>(`
      SELECT u.name AS cc_name, u.email AS cc_email, COUNT(*) AS cnt
      FROM tickets t
      LEFT JOIN users u ON u.id = t.assignee_id
      WHERE ${YEAR_FILTER}
        AND t.status = 'open'
        AND TIMESTAMPDIFF(HOUR, t.created_at, NOW()) > 24
      GROUP BY t.assignee_id, u.name, u.email
      ORDER BY cnt DESC
      LIMIT 20
    `);

    return {
      open: Number(summary.open_count ?? 0),
      resolved: Number(summary.resolved_count ?? 0),
      reopened: Number(summary.reopened_count ?? 0),
      automatic: Number(summary.automatic_count ?? 0),
      total: Number(summary.total ?? 0),
      overdue24h: Number(summary.overdue24h ?? 0),
      todayNew: Number(summary.today_new ?? 0),
      todayResolved: Number(summary.today_resolved ?? 0),
      ccOverdue: ccOverdueRows.map((r) => ({
        ccName: r.cc_name ?? "Unknown",
        ccEmail: r.cc_email ?? "",
        count: Number(r.cnt),
      })),
    };
  });
}

// ─── 2. Batch Week-over-Week ──────────────────────────────────────────────────

export async function fetchBatchWoW(): Promise<BatchWeekRow[]> {
  return withConn(async (conn) => {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(`
      SELECT
        b.name                                                                            AS batch_name,
        b.program,
        YEARWEEK(t.created_at, 1)                                                         AS yw,
        DATE_FORMAT(MIN(t.created_at), '%Y-%m-%d')                                        AS week_start,
        COUNT(*)                                                                           AS total,
        SUM(CASE WHEN t.status IN ('resolved','closed','automatic') THEN 1 ELSE 0 END)   AS resolved,
        SUM(CASE WHEN t.status = 're-opened' THEN 1 ELSE 0 END)                          AS reopened
      FROM (
        SELECT id, assignee_id, category, status, created_at, closed_at,
          ${BID_EXPR} AS batch_id
        FROM tickets t
        WHERE ${YEAR_FILTER}
      ) t
      LEFT JOIN batches b ON b.id = t.batch_id
      WHERE t.created_at >= DATE_SUB(NOW(), INTERVAL 5 WEEK)
      GROUP BY b.name, b.program, yw
      ORDER BY b.name ASC, yw ASC
    `);
    return rows.map((r) => ({
      batchName: r.batch_name ?? null,
      program: r.program ?? null,
      yw: Number(r.yw),
      weekStart: r.week_start ?? "",
      total: Number(r.total),
      resolved: Number(r.resolved),
      reopened: Number(r.reopened),
    }));
  });
}

// ─── 3. Batch Month-over-Month ────────────────────────────────────────────────

export async function fetchBatchMoM(): Promise<BatchMonthRow[]> {
  return withConn(async (conn) => {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(`
      SELECT
        b.name                                                                            AS batch_name,
        b.program,
        DATE_FORMAT(t.created_at, '%Y-%m')                                                AS month,
        COUNT(*)                                                                           AS total,
        SUM(CASE WHEN t.status = 'open' THEN 1 ELSE 0 END)                               AS open_count,
        SUM(CASE WHEN t.status IN ('resolved','closed','automatic') THEN 1 ELSE 0 END)   AS resolved,
        SUM(CASE WHEN t.status = 're-opened' THEN 1 ELSE 0 END)                          AS reopened
      FROM (
        SELECT id, assignee_id, category, status, created_at, closed_at,
          ${BID_EXPR} AS batch_id
        FROM tickets t
        WHERE ${YEAR_FILTER}
      ) t
      LEFT JOIN batches b ON b.id = t.batch_id
      GROUP BY b.name, b.program, month
      ORDER BY b.name ASC, month ASC
    `);
    return rows.map((r) => ({
      batchName: r.batch_name ?? null,
      program: r.program ?? null,
      month: r.month ?? "",
      total: Number(r.total),
      open: Number(r.open_count),
      resolved: Number(r.resolved),
      reopened: Number(r.reopened),
    }));
  });
}

// ─── 4. Batch Leaderboard ─────────────────────────────────────────────────────

export async function fetchBatchLeaderboard(): Promise<BatchLeaderboardRow[]> {
  return withConn(async (conn) => {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(`
      SELECT
        b.name                                                                                     AS batch_name,
        b.program,
        COUNT(*)                                                                                    AS total,
        ROUND(AVG(LEAST(TIMESTAMPDIFF(HOUR, t.created_at, t.closed_at), 168)), 1)                AS avg_tat,
        ROUND(100.0 * SUM(CASE WHEN t.status = 're-opened' THEN 1 ELSE 0 END) / COUNT(*), 1)     AS reopen_rate
      FROM (
        SELECT id, assignee_id, category, status, created_at, closed_at,
          ${BID_EXPR} AS batch_id
        FROM tickets t
        WHERE ${YEAR_FILTER}
      ) t
      LEFT JOIN batches b ON b.id = t.batch_id
      GROUP BY b.name, b.program
      HAVING COUNT(*) >= 5
      ORDER BY total DESC
      LIMIT 50
    `);
    return rows.map((r) => ({
      batchName: r.batch_name ?? null,
      program: r.program ?? null,
      total: Number(r.total),
      avgTat: Number(r.avg_tat ?? 0),
      reopenRate: Number(r.reopen_rate ?? 0),
    }));
  });
}

// ─── 5. CC Leaderboard ────────────────────────────────────────────────────────

export async function fetchCCLeaderboard(): Promise<CCLeaderboardRow[]> {
  return withConn(async (conn) => {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(`
      SELECT
        u.name                                                                                       AS cc_name,
        u.email                                                                                      AS cc_email,
        COUNT(t.id)                                                                                  AS tickets_handled,
        ROUND(AVG(LEAST(TIMESTAMPDIFF(HOUR, t.created_at, t.closed_at), 168)), 1)                  AS avg_tat,
        SUM(CASE WHEN t.status = 're-opened' THEN 1 ELSE 0 END)                                    AS reopened_count,
        ROUND(AVG(NULLIF(t.rating, 0)), 2)                                                           AS avg_rating
      FROM tickets t
      LEFT JOIN users u ON u.id = t.assignee_id
      WHERE ${YEAR_FILTER} AND t.closed_at IS NOT NULL
      GROUP BY t.assignee_id, u.name, u.email
      HAVING COUNT(t.id) >= 5
      ORDER BY avg_tat ASC
      LIMIT 50
    `);
    return rows.map((r) => ({
      ccName: r.cc_name ?? "Unknown",
      ccEmail: r.cc_email ?? "",
      ticketsHandled: Number(r.tickets_handled),
      avgTat: Number(r.avg_tat ?? 0),
      reopenedCount: Number(r.reopened_count ?? 0),
      avgRating: Number(r.avg_rating ?? 0),
    }));
  });
}

// ─── 6. Domain / Program Week-over-Week ───────────────────────────────────────

export async function fetchProgramWoW(): Promise<ProgramWeekRow[]> {
  return withConn(async (conn) => {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(`
      SELECT
        b.name                                        AS batch_name,
        YEARWEEK(t.created_at, 1)                    AS yw,
        DATE_FORMAT(MIN(t.created_at), '%Y-%m-%d')   AS week_start,
        COUNT(*)                                      AS total
      FROM (
        SELECT id, created_at, ${BID_EXPR} AS batch_id
        FROM tickets t
        WHERE ${YEAR_FILTER}
          AND t.created_at >= DATE_SUB(NOW(), INTERVAL 8 WEEK)
      ) t
      LEFT JOIN batches b ON b.id = t.batch_id
      GROUP BY b.name, yw
      ORDER BY b.name ASC, yw ASC
    `);
    return rows.map((r) => ({
      batchName: r.batch_name ?? null,
      yw: Number(r.yw),
      weekStart: r.week_start ?? "",
      total: Number(r.total),
    }));
  });
}

// ─── 7. Domain / Program Month-over-Month ─────────────────────────────────────

export async function fetchProgramMoM(): Promise<ProgramMonthRow[]> {
  return withConn(async (conn) => {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(`
      SELECT
        b.name                              AS batch_name,
        DATE_FORMAT(t.created_at, '%Y-%m')  AS month,
        COUNT(*)                             AS total
      FROM (
        SELECT id, created_at, ${BID_EXPR} AS batch_id
        FROM tickets t
        WHERE ${YEAR_FILTER}
      ) t
      LEFT JOIN batches b ON b.id = t.batch_id
      GROUP BY b.name, month
      ORDER BY b.name ASC, month ASC
    `);
    return rows.map((r) => ({
      batchName: r.batch_name ?? null,
      month: r.month ?? "",
      total: Number(r.total),
    }));
  });
}

// ─── 8. TAT Tracking ─────────────────────────────────────────────────────────

export async function fetchTATByBatch(): Promise<TATByBatchRow[]> {
  return withConn(async (conn) => {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(`
      SELECT
        b.name                                                                                              AS batch_name,
        b.program,
        COUNT(*)                                                                                            AS total_resolved,
        ROUND(AVG(LEAST(TIMESTAMPDIFF(HOUR, t.created_at, t.closed_at), 168)), 1)                        AS avg_tat,
        SUM(CASE WHEN TIMESTAMPDIFF(HOUR, t.created_at, t.closed_at) > 24 THEN 1 ELSE 0 END)             AS breached_24h,
        SUM(CASE WHEN TIMESTAMPDIFF(HOUR, t.created_at, t.closed_at) > 48 THEN 1 ELSE 0 END)             AS breached_48h
      FROM (
        SELECT id, status, created_at, closed_at, ${BID_EXPR} AS batch_id
        FROM tickets t
        WHERE ${YEAR_FILTER} AND t.closed_at IS NOT NULL
      ) t
      LEFT JOIN batches b ON b.id = t.batch_id
      GROUP BY b.name, b.program
      HAVING COUNT(*) >= 5
      ORDER BY avg_tat ASC
    `);
    return rows.map((r) => ({
      batchName: r.batch_name ?? null,
      program: r.program ?? null,
      totalResolved: Number(r.total_resolved),
      avgTat: Number(r.avg_tat ?? 0),
      breached24h: Number(r.breached_24h ?? 0),
      breached48h: Number(r.breached_48h ?? 0),
    }));
  });
}

export async function fetchTATByCC(): Promise<TATByCCRow[]> {
  return withConn(async (conn) => {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(`
      SELECT
        u.name                                                                                            AS cc_name,
        u.email                                                                                           AS cc_email,
        COUNT(t.id)                                                                                       AS total_resolved,
        ROUND(AVG(LEAST(TIMESTAMPDIFF(HOUR, t.created_at, t.closed_at), 168)), 1)                      AS avg_tat,
        SUM(CASE WHEN TIMESTAMPDIFF(HOUR, t.created_at, t.closed_at) > 24 THEN 1 ELSE 0 END)           AS breached_24h,
        SUM(CASE WHEN TIMESTAMPDIFF(HOUR, t.created_at, t.closed_at) > 48 THEN 1 ELSE 0 END)           AS breached_48h
      FROM tickets t
      LEFT JOIN users u ON u.id = t.assignee_id
      WHERE ${YEAR_FILTER} AND t.closed_at IS NOT NULL
      GROUP BY t.assignee_id, u.name, u.email
      HAVING COUNT(t.id) >= 5
      ORDER BY avg_tat ASC
      LIMIT 50
    `);
    return rows.map((r) => ({
      ccName: r.cc_name ?? "Unknown",
      ccEmail: r.cc_email ?? "",
      totalResolved: Number(r.total_resolved),
      avgTat: Number(r.avg_tat ?? 0),
      breached24h: Number(r.breached_24h ?? 0),
      breached48h: Number(r.breached_48h ?? 0),
    }));
  });
}

// ─── 9. Ticket Intelligence ───────────────────────────────────────────────────

export async function fetchIntelligence(): Promise<IntelligenceData> {
  return withConn(async (conn) => {
    const [cats] = await conn.execute<mysql.RowDataPacket[]>(`
      SELECT category, COUNT(*) AS cnt
      FROM tickets t
      WHERE ${YEAR_FILTER}
      GROUP BY category
      ORDER BY cnt DESC
      LIMIT 20
    `);

    const [dow] = await conn.execute<mysql.RowDataPacket[]>(`
      SELECT DAYNAME(created_at) AS day_name, DAYOFWEEK(created_at) AS dow, COUNT(*) AS cnt
      FROM tickets t
      WHERE ${YEAR_FILTER}
      GROUP BY dow, day_name
      ORDER BY dow
    `);

    const [reopen] = await conn.execute<mysql.RowDataPacket[]>(`
      SELECT
        category,
        COUNT(*) AS total,
        SUM(CASE WHEN status = 're-opened' THEN 1 ELSE 0 END) AS reopened
      FROM tickets t
      WHERE ${YEAR_FILTER}
      GROUP BY category
      HAVING COUNT(*) >= 10
      ORDER BY (SUM(CASE WHEN status = 're-opened' THEN 1 ELSE 0 END) / COUNT(*)) DESC
      LIMIT 20
    `);

    const [catMoM] = await conn.execute<mysql.RowDataPacket[]>(`
      SELECT category, DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS cnt
      FROM tickets t
      WHERE ${YEAR_FILTER}
        AND category IN (
          SELECT category FROM tickets WHERE ${YEAR_FILTER}
          GROUP BY category ORDER BY COUNT(*) DESC LIMIT 8
        )
      GROUP BY category, month
      ORDER BY category ASC, month ASC
    `);

    return {
      topCategories: cats.map((r) => ({ category: r.category ?? "unknown", count: Number(r.cnt) })),
      dayOfWeek: dow.filter((r) => r.dow !== null).map((r) => ({
        day: r.day_name ?? "",
        dow: Number(r.dow),
        count: Number(r.cnt),
      })),
      reopenByCategory: reopen.map((r) => ({
        category: r.category ?? "unknown",
        total: Number(r.total),
        reopened: Number(r.reopened),
        reopenRate: Number(r.total) > 0 ? Number(((Number(r.reopened) / Number(r.total)) * 100).toFixed(1)) : 0,
      })),
      categoryMoM: catMoM.map((r) => ({
        category: r.category ?? "unknown",
        month: r.month ?? "",
        count: Number(r.cnt),
      })),
    };
  });
}

// ─── Distinct Batches (for domain config UI) ──────────────────────────────────

export async function fetchDistinctBatches(): Promise<DistinctBatch[]> {
  return withConn(async (conn) => {
    const [rows] = await conn.execute<mysql.RowDataPacket[]>(`
      SELECT b.name AS batch_name, COUNT(*) AS ticket_count
      FROM (
        SELECT id, ${BID_EXPR} AS batch_id
        FROM tickets t
        WHERE ${YEAR_FILTER}
      ) t
      JOIN batches b ON b.id = t.batch_id
      WHERE b.name IS NOT NULL AND b.name != ''
      GROUP BY b.name
      ORDER BY ticket_count DESC
    `);
    return rows.map((r) => ({
      batchName: r.batch_name ?? "",
      ticketCount: Number(r.ticket_count),
    }));
  });
}
