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

export interface EducatorStats {
  totalSessions: number;
  overallAvgRating: number | null;
  last5AvgRating: number | null;
  sessionsRated4_5Plus: number;
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
  /** Days currently blocked by batch commitments (from Excel "Current" columns / future session assignments) */
  currentBlockedDays: Partial<EducatorAvailability>;
  /** Stats — from live session query if instructor_name is populated, else from sheet import cache */
  stats: EducatorStats;
  createdAt: string;
  updatedAt: string;
}

export interface EducatorListItem extends Educator {
  /** Current week: days that have a live session scheduled (overlaid on top of currentBlockedDays) */
  liveBlockedThisWeek: Partial<EducatorAvailability>;
}

export interface EducatorWithStats extends Educator {
  liveBlockedThisWeek: Partial<EducatorAvailability>;
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
    | "currentBlockedDays"
  >
>;

// ─── Raw JSONB shape ──────────────────────────────────────────────────────────

interface AvailabilityRaw {
  mon?: boolean;
  tue?: boolean;
  wed?: boolean;
  thu?: boolean;
  fri?: boolean;
  sat?: boolean;
  sun?: boolean;
  blocked?: Partial<Record<keyof EducatorAvailability, boolean>>;
  stats?: {
    totalSessions?: number;
    overallAvgRating?: number | null;
    last5AvgRating?: number | null;
    sessionsRated4_5Plus?: number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseAvailability(raw: AvailabilityRaw): EducatorAvailability {
  return {
    mon: raw.mon ?? true,
    tue: raw.tue ?? true,
    wed: raw.wed ?? true,
    thu: raw.thu ?? true,
    fri: raw.fri ?? true,
    sat: raw.sat ?? true,
    sun: raw.sun ?? true,
  };
}

function parseCurrentBlocked(raw: AvailabilityRaw): Partial<EducatorAvailability> {
  const b = raw.blocked ?? {};
  const result: Partial<EducatorAvailability> = {};
  for (const [day, val] of Object.entries(b)) {
    if (val === true) result[day as keyof EducatorAvailability] = false;
  }
  return result;
}

function parseCachedStats(raw: AvailabilityRaw): EducatorStats {
  const s = raw.stats ?? {};
  return {
    totalSessions: s.totalSessions ?? 0,
    overallAvgRating: s.overallAvgRating ?? null,
    last5AvgRating: s.last5AvgRating ?? null,
    sessionsRated4_5Plus: s.sessionsRated4_5Plus ?? 0,
  };
}

function toEducator(row: Record<string, unknown>): Educator {
  const raw = (row.availability ?? {}) as AvailabilityRaw;
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
    availability: parseAvailability(raw),
    currentBlockedDays: parseCurrentBlocked(raw),
    stats: parseCachedStats(raw),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/** Returns ISO date strings for Mon–Sun of the current IST week. */
function getCurrentWeekDates(): Record<keyof EducatorAvailability, string> {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
  );
  const dow = now.getDay();
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

/** Live session map: lowercased instructor name → Set of blocked date strings this week. */
async function fetchCurrentWeekSessionMap(): Promise<Map<string, Set<string>>> {
  const supabase = createServerSupabase();
  const weekDates = getCurrentWeekDates();
  const dates = Object.values(weekDates);

  const { data, error } = await supabase
    .from("sessions")
    .select("instructor_name, date")
    .not("instructor_name", "is", null)
    .gte("date", dates[0])
    .lte("date", dates[dates.length - 1]);

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

/** Returns which days have a live session this week for this educator. */
function computeLiveBlockedThisWeek(
  educatorName: string,
  sessionMap: Map<string, Set<string>>
): Partial<EducatorAvailability> {
  const weekDates = getCurrentWeekDates();
  const key = educatorName.trim().toLowerCase();
  const blocked = sessionMap.get(key) ?? new Set<string>();
  const result: Partial<EducatorAvailability> = {};

  for (const [day, date] of Object.entries(weekDates) as [keyof EducatorAvailability, string][]) {
    if (blocked.has(date)) result[day] = false;
  }
  return result;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function listEducators(
  filters: EducatorFilters = {}
): Promise<EducatorListResult> {
  const supabase = createServerSupabase();
  const {
    search, tier, instructorType, primaryDomain,
    mouStatus, blacklisted, availableDay,
    page = 1, pageSize = 50,
  } = filters;

  let query = supabase
    .from("educators")
    .select("*", { count: "exact" })
    .order("name", { ascending: true });

  if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
  if (tier) query = query.eq("tier", tier);
  if (instructorType) query = query.eq("instructor_type", instructorType);
  if (primaryDomain) query = query.eq("primary_domain", primaryDomain);
  if (mouStatus) query = query.eq("mou_status", mouStatus);
  if (blacklisted !== undefined) query = query.eq("blacklisted", blacklisted);
  if (availableDay) query = query.eq(`availability->>${availableDay}`, "true");

  const from = (page - 1) * pageSize;
  query = query.range(from, from + pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Record<string, unknown>[];
  const sessionMap = await fetchCurrentWeekSessionMap();

  const educators: EducatorListItem[] = rows.map((row) => {
    const educator = toEducator(row);
    return {
      ...educator,
      liveBlockedThisWeek: computeLiveBlockedThisWeek(educator.name, sessionMap),
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

  // Try live stats from sessions (works once instructor_name gets populated)
  const { data: sessionRows } = await supabase
    .from("sessions")
    .select("date, rating")
    .ilike("instructor_name", educator.name)
    .order("date", { ascending: false });

  const sessionMap = await fetchCurrentWeekSessionMap();
  const liveBlockedThisWeek = computeLiveBlockedThisWeek(educator.name, sessionMap);

  if (sessionRows && sessionRows.length > 0) {
    const allSessions = sessionRows as { date: string | null; rating: number | null }[];
    const ratings = allSessions.filter((s) => s.rating != null).map((s) => s.rating as number);
    const last5 = ratings.slice(0, 5);

    const liveStats: EducatorStats = {
      totalSessions: allSessions.length,
      overallAvgRating: ratings.length > 0
        ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100
        : null,
      last5AvgRating: last5.length > 0
        ? Math.round((last5.reduce((a, b) => a + b, 0) / last5.length) * 100) / 100
        : null,
      sessionsRated4_5Plus: ratings.filter((r) => r >= 4.5).length,
    };

    return { ...educator, stats: liveStats, liveBlockedThisWeek };
  }

  // Fall back to sheet-imported stats
  return { ...educator, liveBlockedThisWeek };
}

export async function updateEducator(
  id: string,
  payload: EducatorUpdatePayload
): Promise<Educator> {
  const supabase = createServerSupabase();

  // For availability and currentBlockedDays, we need to merge into the JSONB
  // First fetch current availability JSONB to preserve stats sub-object
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

  // If availability or currentBlockedDays changed, merge into the JSONB
  if (payload.availability !== undefined || payload.currentBlockedDays !== undefined) {
    const { data: current } = await supabase
      .from("educators")
      .select("availability")
      .eq("id", id)
      .single();

    const existing = (current?.availability ?? {}) as AvailabilityRaw;

    const newBlocked: Record<string, boolean> = {};
    const blockedSource = payload.currentBlockedDays ?? parseCurrentBlocked(existing);
    for (const [day, val] of Object.entries(blockedSource)) {
      // val=false means blocked (inverted from availability), val=true means free
      // In our schema: blocked[day]=true means blocked on that day
      newBlocked[day] = val === false;
    }

    dbPayload.availability = {
      ...(payload.availability ?? parseAvailability(existing)),
      blocked: newBlocked,
      stats: existing.stats ?? {},
    };
  }

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
