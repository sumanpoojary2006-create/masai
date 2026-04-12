"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { UserBatchConfigRecord } from "@/lib/types";

type SetupProfile = {
  email: string;
  lms_username: string;
  lms_password: string;
};

type BatchConfigInput = {
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

function emptyBatchConfig(): BatchConfigInput {
  return {
    batch_name: "",
    lecture_batch_url: "",
    assignment_batch_url: ""
  };
}

export function SetupProfileForm({
  initialProfile,
  initialBatchConfigs
}: {
  initialProfile: Partial<SetupProfile>;
  initialBatchConfigs: UserBatchConfigRecord[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<SetupProfile>({
    email: initialProfile.email ?? "",
    lms_username: initialProfile.lms_username ?? "",
    lms_password: initialProfile.lms_password ?? ""
  });
  const [batchConfigs, setBatchConfigs] = useState<BatchConfigInput[]>(
    initialBatchConfigs.length > 0
      ? initialBatchConfigs.map((config) => ({
          batch_name: config.batch_name ?? "",
          lecture_batch_url: config.lecture_batch_url ?? "",
          assignment_batch_url: config.assignment_batch_url ?? ""
        }))
      : [emptyBatchConfig()]
  );
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  function updateProfileField(field: keyof SetupProfile, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function updateBatchField(index: number, field: keyof BatchConfigInput, value: string) {
    setBatchConfigs((current) =>
      current.map((config, configIndex) =>
        configIndex === index
          ? {
              ...config,
              [field]: value
            }
          : config
      )
    );
  }

  function addBatchConfig() {
    setBatchConfigs((current) => [...current, emptyBatchConfig()]);
  }

  function removeBatchConfig(index: number) {
    setBatchConfigs((current) =>
      current.length === 1 ? [emptyBatchConfig()] : current.filter((_, configIndex) => configIndex !== index)
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setMessage(null);

    const normalizedBatchConfigs = batchConfigs
      .map((config) => ({
        batch_name: config.batch_name.trim(),
        lecture_batch_url: config.lecture_batch_url.trim(),
        assignment_batch_url:
          config.assignment_batch_url.trim() || deriveAssignmentUrl(config.lecture_batch_url.trim())
      }))
      .filter((config) => config.batch_name || config.lecture_batch_url || config.assignment_batch_url);

    const response = await fetch("/api/profile", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...form,
        batch_configs: normalizedBatchConfigs
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
          This setup is one-time. It connects your personal LMS access and all the batch-scoped LMS pages you want to manage with this login.
        </p>
      </div>

      <label className="flex flex-col gap-2 text-sm font-medium text-ink">
        LMS username
        <input
          type="text"
          required
          value={form.lms_username}
          onChange={(event) => updateProfileField("lms_username", event.target.value)}
          className="theme-input rounded-2xl px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
        />
      </label>

      <label className="flex flex-col gap-2 text-sm font-medium text-ink">
        LMS password
        <input
          type="password"
          required
          value={form.lms_password}
          onChange={(event) => updateProfileField("lms_password", event.target.value)}
          className="theme-input rounded-2xl px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
        />
      </label>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-[var(--font-heading)] text-lg font-semibold text-ink">
              Batch configurations
            </h3>
            <p className="theme-muted mt-1 text-sm">
              Add every batch this login should manage. Each batch needs its lecture and assignment LMS URLs.
            </p>
          </div>

          <button
            type="button"
            onClick={addBatchConfig}
            className="inline-flex h-10 items-center justify-center rounded-full border border-brand/30 px-4 text-sm font-semibold text-brand transition hover:bg-teal-50"
          >
            Add batch
          </button>
        </div>

        <div className="space-y-4">
          {batchConfigs.map((config, index) => {
            const suggestedAssignmentUrl =
              config.lecture_batch_url && !config.assignment_batch_url
                ? deriveAssignmentUrl(config.lecture_batch_url)
                : null;

            return (
              <section key={`${index}-${config.batch_name}`} className="theme-panel rounded-3xl border border-[var(--border-soft)] p-4 shadow-sm">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-brand">
                    Batch {index + 1}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeBatchConfig(index)}
                    className="inline-flex h-9 items-center justify-center rounded-full border border-slate-200 px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                  >
                    Remove
                  </button>
                </div>

                <div className="space-y-4">
                  <label className="flex flex-col gap-2 text-sm font-medium text-ink">
                    Batch name
                    <input
                      type="text"
                      required
                      value={config.batch_name}
                      onChange={(event) => updateBatchField(index, "batch_name", event.target.value)}
                      className="theme-input rounded-2xl px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
                    />
                  </label>

                  <label className="flex flex-col gap-2 text-sm font-medium text-ink">
                    Lecture batch URL
                    <input
                      type="url"
                      required
                      value={config.lecture_batch_url}
                      onChange={(event) =>
                        updateBatchField(index, "lecture_batch_url", event.target.value)
                      }
                      className="theme-input rounded-2xl px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
                    />
                  </label>

                  <label className="flex flex-col gap-2 text-sm font-medium text-ink">
                    Assignment batch URL
                    <input
                      type="url"
                      value={config.assignment_batch_url}
                      onChange={(event) =>
                        updateBatchField(index, "assignment_batch_url", event.target.value)
                      }
                      placeholder={suggestedAssignmentUrl ?? "Derived automatically if left blank"}
                      className="theme-input rounded-2xl px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
                    />
                  </label>
                </div>
              </section>
            );
          })}
        </div>
      </div>

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
