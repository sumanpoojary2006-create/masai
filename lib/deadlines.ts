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
  const lectureStart = parseLocalDateTime(lectureDate, startTime);
  const lectureEnd = parseLocalDateTime(lectureDate, endTime);
  const lectureDay = DateTime.fromISO(lectureDate, {
    zone: getAppTimezone()
  });

  if (type === "preread") {
    return toIsoOrThrow(lectureStart.minus({ hours: 24 }));
  }

  if (type === "notes") {
    return toIsoOrThrow(lectureEnd.plus({ hours: 18 }));
  }

  return toIsoOrThrow(lectureDay.plus({ days: 14 }).endOf("day"));
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
