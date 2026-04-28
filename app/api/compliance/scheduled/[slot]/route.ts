import { NextRequest, NextResponse } from "next/server";
import { DateTime } from "luxon";

import { runComplianceCheck } from "@/lib/automation";
import { getAppTimezone } from "@/lib/env";

type Slot = "11am" | "1pm" | "230pm";
type ReminderType = "morning" | "noon" | "afternoon";

const SLOT_CONFIG: Record<Slot, { hour: number; minute: number; reminderType: ReminderType }> = {
  "11am":  { hour: 11, minute: 0,  reminderType: "morning" },
  "1pm":   { hour: 13, minute: 0,  reminderType: "noon" },
  "230pm": { hour: 14, minute: 30, reminderType: "afternoon" }
};

function isAuthorized(request: NextRequest) {
  const expected = process.env.CRON_SECRET ?? process.env.COMPLIANCE_CRON_SECRET;
  if (!expected) return true;

  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${expected}`;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slot: string }> }
) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { slot } = await context.params;
  if (!(slot in SLOT_CONFIG)) {
    return NextResponse.json({ message: "Invalid schedule slot" }, { status: 400 });
  }

  const { hour, minute, reminderType } = SLOT_CONFIG[slot as Slot];
  const timezone = getAppTimezone();
  const now = DateTime.now().setZone(timezone);

  const scheduledTime = now.set({ hour, minute, second: 0, millisecond: 0 });
  const delayMinutes = now.diff(scheduledTime, "minutes").minutes;

  // Allow up to 30 min late — Vercel crons are reliable but not sub-minute precise
  if (delayMinutes < 0 || delayMinutes >= 30) {
    return NextResponse.json({
      message: `Skipped ${slot}: arrived ${Math.round(delayMinutes)}m from scheduled ${hour}:${String(minute).padStart(2, "0")} ${timezone}.`,
      now: now.toISO()
    });
  }

  const result = await runComplianceCheck({ reminderType });

  return NextResponse.json({
    message: `Ran ${slot} scheduled compliance successfully.`,
    slot,
    reminderType,
    now: now.toISO(),
    result
  });
}
