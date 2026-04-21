export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { formatLectureDate } from "@/lib/deadlines";
import { getSheetsClient, getSpreadsheetId, sanitiseSheetTitle } from "@/lib/google-sheets";
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
  learning_objective: string | null;
  lo_reports: LoReportRow | LoReportRow[] | null;
}

function resolveReport(raw: LoReportRow | LoReportRow[] | null): LoReportRow | null {
  if (!raw) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

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
        "id, batch_name, lecture_name, lecture_date, learning_objective, lo_reports ( covered_los, missing_los, status )"
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

    const sheets = getSheetsClient();
    const spreadsheetId = getSpreadsheetId();

    // Fetch existing tab titles
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const existingTabs = new Map(
      (meta.data.sheets ?? []).map((s) => [
        s.properties?.title ?? "",
        s.properties?.sheetId ?? 0
      ])
    );

    const batchNames = Object.keys(byBatch).sort();
    let batchesPushed = 0;

    for (const batchName of batchNames) {
      const tabTitle = sanitiseSheetTitle(batchName);
      const batchLectures = byBatch[batchName];

      // Create tab if it doesn't exist
      if (!existingTabs.has(tabTitle)) {
        const addRes = await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{ addSheet: { properties: { title: tabTitle } } }]
          }
        });
        const newProps = addRes.data.replies?.[0]?.addSheet?.properties;
        if (newProps) {
          existingTabs.set(newProps.title ?? tabTitle, newProps.sheetId ?? 0);
        }
      }

      const sheetId = existingTabs.get(tabTitle) ?? 0;

      // Build header + data rows
      const HEADER = [
        "Lecture Name",
        "Date",
        "Learning Objective",
        "Coverage %",
        "Covered LOs",
        "Missing LOs"
      ];

      const dataRows = batchLectures.map((l) => {
        const report = resolveReport(l.lo_reports);
        const covered = report?.status === "completed" ? (report.covered_los ?? []) : [];
        const missing = report?.status === "completed" ? (report.missing_los ?? []) : [];
        const total = covered.length + missing.length;
        const pct = total > 0 ? `${Math.round((covered.length / total) * 100)}%` : "—";

        return [
          l.lecture_name,
          formatLectureDate(l.lecture_date),
          l.learning_objective ?? "",
          pct,
          covered.join("\n"),
          missing.join("\n")
        ];
      });

      // Clear existing data then write fresh
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `'${tabTitle}'!A:Z`
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${tabTitle}'!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [HEADER, ...dataRows] }
      });

      // Style: bold header with teal background, freeze row 1, auto-resize columns
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            // Bold + teal header background
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
                cell: {
                  userEnteredFormat: {
                    textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                    backgroundColor: { red: 0.06, green: 0.46, blue: 0.43 } // #0f7470
                  }
                },
                fields: "userEnteredFormat(textFormat,backgroundColor)"
              }
            },
            // Freeze first row
            {
              updateSheetProperties: {
                properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
                fields: "gridProperties.frozenRowCount"
              }
            },
            // Wrap text for covered/missing columns (cols E, F = index 4, 5)
            {
              repeatCell: {
                range: { sheetId, startRowIndex: 1, startColumnIndex: 4, endColumnIndex: 6 },
                cell: {
                  userEnteredFormat: { wrapStrategy: "WRAP" }
                },
                fields: "userEnteredFormat.wrapStrategy"
              }
            },
            // Auto-resize all columns
            {
              autoResizeDimensions: {
                dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 6 }
              }
            }
          ]
        }
      });

      batchesPushed++;
    }

    return NextResponse.json({
      message: `Pushed ${batchesPushed} batch${batchesPushed === 1 ? "" : "es"} to Google Sheets successfully.`,
      batches: batchesPushed
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to push to Google Sheets." },
      { status: 500 }
    );
  }
}
