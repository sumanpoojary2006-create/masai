import { DateTime } from "luxon";

const REQUIRED_SUPABASE_VARS = ["SUPABASE_URL", "SUPABASE_KEY"] as const;
const REQUIRED_AUTOMATION_VARS = ["SLACK_WEBHOOK_URL", "SUPABASE_URL", "SUPABASE_KEY"] as const;

function readRequired(key: string) {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

export function hasSupabaseConfig() {
  return REQUIRED_SUPABASE_VARS.every((key) => Boolean(process.env[key]));
}

export function hasPublicSupabaseConfig() {
  return Boolean(getPublicSupabaseEnv().url && getPublicSupabaseEnv().key);
}

export function getAppTimezone() {
  return process.env.APP_TIMEZONE ?? "Asia/Kolkata";
}

/** Current timestamp as an IST ISO-8601 string (e.g. "2026-04-30T20:00:00.000+05:30"). */
export function nowIST(): string {
  return DateTime.now().setZone(getAppTimezone()).toISO()!;
}

/**
 * Convert a JS Date that mysql2 mis-parsed as UTC (because the DB stores IST
 * wall-clock times without a timezone marker) back to a correct IST ISO string.
 */
export function mysqlDateToIST(date: Date): string {
  return DateTime.fromJSDate(date, { zone: "UTC" })
    .setZone(getAppTimezone(), { keepLocalTime: true })
    .toISO()!;
}

export function getSupabaseEnv() {
  return {
    url: readRequired("SUPABASE_URL"),
    key: readRequired("SUPABASE_KEY")
  };
}

export function getPublicSupabaseEnv() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "",
    key:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      ""
  };
}

export function getAutomationEnv() {
  REQUIRED_AUTOMATION_VARS.forEach(readRequired);

  return {
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL as string,
    supabaseUrl: process.env.SUPABASE_URL as string,
    supabaseKey: process.env.SUPABASE_KEY as string,
    timezone: getAppTimezone()
  };
}

export function getAdminUserIds(): string[] {
  const adminIds = process.env.ADMIN_USER_IDS;
  if (!adminIds) return [];
  return adminIds.split(",").map((id) => id.trim()).filter(Boolean);
}

export function isAdminUser(userId: string): boolean {
  return getAdminUserIds().includes(userId);
}
