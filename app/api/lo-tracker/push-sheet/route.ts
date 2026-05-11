export const runtime = "nodejs";

import { DateTime } from "luxon";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { formatLectureDate } from "@/lib/deadlines";
import { getAppTimezone } from "@/lib/env";
import { pushToGoogleSheet, type SheetBatch } from "@/lib/google-sheets";
import { createServerSupabase } from "@/lib/supabase";

interface LoReportRow {
  covered_los: string[];
  missing_los: string[];
  status: string;
}

interface LectureRow {
  id: string;
  batch_name: string;
  lecture_name: string;
  lecture_date: string;
  session_link: string | null;
  learning_objective: string | null;
  lo_reports: LoReportRow | LoReportRow[] | null;
}

function resolveReport(raw: LoReportRow | LoReportRow[] | null): LoReportRow | null {
  if (!raw) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

const HEADER = [
  "Lecture Name",
  "Date",
  "Session Link",
  "Learning Objective",
  "Coverage %",
  "Covered LOs",
  "Missing LOs"
];

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ message: "Please log in first." }, { status: 401 });
    }

    const supabase = createServerSupabase();

    // Fetch all active lectures with their LO reports
    const { data: lectures, error } = await supabase
      .from("lectures")
      .select(
        "id, batch_name, lecture_name, lecture_date, session_link, learning_objective, lo_reports ( covered_los, missing_los, status )"
      )
      .eq("user_id", user.id)
      .is("archived_at", null)
      .order("lecture_date", { ascending: true });

    if (error) throw new Error("Unable to fetch lectures: " + error.message);
    if (!lectures || lectures.length === 0) {
      return NextResponse.json({ message: "No lectures found to push." }, { status: 400 });
    }

    // Group by batch
    const byBatch: Record<string, LectureRow[]> = {};
    for (const l of lectures as LectureRow[]) {
      if (!byBatch[l.batch_name]) byBatch[l.batch_name] = [];
      byBatch[l.batch_name].push(l);
    }

    const timezone = getAppTimezone();

    // Returns the Monday of the ISO week containing the given date string.
    function weekStart(dateStr: string): string {
      return DateTime.fromISO(dateStr, { zone: timezone }).startOf("week").toISODate()!;
    }

    function weekLabel(mondayIso: string): string {
      const start = DateTime.fromISO(mondayIso, { zone: timezone });
      const end = start.plus({ days: 6 });
      return `📅 Week of ${start.toFormat("dd MMM")} – ${end.toFormat("dd MMM yyyy")}`;
    }

    const batches: SheetBatch[] = Object.keys(byBatch)
      .sort()
      .map((batchName) => {
        // Group lectures by their ISO week (keyed by Monday's date).
        const byWeek = new Map<string, LectureRow[]>();
        for (const l of byBatch[batchName]) {
          const key = weekStart(l.lecture_date);
          if (!byWeek.has(key)) byWeek.set(key, []);
          byWeek.get(key)!.push(l);
        }

        const rows: string[][] = [HEADER];

        for (const [monday, weekLectures] of [...byWeek.entries()].sort()) {
          // Week header row — spans all columns, rest are empty.
          rows.push([weekLabel(monday), "", "", "", "", "", ""]);

          for (const l of weekLectures) {
            const report = resolveReport(l.lo_reports);
            const covered = report?.status === "completed" ? (report.covered_los ?? []) : [];
            const missing = report?.status === "completed" ? (report.missing_los ?? []) : [];
            const total = covered.length + missing.length;
            const pct = total > 0 ? `${Math.round((covered.length / total) * 100)}%` : "—";

            rows.push([
              l.lecture_name,
              formatLectureDate(l.lecture_date),
              l.session_link ?? "",
              l.learning_objective ?? "",
              pct,
              covered.join("\n"),
              missing.join("\n")
            ]);
          }

          // Blank separator row between weeks.
          rows.push(["", "", "", "", "", "", ""]);
        }

        return { name: batchName, rows };
      });

    await pushToGoogleSheet({ batches });

    return NextResponse.json({
      message: `Pushed ${batches.length} batch${batches.length === 1 ? "" : "es"} to Google Sheets successfully.`,
      batches: batches.length
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to push to Google Sheets." },
      { status: 500 }
    );
  }
}
