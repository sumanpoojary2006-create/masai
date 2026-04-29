import { DateTime } from "luxon";

type ScheduledRunWindow = {
  timezone: string;
  hour: number;
  minute: number;
  maxDelayMinutes: number;
  allowedWeekdays?: number[];
};

type ScheduledRunResult = {
  shouldRun: boolean;
  now: DateTime;
  scheduledTime: DateTime;
  delayMinutes: number;
  reason: string;
};

export function evaluateScheduledRunWindow(config: ScheduledRunWindow): ScheduledRunResult {
  const now = DateTime.now().setZone(config.timezone);
  const scheduledTime = now.set({
    hour: config.hour,
    minute: config.minute,
    second: 0,
    millisecond: 0
  });

  if (config.allowedWeekdays && !config.allowedWeekdays.includes(now.weekday)) {
    return {
      shouldRun: false,
      now,
      scheduledTime,
      delayMinutes: now.diff(scheduledTime, "minutes").minutes,
      reason: `Skipped: ${now.toFormat("cccc")} is outside the allowed schedule in ${config.timezone}.`
    };
  }

  const delayMinutes = now.diff(scheduledTime, "minutes").minutes;
  const shouldRun = delayMinutes >= 0 && delayMinutes < config.maxDelayMinutes;

  return {
    shouldRun,
    now,
    scheduledTime,
    delayMinutes,
    reason: shouldRun
      ? `Within ${config.maxDelayMinutes}m window for ${scheduledTime.toFormat("hh:mm a")} ${config.timezone}.`
      : `Skipped: arrived ${Math.round(delayMinutes)}m from scheduled ${scheduledTime.toFormat("hh:mm a")} ${config.timezone}.`
  };
}
