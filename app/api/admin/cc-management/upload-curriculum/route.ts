export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { hasAdminAccess } from "@/lib/admin-access";
import { parseCurriculumWorkbook } from "@/lib/importer";
import { createServerSupabase } from "@/lib/supabase";

/**
 * POST — Upload a curriculum file (CSV/XLSX) for a batch.
 * Admins can upload for any batch.
 * CCs can upload only for their own assigned batches.
 *
 * FormData fields:
 *   file       — the CSV or Excel file
 *   batch_name — the target batch name (must match lms_batch_cache)
 */
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get("file");
    const batchName = String(formData.get("batch_name") ?? "").trim();

    if (!(file instanceof File)) {
      return NextResponse.json(
        { message: "Attach a CSV or Excel file as `file`." },
        { status: 400 }
      );
    }

    if (!batchName) {
      return NextResponse.json(
        { message: "`batch_name` is required." },
        { status: 400 }
      );
    }

    const supabase = createServerSupabase();
    const isAdmin = await hasAdminAccess(user.id);

    if (!isAdmin) {
      // CCs may only upload for their own assigned batches
      const { data: assignment } = await supabase
        .from("cc_batch_assignments")
        .select("batch_name")
        .eq("cc_user_id", user.id)
        .eq("batch_name", batchName)
        .maybeSingle();

      if (!assignment) {
        return NextResponse.json(
          { message: "You can only upload curriculum for your assigned batches." },
          { status: 403 }
        );
      }
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const rows = parseCurriculumWorkbook(fileBuffer);

    if (rows.length === 0) {
      return NextResponse.json(
        { message: "No valid rows found in the file." },
        { status: 400 }
      );
    }

    // Delete existing global curriculum for this batch before re-uploading
    await supabase
      .from("batch_curriculums")
      .delete()
      .eq("batch_name", batchName)
      .is("user_id", null);

    const { error } = await supabase.from("batch_curriculums").insert(
      rows.map((row) => ({
        user_id: null,
        batch_name: batchName,
        lecture_name: row.lecture_name,
        learning_objective: row.learning_objective,
      }))
    );

    if (error) throw new Error(error.message);

    return NextResponse.json({
      message: `Uploaded ${rows.length} curriculum entries for batch "${batchName}".`,
      count: rows.length,
    });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Upload failed." },
      { status: 500 }
    );
  }
}
