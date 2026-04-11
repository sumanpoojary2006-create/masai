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
