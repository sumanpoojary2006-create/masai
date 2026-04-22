import { DateTime } from "luxon";

import { getAppTimezone } from "@/lib/env";
import { TaskType } from "@/lib/types";

function parseLocalDateTime(date: string, time: string) {
  return DateTime.fromISO(`${date}T${time}`, {
    zone: getAppTimezone()
  });
}

function toIsoOrThrow(dateTime: DateTime) {
  const iso = dateTime.toUTC().toISO();

  if (!iso) {
    throw new Error("Unable to generate an ISO deadline from the lecture schedule.");
  }

  return iso;
}

export function computeDeadline(
  type: TaskType,
  lectureDate: string,
  startTime: string,
  endTime: string
) {
  if (type === "preread") {
    // Pre-read must be released by 3:00 PM the day before the lecture.
    // Monday sessions are special: Sunday is off, so deadline is Saturday 3:00 PM.
    const lectureDay3pm = parseLocalDateTime(lectureDate, "15:00:00");
    const daysToSubtract = lectureDay3pm.weekday === 1 ? 2 : 1;
    const prereadDeadline = lectureDay3pm.minus({ days: daysToSubtract });
    return toIsoOrThrow(prereadDeadline);
  }

  // Notes & Assignment must be released by 3:00 PM the day after the lecture
  const nextDay3pm = parseLocalDateTime(lectureDate, "15:00:00").plus({ days: 1 });
  return toIsoOrThrow(nextDay3pm);
}

export function formatLectureDate(date: string) {
  return DateTime.fromISO(date, {
    zone: getAppTimezone()
  }).toFormat("dd LLL yyyy");
}

export function formatLectureTime(time: string) {
  return DateTime.fromISO(`1970-01-01T${time}`, {
    zone: getAppTimezone()
  }).toFormat("hh:mm a");
}

export function formatDeadline(deadline: string) {
  const dateTime = DateTime.fromISO(deadline, {
    zone: getAppTimezone()
  });

  if (!dateTime.isValid) {
    return "Deadline unavailable";
  }

  return dateTime.toFormat("dd LLL, hh:mm a");
}
