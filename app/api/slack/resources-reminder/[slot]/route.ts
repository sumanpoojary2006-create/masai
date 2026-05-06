import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  _context: { params: Promise<{ slot: string }> }
) {
  return NextResponse.json(
    { message: "Scheduled Slack reminders have been disabled. Use the admin Push Slack Notification button instead." },
    { status: 410 }
  );
}
