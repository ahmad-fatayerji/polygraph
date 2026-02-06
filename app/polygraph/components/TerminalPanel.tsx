"use client";

import { useMemo, useState } from "react";
import { usePolygraphStore } from "../store";
import type { Diagnostic } from "@/lib/polygraph/types";

const codeTitles: Record<string, string> = {
  E_PARSE_RATIONAL: "Invalid Number Format",
  E_RATE_SIGN: "Incorrect Rate Sign",
  E_RATE_INTEGER_RULE: "Non-Integer Rate Violation",
  E_INIT_INVALID: "Invalid Initial Tokens",
  E_REF_MISSING: "Missing Reference",
  E_TOPOLOGY_INVALID: "Structural Error",
  E_INCONSISTENT: "Inconsistent Model",
  E_NOT_LIVE: "Deadlock Detected",
  W_DISCONNECTED_GRAPH: "Disconnected Graph",
  W_UNUSED_ACTOR: "Unused Actor",
  I_VALID_MODEL: "Validation Passed",
  I_CONSISTENT: "Consistency Confirmed",
  I_LIVE: "Liveness Confirmed",
};

const severityLabel: Record<Diagnostic["severity"], string> = {
  error: "Error",
  warn: "Warning",
  info: "Info",
};

const severityStyles: Record<Diagnostic["severity"], string> = {
  error:
    "bg-[color:var(--severity-error-bg)] text-[color:var(--severity-error-text)]",
  warn: "bg-[color:var(--severity-warn-bg)] text-[color:var(--severity-warn-text)]",
  info: "bg-[color:var(--severity-info-bg)] text-[color:var(--severity-info-text)]",
};

const severityBorder: Record<Diagnostic["severity"], string> = {
  error: "border-l-[color:var(--severity-error-text)]",
  warn: "border-l-[color:var(--severity-warn-text)]",
  info: "border-l-[color:var(--severity-info-text)]",
};

const locationLabel = (where: Diagnostic["where"]) => {
  if (!where) return null;
  const parts: string[] = [];
  if (where.actorId) parts.push(`Actor "${where.actorId}"`);
  if (where.channelId) parts.push(`Channel "${where.channelId}"`);
  if (where.field) parts.push(`field: ${where.field}`);
  return parts.length > 0 ? parts.join(" · ") : null;
};

export default function TerminalPanel({
  variant = "panel",
}: {
  variant?: "panel" | "embedded";
}) {
  const diagnostics = usePolygraphStore((state) => state.diagnostics);
  const selectActor = usePolygraphStore((state) => state.selectActor);
  const selectChannel = usePolygraphStore((state) => state.selectChannel);
  const clearDiagnostics = usePolygraphStore((state) => state.clearDiagnostics);
  const [filters, setFilters] = useState({
    error: true,
    warn: true,
    info: true,
  });

  const filtered = useMemo(
    () => diagnostics.filter((diag) => filters[diag.severity]),
    [diagnostics, filters],
  );

  const counts = useMemo(() => {
    const c = { error: 0, warn: 0, info: 0 };
    diagnostics.forEach((d) => {
      c[d.severity] += 1;
    });
    return c;
  }, [diagnostics]);

  const toggleFilter = (key: keyof typeof filters) =>
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));

  const containerStyles =
    variant === "embedded"
      ? "flex h-full min-h-0 flex-col bg-transparent p-4"
      : "flex h-full min-h-0 flex-col rounded-2xl border border-[color:var(--panel-border)] bg-[color:var(--panel)] p-4 shadow-sm";

  return (
    <section className={containerStyles}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--foreground)]">
            Terminal
          </h2>
          <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--muted)]">
            Diagnostics and execution notes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={clearDiagnostics}
            className="rounded-full border border-[color:var(--panel-border)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--muted-strong)] transition hover:border-[color:var(--muted)]"
          >
            Clear
          </button>
          {(["error", "warn", "info"] as const).map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => toggleFilter(level)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] transition ${
                filters[level]
                  ? "bg-[color:var(--accent)] text-[color:var(--accent-contrast)]"
                  : "bg-[color:var(--panel-muted)] text-[color:var(--muted)]"
              }`}
            >
              <span>{severityLabel[level]}</span>
              {counts[level] > 0 && (
                <span className="ml-0.5 tabular-nums">({counts[level]})</span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-auto pr-2">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] p-4 text-sm text-[color:var(--muted)]">
            {diagnostics.length === 0
              ? "No diagnostics yet. Click Validate or Execute to check your model."
              : "No diagnostics match the active filters. Toggle the buttons above to see results."}
          </div>
        ) : (
          filtered.map((diag, idx) => {
            const title = codeTitles[diag.id] ?? diag.id;
            const loc = locationLabel(diag.where);
            const isClickable = !!(
              diag.where?.actorId || diag.where?.channelId
            );

            return (
              <button
                key={`${diag.id}-${idx}`}
                type="button"
                onClick={() => {
                  if (diag.where?.actorId) selectActor(diag.where.actorId);
                  if (diag.where?.channelId)
                    selectChannel(diag.where.channelId);
                }}
                className={`flex w-full flex-col gap-2 rounded-xl border border-[color:var(--panel-border)] border-l-[3px] ${
                  severityBorder[diag.severity]
                } bg-[color:var(--panel)] px-4 py-3 text-left transition hover:border-[color:var(--muted)] ${
                  isClickable ? "cursor-pointer" : "cursor-default"
                }`}
              >
                {/* Row 1: severity badge + human-readable title + location */}
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] ${
                      severityStyles[diag.severity]
                    }`}
                  >
                    {severityLabel[diag.severity]}
                  </span>
                  <span className="text-xs font-semibold text-[color:var(--foreground)]">
                    {title}
                  </span>
                  {loc && (
                    <span className="ml-auto rounded-md bg-[color:var(--panel-muted)] px-2 py-0.5 text-[11px] text-[color:var(--muted)] whitespace-nowrap">
                      {loc}
                    </span>
                  )}
                </div>

                {/* Row 2: message */}
                <p className="text-sm leading-relaxed text-[color:var(--foreground)]">
                  {diag.message}
                </p>

                {/* Row 3: hint */}
                {diag.hint && (
                  <p className="flex items-start gap-1.5 rounded-lg bg-[color:var(--panel-muted)] px-3 py-2 text-xs leading-relaxed text-[color:var(--muted-strong)]">
                    <span className="mt-px shrink-0 font-bold">Tip:</span>
                    <span>{diag.hint}</span>
                  </p>
                )}

                {/* Row 4: code identifier */}
                <span className="text-[10px] font-mono tracking-wide text-[color:var(--muted)] opacity-60">
                  {diag.id}
                </span>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
