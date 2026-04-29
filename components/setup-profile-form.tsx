"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SetupProfileForm({
  initialDisplayName = "",
  initialSlackMemberId = "",
}: {
  initialDisplayName?: string;
  initialSlackMemberId?: string;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [slackMemberId, setSlackMemberId] = useState(initialSlackMemberId);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsPending(true);
    setMessage(null);

    const formData = new FormData();
    formData.append("display_name", displayName);
    formData.append("slack_member_id", slackMemberId);

    const res = await fetch("/api/profile", { method: "PUT", body: formData });
    const payload = (await res.json()) as { message?: string };

    if (!res.ok) {
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
          Your batches will be assigned by the Admin. Just set up your name and Slack ID.
        </p>
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-semibold text-ink">Display Name</span>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your name"
          className="theme-input w-full"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-semibold text-ink">Slack Member ID</span>
        <input
          type="text"
          value={slackMemberId}
          onChange={(e) => setSlackMemberId(e.target.value)}
          placeholder="e.g. U0123ABCDEF"
          className="theme-input w-full"
        />
        <p className="theme-muted text-xs">
          Used for Slack reminders. Find it in your Slack profile → More → Copy member ID.
        </p>
      </label>

      {message && (
        <p className="theme-error rounded-2xl p-3 text-sm">{message}</p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="theme-button-primary w-full"
      >
        {isPending ? "Saving…" : "Save and continue"}
      </button>
    </form>
  );
}
