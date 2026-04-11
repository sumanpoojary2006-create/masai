"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type SetupProfile = {
  email: string;
  lms_username: string;
  lms_password: string;
  batch_name: string;
  lecture_batch_url: string;
  assignment_batch_url: string;
};

function deriveAssignmentUrl(url: string) {
  try {
    const parsed = new URL(url);
    parsed.pathname = parsed.pathname.replace("/lectures/", "/assignment/");
    return parsed.toString();
  } catch {
    return url.replace("/lectures/", "/assignment/");
  }
}

export function SetupProfileForm({
  initialProfile
}: {
  initialProfile: Partial<SetupProfile>;
}) {
  const router = useRouter();
  const [form, setForm] = useState<SetupProfile>({
    email: initialProfile.email ?? "",
    lms_username: initialProfile.lms_username ?? "",
    lms_password: initialProfile.lms_password ?? "",
    batch_name: initialProfile.batch_name ?? "",
    lecture_batch_url: initialProfile.lecture_batch_url ?? "",
    assignment_batch_url: initialProfile.assignment_batch_url ?? ""
  });
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const suggestedAssignmentUrl = useMemo(
    () =>
      form.lecture_batch_url && !form.assignment_batch_url
        ? deriveAssignmentUrl(form.lecture_batch_url)
        : null,
    [form.assignment_batch_url, form.lecture_batch_url]
  );

  function updateField(field: keyof SetupProfile, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setMessage(null);

    const response = await fetch("/api/profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...form,
        assignment_batch_url: form.assignment_batch_url || suggestedAssignmentUrl
      })
    });

    const payload = (await response.json()) as { message?: string };

    if (!response.ok) {
      setMessage(payload.message ?? "Unable to save your profile.");
      setIsPending(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <h2 className="font-[var(--font-heading)] text-2xl font-bold text-ink">
          Complete your profile
        </h2>
        <p className="theme-muted mt-2 text-sm">
          This setup is one-time. It connects your personal LMS access and your batch’s scoped LMS pages.
        </p>
      </div>

      <label className="flex flex-col gap-2 text-sm font-medium text-ink">
        LMS username
        <input
          type="text"
          required
          value={form.lms_username}
          onChange={(event) => updateField("lms_username", event.target.value)}
          className="theme-input rounded-2xl px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
        />
      </label>

      <label className="flex flex-col gap-2 text-sm font-medium text-ink">
        LMS password
        <input
          type="password"
          required
          value={form.lms_password}
          onChange={(event) => updateField("lms_password", event.target.value)}
          className="theme-input rounded-2xl px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
        />
      </label>

      <label className="flex flex-col gap-2 text-sm font-medium text-ink">
        Batch name
        <input
          type="text"
          required
          value={form.batch_name}
          onChange={(event) => updateField("batch_name", event.target.value)}
          className="theme-input rounded-2xl px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
        />
      </label>

      <label className="flex flex-col gap-2 text-sm font-medium text-ink">
        Lecture batch URL
        <input
          type="url"
          required
          value={form.lecture_batch_url}
          onChange={(event) => updateField("lecture_batch_url", event.target.value)}
          className="theme-input rounded-2xl px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
        />
      </label>

      <label className="flex flex-col gap-2 text-sm font-medium text-ink">
        Assignment batch URL
        <input
          type="url"
          value={form.assignment_batch_url}
          onChange={(event) => updateField("assignment_batch_url", event.target.value)}
          placeholder={suggestedAssignmentUrl ?? "Derived automatically if left blank"}
          className="theme-input rounded-2xl px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
        />
      </label>

      {message ? <p className="theme-error rounded-2xl px-4 py-3 text-sm">{message}</p> : null}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-11 w-full items-center justify-center rounded-full bg-ink px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {isPending ? "Saving profile..." : "Save and continue"}
      </button>
    </form>
  );
}
