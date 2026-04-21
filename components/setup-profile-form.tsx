"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { UserBatchConfigRecord } from "@/lib/types";

type SetupProfile = {
  email: string;
  lms_username: string;
  lms_password: string;
  slack_member_id: string;
};

type BatchConfigInput = {
  batch_name: string;
  lecture_batch_url: string;
  assignment_batch_url: string;
  curriculum_file: File | null;
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
    assignment_batch_url: "",
    curriculum_file: null
  };
}

export function SetupProfileForm({
  initialProfile,
  initialBatchConfigs,
  curriculumCounts = {}
}: {
  initialProfile: Partial<SetupProfile>;
  initialBatchConfigs: UserBatchConfigRecord[];
  curriculumCounts?: Record<string, number>;
}) {
  const isEditingExistingProfile = initialBatchConfigs.length > 0;
  const router = useRouter();
  const [form, setForm] = useState<SetupProfile>({
    email: initialProfile.email ?? "",
    lms_username: initialProfile.lms_username ?? "",
    lms_password: initialProfile.lms_password ?? "",
    slack_member_id: initialProfile.slack_member_id ?? ""
  });
  const [batchConfigs, setBatchConfigs] = useState<BatchConfigInput[]>(
    initialBatchConfigs.length > 0
      ? initialBatchConfigs.map((config) => ({
          batch_name: config.batch_name ?? "",
          lecture_batch_url: config.lecture_batch_url ?? "",
          assignment_batch_url: config.assignment_batch_url ?? "",
          curriculum_file: null
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

  function updateBatchField(index: number, field: keyof BatchConfigInput, value: string | File | null) {
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
          config.assignment_batch_url.trim() || deriveAssignmentUrl(config.lecture_batch_url.trim()),
        curriculum_file: config.curriculum_file
      }))
      .filter((config) => config.batch_name || config.lecture_batch_url || config.assignment_batch_url);

    const formData = new FormData();
    formData.append("email", form.email);
    formData.append("lms_username", form.lms_username);
    formData.append("lms_password", form.lms_password);
    formData.append("slack_member_id", form.slack_member_id);

    const configsWithoutFiles = normalizedBatchConfigs.map((c) => ({
      batch_name: c.batch_name,
      lecture_batch_url: c.lecture_batch_url,
      assignment_batch_url: c.assignment_batch_url
    }));
    formData.append("batch_configs", JSON.stringify(configsWithoutFiles));

    normalizedBatchConfigs.forEach((config, i) => {
      if (config.curriculum_file) {
        formData.append(`curriculum_file_${i}`, config.curriculum_file);
      }
    });

    const response = await fetch("/api/profile", {
      method: "PUT",
      body: formData
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
          {isEditingExistingProfile ? "Update your profile" : "Complete your profile"}
        </h2>
        <p className="theme-muted mt-2 text-sm">
          {isEditingExistingProfile
            ? "You can update LMS credentials here anytime and add or revise batch-specific LMS URLs without affecting other users."
            : "This setup is one-time. It connects your personal LMS access and all the batch-scoped LMS pages you want to manage with this login."}
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

      <label className="flex flex-col gap-2 text-sm font-medium text-ink">
        Slack Member ID
        <input
          type="text"
          value={form.slack_member_id}
          onChange={(event) => updateProfileField("slack_member_id", event.target.value)}
          placeholder="e.g. U012AB3CD — found in your Slack profile"
          className="theme-input rounded-2xl px-4 py-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-teal-100"
        />
        <span className="theme-muted text-xs">
          Used to tag you in Slack notifications. In Slack: click your avatar → Profile → ⋯ → Copy member ID.
        </span>
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

                  <label className="flex flex-col gap-2 text-sm font-medium text-ink">
                    Curriculum File (Optional)
                    {curriculumCounts[config.batch_name] ? (
                      <div className="flex flex-col gap-2 rounded-xl bg-emerald-50 border border-emerald-200 p-3 dark:bg-emerald-950/30 dark:border-emerald-900/50">
                        <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                          <span className="text-lg">✓</span>
                          <span className="font-semibold text-sm">Curriculum saved ({curriculumCounts[config.batch_name]} lectures)</span>
                        </div>
                        <p className="text-xs text-emerald-600 dark:text-emerald-500">
                          To update or replace the existing curriculum, upload a new file below.
                        </p>
                      </div>
                    ) : null}
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={(event) =>
                        updateBatchField(index, "curriculum_file", event.target.files?.[0] ?? null)
                      }
                      className="file:mr-4 file:rounded-full file:border-0 file:bg-brand/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand hover:file:bg-brand/20 text-sm text-ink theme-input rounded-2xl px-4 py-2"
                    />
                    <span className="theme-muted text-xs font-normal">
                      Upload a CSV or Excel file containing the curriculum for this batch. 
                      The file <b>must</b> include a <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-pink-600 dark:text-pink-400 font-mono text-[10px]">lecture_name</code> column and a <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-pink-600 dark:text-pink-400 font-mono text-[10px]">learning_objective</code> column. (Alternative column names like <i>Topic Name</i>, <i>Title</i>, or <i>Objectives</i> are also supported).
                    </span>
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
        {isPending ? "Saving profile..." : isEditingExistingProfile ? "Save changes" : "Save and continue"}
      </button>
    </form>
  );
}
