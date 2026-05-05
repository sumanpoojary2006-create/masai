import { createServerSupabase } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EducatorAvailability {
  mon: boolean;
  tue: boolean;
  wed: boolean;
  thu: boolean;
  fri: boolean;
  sat: boolean;
  sun: boolean;
}

export interface Educator {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  linkedinUrl: string | null;
  tier: string | null;
  instructorType: string | null;
  primaryDomain: string | null;
  secondaryDomain: string | null;
  company: string | null;
  yoe: number | null;
  languages: string | null;
  masaiHistory: boolean;
  mouStatus: string | null;
  curriculumApprovalRating: string | null;
  blacklisted: boolean;
  remarks: string | null;
  availability: EducatorAvailability;
  createdAt: string;
  updatedAt: string;
}

export interface EducatorStats {
  totalSessions: number;
  overallAvgRating: number | null;
  last5AvgRating: number | null;
  sessionsRated4_5Plus: number;
}

export interface EducatorWithStats extends Educator {
  stats: EducatorStats;
  currentWeekBlocked: Partial<EducatorAvailability>;
}

export interface EducatorListItem extends Educator {
  currentWeekBlocked: Partial<EducatorAvailability>;
}

export interface EducatorListResult {
  educators: EducatorListItem[];
  total: number;
}

export interface EducatorFilters {
  search?: string;
  tier?: string;
  instructorType?: string;
  primaryDomain?: string;
  mouStatus?: string;
  blacklisted?: boolean;
  availableDay?: keyof EducatorAvailability;
  page?: number;
  pageSize?: number;
}

export type EducatorUpdatePayload = Partial<
  Pick<
    Educator,
    | "name"
    | "phone"
    | "linkedinUrl"
    | "tier"
    | "instructorType"
    | "primaryDomain"
    | "secondaryDomain"
    | "company"
    | "yoe"
    | "languages"
    | "masaiHistory"
    | "mouStatus"
    | "curriculumApprovalRating"
    | "blacklisted"
    | "remarks"
    | "availability"
  >
>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toEducator(row: Record<string, unknown>): Educator {
  const avail = (row.availability ?? {}) as Partial<EducatorAvailability>;
  return {
    id: row.id as string,
    email: row.email as string,
    name: row.name as string,
    phone: (row.phone as string | null) ?? null,
    linkedinUrl: (row.linkedin_url as string | null) ?? null,
    tier: (row.tier as string | null) ?? null,
    instructorType: (row.instructor_type as string | null) ?? null,
    primaryDomain: (row.primary_domain as string | null) ?? null,
    secondaryDomain: (row.secondary_domain as string | null) ?? null,
    company: (row.company as string | null) ?? null,
    yoe: (row.yoe as number | null) ?? null,
    languages: (row.languages as string | null) ?? null,
    masaiHistory: Boolean(row.masai_history),
    mouStatus: (row.mou_status as string | null) ?? null,
    curriculumApprovalRating: (row.curriculum_approval_rating as string | null) ?? null,
    blacklisted: Boolean(row.blacklisted),
    remarks: (row.remarks as string | null) ?? null,
    availability: {
      mon: avail.mon ?? true,
      tue: avail.tue ?? true,
      wed: avail.wed ?? true,
      thu: avail.thu ?? true,
      fri: avail.fri ?? true,
      sat: avail.sat ?? true,
      sun: avail.sun ?? true,
    },
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/** Returns ISO date strings for Monday–Sunday of the current IST week. */
function getCurrentWeekDates(): Record<keyof EducatorAvailability, string> {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
  );
  const dow = now.getDay(); // 0 = Sunday
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dow + 6) % 7));

  const days: (keyof EducatorAvailability)[] = [
    "mon", "tue", "wed", "thu", "fri", "sat", "sun",
  ];

  return Object.fromEntries(
    days.map((day, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return [day, d.toISOString().slice(0, 10)];
    })
  ) as Record<keyof EducatorAvailability, string>;
}

/**
 * Given a set of sessions (name → Set<date>), compute which days an educator
 * is blocked in the current week.
 */
function computeCurrentWeekBlocked(
  educatorName: string,
  sessionsByName: Map<string, Set<string>>
): Partial<EducatorAvailability> {
  const weekDates = getCurrentWeekDates();
  const key = educatorName.trim().toLowerCase();
  const blocked = sessionsByName.get(key) ?? new Set<string>();
  const result: Partial<EducatorAvailability> = {};

  for (const [day, date] of Object.entries(weekDates) as [keyof EducatorAvailability, string][]) {
    if (blocked.has(date)) {
      result[day] = false;
    }
  }

  return result;
}

/**
 * Fetches the sessions for the current ISO week and returns a map of
 * lowercased instructor name → Set of blocked date strings.
 */
async function fetchCurrentWeekSessionMap(): Promise<Map<string, Set<string>>> {
  const supabase = createServerSupabase();
  const weekDates = getCurrentWeekDates();
  const dates = Object.values(weekDates);
  const from = dates[0];
  const to = dates[dates.length - 1];

  const { data, error } = await supabase
    .from("sessions")
    .select("instructor_name, date")
    .not("instructor_name", "is", null)
    .gte("date", from)
    .lte("date", to);

  if (error) throw new Error(error.message);

  const map = new Map<string, Set<string>>();
  for (const row of data ?? []) {
    if (!row.instructor_name || !row.date) continue;
    const key = (row.instructor_name as string).trim().toLowerCase();
    if (!map.has(key)) map.set(key, new Set());
    map.get(key)!.add(row.date as string);
  }

  return map;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function listEducators(
  filters: EducatorFilters = {}
): Promise<EducatorListResult> {
  const supabase = createServerSupabase();
  const {
    search,
    tier,
    instructorType,
    primaryDomain,
    mouStatus,
    blacklisted,
    availableDay,
    page = 1,
    pageSize = 50,
  } = filters;

  let query = supabase
    .from("educators")
    .select("*", { count: "exact" })
    .order("name", { ascending: true });

  if (search) {
    query = query.or(
      `name.ilike.%${search}%,email.ilike.%${search}%`
    );
  }
  if (tier) query = query.eq("tier", tier);
  if (instructorType) query = query.eq("instructor_type", instructorType);
  if (primaryDomain) query = query.eq("primary_domain", primaryDomain);
  if (mouStatus) query = query.eq("mou_status", mouStatus);
  if (blacklisted !== undefined) query = query.eq("blacklisted", blacklisted);

  if (availableDay) {
    query = query.eq(`availability->>${availableDay}`, "true");
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Record<string, unknown>[];
  const sessionMap = await fetchCurrentWeekSessionMap();

  const educators: EducatorListItem[] = rows.map((row) => {
    const educator = toEducator(row);
    return {
      ...educator,
      currentWeekBlocked: computeCurrentWeekBlocked(educator.name, sessionMap),
    };
  });

  return { educators, total: count ?? 0 };
}

export async function getEducator(id: string): Promise<EducatorWithStats | null> {
  const supabase = createServerSupabase();

  const { data, error } = await supabase
    .from("educators")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const educator = toEducator(data as Record<string, unknown>);

  // Live stats from sessions — match by name (case-insensitive)
  const { data: sessionRows, error: sessionsError } = await supabase
    .from("sessions")
    .select("date, rating")
    .ilike("instructor_name", educator.name)
    .order("date", { ascending: false });

  if (sessionsError) throw new Error(sessionsError.message);

  const allSessions = (sessionRows ?? []) as { date: string | null; rating: number | null }[];
  const ratedSessions = allSessions.filter((s) => s.rating != null);
  const ratings = ratedSessions.map((s) => s.rating as number);
  const last5Ratings = ratings.slice(0, 5);

  const stats: EducatorStats = {
    totalSessions: allSessions.length,
    overallAvgRating:
      ratings.length > 0
        ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100
        : null,
    last5AvgRating:
      last5Ratings.length > 0
        ? Math.round(
            (last5Ratings.reduce((a, b) => a + b, 0) / last5Ratings.length) * 100
          ) / 100
        : null,
    sessionsRated4_5Plus: ratings.filter((r) => r >= 4.5).length,
  };

  const sessionMap = await fetchCurrentWeekSessionMap();

  return {
    ...educator,
    stats,
    currentWeekBlocked: computeCurrentWeekBlocked(educator.name, sessionMap),
  };
}

export async function updateEducator(
  id: string,
  payload: EducatorUpdatePayload
): Promise<Educator> {
  const supabase = createServerSupabase();

  const dbPayload: Record<string, unknown> = {};
  if (payload.name !== undefined) dbPayload.name = payload.name;
  if (payload.phone !== undefined) dbPayload.phone = payload.phone;
  if (payload.linkedinUrl !== undefined) dbPayload.linkedin_url = payload.linkedinUrl;
  if (payload.tier !== undefined) dbPayload.tier = payload.tier;
  if (payload.instructorType !== undefined) dbPayload.instructor_type = payload.instructorType;
  if (payload.primaryDomain !== undefined) dbPayload.primary_domain = payload.primaryDomain;
  if (payload.secondaryDomain !== undefined) dbPayload.secondary_domain = payload.secondaryDomain;
  if (payload.company !== undefined) dbPayload.company = payload.company;
  if (payload.yoe !== undefined) dbPayload.yoe = payload.yoe;
  if (payload.languages !== undefined) dbPayload.languages = payload.languages;
  if (payload.masaiHistory !== undefined) dbPayload.masai_history = payload.masaiHistory;
  if (payload.mouStatus !== undefined) dbPayload.mou_status = payload.mouStatus;
  if (payload.curriculumApprovalRating !== undefined)
    dbPayload.curriculum_approval_rating = payload.curriculumApprovalRating;
  if (payload.blacklisted !== undefined) dbPayload.blacklisted = payload.blacklisted;
  if (payload.remarks !== undefined) dbPayload.remarks = payload.remarks;
  if (payload.availability !== undefined) dbPayload.availability = payload.availability;

  const { data, error } = await supabase
    .from("educators")
    .update(dbPayload)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return toEducator(data as Record<string, unknown>);
}

export async function getEducatorFilterOptions() {
  const supabase = createServerSupabase();

  const { data, error } = await supabase
    .from("educators")
    .select("tier, instructor_type, primary_domain, mou_status");

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as {
    tier: string | null;
    instructor_type: string | null;
    primary_domain: string | null;
    mou_status: string | null;
  }[];

  const unique = <T>(arr: (T | null | undefined)[]) =>
    [...new Set(arr.filter(Boolean))].sort() as T[];

  return {
    tiers: unique(rows.map((r) => r.tier)),
    instructorTypes: unique(rows.map((r) => r.instructor_type)),
    primaryDomains: unique(rows.map((r) => r.primary_domain)),
    mouStatuses: unique(rows.map((r) => r.mou_status)),
  };
}
