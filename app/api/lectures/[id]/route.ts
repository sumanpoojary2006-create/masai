export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { createServerSupabase } from "@/lib/supabase";

export async function DELETE(
  _request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        {
          message: "Lecture id is required."
        },
        {
          status: 400
        }
      );
    }

    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("lectures")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return NextResponse.json(
        {
          message: "Lecture not found."
        },
        {
          status: 404
        }
      );
    }

    return NextResponse.json({
      message: "Lecture deleted successfully."
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Unable to delete lecture."
      },
      {
        status: 500
      }
    );
  }
}

