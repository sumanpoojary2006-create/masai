'use client'

import { useEffect, useState } from "react";
import type { EducatorAvailability, EducatorWithStats } from "@/lib/educators";

const DAYS: { key: keyof EducatorAvailability; label: string; full: string }[] = [
  { key: "mon", label: "Mon", full: "Monday" },
  { key: "tue", label: "Tue", full: "Tuesday" },
  { key: "wed", label: "Wed", full: "Wednesday" },
  { key: "thu", label: "Thu", full: "Thursday" },
  { key: "fri", label: "Fri", full: "Friday" },
  { key: "sat", label: "Sat", full: "Saturday" },
  { key: "sun", label: "Sun", full: "Sunday" },
];

const TIERS = ["Tier 1", "Tier 2", "Tier 3", "Tier 4"];
const INSTRUCTOR_TYPES = ["Teaching Assistant", "Industry Mentor", "Academic Professor"];
const MOU_STATUSES = [
  "MoU Signed",
  "MOU Expired",
  "Hired By Curriculum & MoU Not Signed",
];
const APPROVAL_RATINGS = ["Strong Hire", "Hire", "Old Hire", "Weak Hire"];
const DOMAINS = [
  "AI-ML-DS",
  "Analytics",
  "Cloud & DevOps",
  "Cyber Security",
  "Digital Marketing",
  "Entrepreneurship / Leadership",
  "Finance",
  "Gen AI / Applied AI",
  "Maths",
  "Others",
  "Product Management",
  "Project Management",
  "Software Engineering",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mouColor(status: string | null) {
  if (status === "MoU Signed") return "text-emerald-300 bg-emerald-500/15 border-emerald-500/30";
  if (status === "MOU Expired") return "text-rose-300 bg-rose-500/15 border-rose-500/30";
  if (status === "Hired By Curriculum & MoU Not Signed")
    return "text-amber-300 bg-amber-500/15 border-amber-500/30";
  return "text-slate-400 bg-slate-800/60 border-slate-700";
}

function ratingColor(r: number | null) {
  if (r == null) return "text-slate-500";
  if (r >= 4.5) return "text-emerald-300";
  if (r >= 4.0) return "text-cyan-300";
  if (r >= 3.5) return "text-amber-300";
  return "text-rose-300";
}

function InfoField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-[18px] border border-slate-800/80 bg-slate-900/70 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <div className="mt-2 text-sm font-medium text-slate-100">{value || "—"}</div>
    </div>
  );
}

function EditableField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-[14px] border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/20"
      />
    </div>
  );
}

function EditableSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-[14px] border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/20"
      >
        <option value="">{placeholder ?? `— Select —`}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function EducatorProfileClient({ educatorId }: { educatorId: string }) {
  const [data, setData] = useState<EducatorWithStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<EducatorWithStats>>({});

  useEffect(() => {
    setLoading(true);
    fetch(`/api/batch-details/educators/${educatorId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        setData(d as EducatorWithStats);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load educator.");
        setLoading(false);
      });
  }, [educatorId]);

  function startEdit() {
    if (!data) return;
    setForm({ ...data });
    setEditing(true);
    setSaveError(null);
  }

  function cancelEdit() {
    setEditing(false);
    setForm({});
    setSaveError(null);
  }

  async function saveEdit() {
    if (!data || !form) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/batch-details/educators/${educatorId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          linkedinUrl: form.linkedinUrl,
          tier: form.tier,
          instructorType: form.instructorType,
          primaryDomain: form.primaryDomain,
          secondaryDomain: form.secondaryDomain,
          company: form.company,
          yoe: form.yoe,
          languages: form.languages,
          masaiHistory: form.masaiHistory,
          mouStatus: form.mouStatus,
          curriculumApprovalRating: form.curriculumApprovalRating,
          blacklisted: form.blacklisted,
          remarks: form.remarks,
          availability: form.availability,
        }),
      });
      const updated = await res.json();
      if (!res.ok) throw new Error((updated as { message?: string }).message ?? "Save failed");
      setData((prev) => prev ? { ...prev, ...updated } : prev);
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-[24px] border border-rose-500/25 bg-rose-500/10 p-6 text-rose-200">
        {error ?? "Educator not found."}
      </div>
    );
  }

  const d = editing ? (form as EducatorWithStats) : data;

  return (
    <div className="space-y-6 text-slate-200">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-[28px] border border-slate-800/90 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_26%),radial-gradient(circle_at_right,rgba(16,185,129,0.14),transparent_28%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(4,9,18,0.98))] p-6 shadow-[0_30px_80px_rgba(2,6,23,0.44)] lg:flex-row lg:items-start lg:justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <a
              href="/batch-details/educators"
              className="text-xs text-slate-500 transition hover:text-slate-300"
            >
              ← Educators
            </a>
            {data.blacklisted && (
              <span className="rounded-full border border-rose-500/30 bg-rose-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-rose-300">
                Blacklisted
              </span>
            )}
          </div>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-white">{data.name}</h2>
          <p className="mt-1 text-sm text-slate-400">{data.email}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {data.tier && (
              <span className="rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-0.5 text-xs font-semibold text-slate-300">
                {data.tier}
              </span>
            )}
            {data.instructorType && (
              <span className="rounded-full border border-slate-700 bg-slate-800/60 px-2.5 py-0.5 text-xs font-semibold text-slate-300">
                {data.instructorType}
              </span>
            )}
            {data.primaryDomain && (
              <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-xs font-semibold text-cyan-300">
                {data.primaryDomain}
              </span>
            )}
            {data.mouStatus && (
              <span
                className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${mouColor(data.mouStatus)}`}
              >
                {data.mouStatus === "Hired By Curriculum & MoU Not Signed"
                  ? "Hired, No MoU"
                  : data.mouStatus}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {editing ? (
            <>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={saving}
                className="inline-flex h-10 items-center rounded-full border border-slate-700 bg-slate-900/80 px-4 text-sm font-medium text-slate-300 transition hover:border-slate-600 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={saving}
                className="inline-flex h-10 items-center rounded-full border border-cyan-400/40 bg-cyan-500/15 px-5 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-500/25 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={startEdit}
              className="inline-flex h-10 items-center rounded-full border border-slate-700 bg-slate-900/80 px-4 text-sm font-medium text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200"
            >
              Edit Profile
            </button>
          )}
        </div>
      </div>

      {saveError && (
        <div className="rounded-[18px] border border-rose-500/25 bg-rose-500/10 px-5 py-3 text-sm text-rose-300">
          {saveError}
        </div>
      )}

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Total Sessions",
            value: data.stats.totalSessions,
            accent: "bg-cyan-400",
            note: "Sessions in the DB matching this educator",
          },
          {
            label: "Overall Avg Rating",
            value: data.stats.overallAvgRating != null ? data.stats.overallAvgRating.toFixed(2) : "—",
            accent: "bg-emerald-400",
            note: "Average across all rated sessions",
            valueClass: ratingColor(data.stats.overallAvgRating),
          },
          {
            label: "Last 5 Avg Rating",
            value: data.stats.last5AvgRating != null ? data.stats.last5AvgRating.toFixed(2) : "—",
            accent: "bg-violet-400",
            note: "Average of the 5 most recent rated sessions",
            valueClass: ratingColor(data.stats.last5AvgRating),
          },
          {
            label: "Sessions ≥ 4.5",
            value: data.stats.sessionsRated4_5Plus,
            accent: "bg-amber-300",
            note: "Sessions rated 4.5 or above",
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-[22px] border border-slate-800/80 bg-slate-950/80 p-5 shadow-[0_18px_48px_rgba(2,6,23,0.28)]"
          >
            <div className={`mb-4 h-1.5 w-16 rounded-full ${card.accent}`} />
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              {card.label}
            </p>
            <p className={`mt-3 text-3xl font-semibold tracking-tight ${card.valueClass ?? "text-white"}`}>
              {card.value}
            </p>
            <p className="mt-2 text-xs text-slate-500">{card.note}</p>
          </div>
        ))}
      </div>

      {/* Main grid */}
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        {/* Left: Profile Fields */}
        <div className="space-y-5">
          {editing ? (
            <div className="rounded-[26px] border border-slate-800/90 bg-slate-950/75 p-6 shadow-[0_18px_48px_rgba(2,6,23,0.28)]">
              <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Edit Profile
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <EditableField
                  label="Name"
                  value={form.name ?? ""}
                  onChange={(v) => setForm((f) => ({ ...f, name: v }))}
                />
                <EditableField
                  label="Phone"
                  value={form.phone ?? ""}
                  onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
                />
                <EditableField
                  label="LinkedIn URL"
                  value={form.linkedinUrl ?? ""}
                  onChange={(v) => setForm((f) => ({ ...f, linkedinUrl: v }))}
                />
                <EditableField
                  label="Company / Institute"
                  value={form.company ?? ""}
                  onChange={(v) => setForm((f) => ({ ...f, company: v }))}
                />
                <EditableField
                  label="YOE (Years of Experience)"
                  value={form.yoe != null ? String(form.yoe) : ""}
                  onChange={(v) => setForm((f) => ({ ...f, yoe: v ? Number(v) : null }))}
                  type="number"
                />
                <EditableField
                  label="Languages"
                  value={form.languages ?? ""}
                  onChange={(v) => setForm((f) => ({ ...f, languages: v }))}
                />
                <EditableSelect
                  label="Tier"
                  value={form.tier ?? ""}
                  onChange={(v) => setForm((f) => ({ ...f, tier: v || null }))}
                  options={TIERS}
                />
                <EditableSelect
                  label="Instructor Type"
                  value={form.instructorType ?? ""}
                  onChange={(v) => setForm((f) => ({ ...f, instructorType: v || null }))}
                  options={INSTRUCTOR_TYPES}
                />
                <EditableSelect
                  label="Primary Domain"
                  value={form.primaryDomain ?? ""}
                  onChange={(v) => setForm((f) => ({ ...f, primaryDomain: v || null }))}
                  options={DOMAINS}
                />
                <EditableSelect
                  label="Secondary Domain"
                  value={form.secondaryDomain ?? ""}
                  onChange={(v) => setForm((f) => ({ ...f, secondaryDomain: v || null }))}
                  options={DOMAINS}
                />
                <EditableSelect
                  label="MoU Status"
                  value={form.mouStatus ?? ""}
                  onChange={(v) => setForm((f) => ({ ...f, mouStatus: v || null }))}
                  options={MOU_STATUSES}
                />
                <EditableSelect
                  label="Curriculum Approval Rating"
                  value={form.curriculumApprovalRating ?? ""}
                  onChange={(v) => setForm((f) => ({ ...f, curriculumApprovalRating: v || null }))}
                  options={APPROVAL_RATINGS}
                />
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Masai History
                  </label>
                  <div className="flex gap-3">
                    {[true, false].map((v) => (
                      <button
                        key={String(v)}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, masaiHistory: v }))}
                        className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                          form.masaiHistory === v
                            ? "border-cyan-400/30 bg-cyan-500/15 text-cyan-200"
                            : "border-slate-700 bg-slate-900/80 text-slate-400 hover:border-slate-600"
                        }`}
                      >
                        {v ? "Yes" : "No"}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Blacklisted
                  </label>
                  <div className="flex gap-3">
                    {[false, true].map((v) => (
                      <button
                        key={String(v)}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, blacklisted: v }))}
                        className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                          form.blacklisted === v
                            ? v
                              ? "border-rose-500/30 bg-rose-500/15 text-rose-200"
                              : "border-emerald-500/30 bg-emerald-500/15 text-emerald-200"
                            : "border-slate-700 bg-slate-900/80 text-slate-400 hover:border-slate-600"
                        }`}
                      >
                        {v ? "Yes — Blacklist" : "No"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Remarks
                  </label>
                  <textarea
                    value={form.remarks ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
                    rows={3}
                    className="w-full rounded-[14px] border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/20"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-[26px] border border-slate-800/90 bg-slate-950/75 p-6 shadow-[0_18px_48px_rgba(2,6,23,0.28)]">
              <p className="mb-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Profile Details
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <InfoField label="Phone" value={d.phone} />
                <InfoField label="Company / Institute" value={d.company} />
                <InfoField label="YOE" value={d.yoe != null ? `${d.yoe} years` : null} />
                <InfoField label="Languages" value={d.languages} />
                <InfoField label="Masai History" value={d.masaiHistory ? "Yes" : "No"} />
                <InfoField label="Curriculum Approval Rating" value={d.curriculumApprovalRating} />
                {d.linkedinUrl && (
                  <InfoField
                    label="LinkedIn"
                    value={
                      <a
                        href={d.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-300 underline-offset-2 hover:underline"
                      >
                        View Profile ↗
                      </a>
                    }
                  />
                )}
                <InfoField label="Secondary Domain" value={d.secondaryDomain} />
                {d.remarks && (
                  <div className="sm:col-span-2">
                    <InfoField label="Remarks" value={d.remarks} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: Availability */}
        <div className="space-y-5">
          {/* General availability */}
          <div className="rounded-[26px] border border-slate-800/90 bg-slate-950/75 p-5 shadow-[0_18px_48px_rgba(2,6,23,0.28)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              General Availability
            </p>
            <p className="mt-1 text-xs text-slate-600">Declared by educator — what days they're free</p>
            <div className="mt-4 grid grid-cols-7 gap-1.5">
              {DAYS.map(({ key, label, full }) => {
                const isAvailable = editing
                  ? Boolean((form.availability ?? d.availability)[key])
                  : Boolean(d.availability[key]);
                return (
                  <button
                    key={key}
                    type="button"
                    title={full}
                    disabled={!editing}
                    onClick={() => {
                      if (!editing) return;
                      setForm((f) => ({
                        ...f,
                        availability: {
                          ...(f.availability ?? d.availability),
                          [key]: !isAvailable,
                        },
                      }));
                    }}
                    className={`flex flex-col items-center gap-1 rounded-[14px] border py-3 transition ${
                      isAvailable
                        ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-200"
                        : "border-slate-700 bg-slate-900/60 text-slate-600"
                    } ${editing ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
                  >
                    <span className="text-xs font-bold">{label}</span>
                    <span className="text-[10px]">{isAvailable ? "✓" : "✗"}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Current week availability */}
          <div className="rounded-[26px] border border-slate-800/90 bg-slate-950/75 p-5 shadow-[0_18px_48px_rgba(2,6,23,0.28)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              This Week
            </p>
            <p className="mt-1 text-xs text-slate-600">Live — based on sessions assigned this week</p>
            <div className="mt-4 grid grid-cols-7 gap-1.5">
              {DAYS.map(({ key, label, full }) => {
                const isUnavailable = !data.availability[key];
                const isBlocked = Boolean(data.currentWeekBlocked[key]);
                const status = isUnavailable ? "unavail" : isBlocked ? "blocked" : "free";
                const styles = {
                  unavail: "border-slate-800 bg-slate-900/40 text-slate-700",
                  blocked: "border-rose-500/30 bg-rose-500/15 text-rose-300",
                  free: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
                };
                const icons = { unavail: "—", blocked: "●", free: "✓" };
                return (
                  <div
                    key={key}
                    title={`${full}: ${status === "unavail" ? "Generally unavailable" : status === "blocked" ? "Has session(s) this week" : "Free"}`}
                    className={`flex flex-col items-center gap-1 rounded-[14px] border py-3 ${styles[status]}`}
                  >
                    <span className="text-xs font-bold">{label}</span>
                    <span className="text-[11px]">{icons[status]}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-slate-600">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Free
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-rose-500" /> Blocked (has session)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-slate-700" /> Unavailable
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
