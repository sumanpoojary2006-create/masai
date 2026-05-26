"use client";

import { useEffect, useState } from "react";
import { Spinner, ErrorBox, SectionTitle } from "./shared";

type BatchRow  = { batchName: string; ticketCount: number };
type ConfigRow = { batch_name: string; domain: string };

const DOMAINS = ["Software", "Data", "Non-tech"];

const DOMAIN_COLORS: Record<string, string> = {
  Software:  "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  Data:      "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  "Non-tech": "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "":        "bg-zinc-800 text-zinc-500 border-zinc-700",
};

export function DomainConfig() {
  const [batches, setBatches]   = useState<BatchRow[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [saved, setSaved]       = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/admin/support-tickets/tab?tab=batches").then((r) => r.json()),
      fetch("/api/admin/support-tickets/domain-config").then((r) => r.json()),
    ])
      .then(([batchList, configs]) => {
        if (!Array.isArray(batchList)) {
          setError((batchList as { error?: string })?.error ?? "Failed to load batch list. Check MySQL connection.");
          return;
        }
        setBatches(batchList as BatchRow[]);
        if (Array.isArray(configs)) {
          const map: Record<string, string> = {};
          for (const c of configs as ConfigRow[]) map[c.batch_name] = c.domain;
          setMappings(map);
        } else if ((configs as { error?: string })?.error) {
          // Table may not be migrated yet — show warning but still allow mapping
          setError(`Supabase error: ${(configs as { error: string }).error}. Run the support-tickets-schema.sql migration.`);
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/support-tickets/domain-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mappings: Object.entries(mappings)
            .filter(([, domain]) => domain)
            .map(([batch_name, domain]) => ({ batch_name, domain })),
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  function setDomain(batchName: string, domain: string) {
    setMappings((prev) => ({ ...prev, [batchName]: domain }));
  }

  if (loading) return <Spinner />;
  if (error) return <ErrorBox msg={error} />;

  const unmapped = batches.filter((b) => !mappings[b.batchName]);
  const mapped   = batches.filter((b) =>  mappings[b.batchName]);

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <SectionTitle>Domain Mapping Configuration</SectionTitle>
        <p className="text-sm text-zinc-400 mb-6">
          Map each batch to a domain. This drives all domain-level dashboards
          (Domain WoW, Domain MoM, TAT by Domain). Batches with no mapping appear as "Unassigned".
        </p>

        {unmapped.length > 0 && (
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs text-amber-400 font-medium">{unmapped.length} unmapped</span>
            <span className="text-xs text-zinc-600">—</span>
            <span className="text-xs text-zinc-500">assign a domain to include them in domain dashboards</span>
          </div>
        )}

        <div className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase">
                <th className="text-left px-4 py-3">Batch ID</th>
                <th className="text-right px-4 py-3">Tickets (2026)</th>
                <th className="text-left px-4 py-3 w-64">Domain</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => {
                const current = mappings[batch.batchName] ?? "";
                return (
                  <tr key={batch.batchName} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20">
                    <td className="px-4 py-3 font-mono text-sm text-zinc-200">{batch.batchName}</td>
                    <td className="px-4 py-3 text-right text-zinc-400">{batch.ticketCount.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5 flex-wrap">
                        {DOMAINS.map((d) => (
                          <button
                            key={d}
                            onClick={() => setDomain(batch.batchName, current === d ? "" : d)}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${
                              current === d
                                ? DOMAIN_COLORS[d]
                                : "bg-zinc-800 text-zinc-500 border-zinc-700 hover:text-zinc-300"
                            }`}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-4">
        <button
          onClick={save}
          disabled={saving}
          className="px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-medium text-white transition-colors"
        >
          {saving ? "Saving…" : "Save Domain Mappings"}
        </button>
        {saved && (
          <span className="text-sm text-emerald-400 font-medium">Saved successfully</span>
        )}
      </div>

      {/* Summary of current mappings */}
      {Object.keys(mappings).length > 0 && (
        <div>
          <SectionTitle>Current Mappings</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {DOMAINS.map((domain) => {
              const count = batches.filter((b) => mappings[b.batchName] === domain).length;
              if (!count) return null;
              return (
                <span
                  key={domain}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${DOMAIN_COLORS[domain]}`}
                >
                  {domain}: {count} batch{count !== 1 ? "es" : ""}
                </span>
              );
            })}
            {unmapped.length > 0 && (
              <span className="px-3 py-1.5 rounded-lg text-xs font-medium border bg-zinc-800 text-zinc-400 border-zinc-700">
                Unassigned: {unmapped.length} batch{unmapped.length !== 1 ? "es" : ""}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
