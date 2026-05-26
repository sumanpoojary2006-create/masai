"use client";

import { useEffect, useState } from "react";
import { Spinner, ErrorBox, SectionTitle } from "./shared";

type ProgramRow = { program: string; ticketCount: number };
type ConfigRow  = { program: string; domain: string };

const DOMAINS = ["Data", "Software", "Business", "Operations", "Other"];

const DOMAIN_COLORS: Record<string, string> = {
  Data: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  Software: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  Business: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  Operations: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  Other: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  "": "bg-zinc-800 text-zinc-500 border-zinc-700",
};

export function DomainConfig() {
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/admin/support-tickets/tab?tab=programs").then((r) => r.json()),
      fetch("/api/admin/support-tickets/domain-config").then((r) => r.json()),
    ])
      .then(([progs, configs]: [ProgramRow[], ConfigRow[]]) => {
        setPrograms(progs ?? []);
        const map: Record<string, string> = {};
        for (const c of configs ?? []) map[c.program] = c.domain;
        setMappings(map);
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
            .map(([program, domain]) => ({ program, domain })),
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

  function setDomain(program: string, domain: string) {
    setMappings((prev) => ({ ...prev, [program]: domain }));
  }

  if (loading) return <Spinner />;
  if (error) return <ErrorBox msg={error} />;

  const unmapped = programs.filter((p) => !mappings[p.program]);
  const mapped   = programs.filter((p) =>  mappings[p.program]);

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <SectionTitle>Domain Mapping Configuration</SectionTitle>
        <p className="text-sm text-zinc-400 mb-6">
          Map each batch program to a domain. This drives all domain-level dashboards
          (Domain WoW, Domain MoM, TAT by Domain). Programs with no mapping appear as "Unassigned".
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
                <th className="text-left px-4 py-3">Program</th>
                <th className="text-right px-4 py-3">Tickets (2026)</th>
                <th className="text-left px-4 py-3 w-72">Domain</th>
              </tr>
            </thead>
            <tbody>
              {programs.map((prog) => {
                const current = mappings[prog.program] ?? "";
                return (
                  <tr key={prog.program} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20">
                    <td className="px-4 py-3 font-medium text-zinc-200">{prog.program}</td>
                    <td className="px-4 py-3 text-right text-zinc-400">{prog.ticketCount.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5 flex-wrap">
                        {DOMAINS.map((d) => (
                          <button
                            key={d}
                            onClick={() => setDomain(prog.program, current === d ? "" : d)}
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
              const count = programs.filter((p) => mappings[p.program] === domain).length;
              if (!count) return null;
              return (
                <span
                  key={domain}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${DOMAIN_COLORS[domain]}`}
                >
                  {domain}: {count} program{count !== 1 ? "s" : ""}
                </span>
              );
            })}
            {unmapped.length > 0 && (
              <span className="px-3 py-1.5 rounded-lg text-xs font-medium border bg-zinc-800 text-zinc-400 border-zinc-700">
                Unassigned: {unmapped.length} program{unmapped.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
