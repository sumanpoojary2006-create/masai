import { NextRequest, NextResponse } from "next/server";
import { DateTime } from "luxon";

import { runComplianceCheck } from "@/lib/automation";
import { getAppTimezone } from "@/lib/env";

type Slot = "11am" | "230pm";

const SLOT_TIMES: Record<Slot, { hour: number; minute: number }> = {
  "11am": { hour: 11, minute: 0 },
  "230pm": { hour: 14, minute: 30 }
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
  if (slot !== "11am" && slot !== "230pm") {
    return NextResponse.json({ message: "Invalid schedule slot" }, { status: 400 });
  }

  const timezone = getAppTimezone();
  const now = DateTime.now().setZone(timezone);
  const scheduled = SLOT_TIMES[slot];

  if (now.hour !== scheduled.hour || now.minute !== scheduled.minute) {
    return NextResponse.json({
      message: `Skipped ${slot} scheduled compliance because the request arrived outside the exact ${scheduled.hour}:${scheduled.minute
        .toString()
        .padStart(2, "0")} ${timezone} minute.`,
      now: now.toISO()
    });
  }

  const result = await runComplianceCheck();

  return NextResponse.json({
    message: `Ran ${slot} scheduled compliance successfully.`,
    slot,
    now: now.toISO(),
    result
  });
}
