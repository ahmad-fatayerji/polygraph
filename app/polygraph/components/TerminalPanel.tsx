"use client";

import { useMemo, useState } from "react";
import { usePolygraphStore } from "../store";
import type { Diagnostic } from "@/lib/polygraph/types";

const severityStyles: Record<Diagnostic["severity"], string> = {
  error: "bg-[color:var(--severity-error-bg)] text-[color:var(--severity-error-text)]",
  warn: "bg-[color:var(--severity-warn-bg)] text-[color:var(--severity-warn-text)]",
  info: "bg-[color:var(--severity-info-bg)] text-[color:var(--severity-info-text)]",
};

export default function TerminalPanel({
  variant = "panel",
}: {
  variant?: "panel" | "embedded";
}) {
  const diagnostics = usePolygraphStore((state) => state.diagnostics);
  const selectActor = usePolygraphStore((state) => state.selectActor);
  const selectChannel = usePolygraphStore((state) => state.selectChannel);
  const [filters, setFilters] = useState({ error: true, warn: true, info: true });

  const filtered = useMemo(
    () => diagnostics.filter((diag) => filters[diag.severity]),
    [diagnostics, filters]
  );

  const toggleFilter = (key: keyof typeof filters) =>
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));

  const containerStyles =
    variant === "embedded"
      ? "flex h-full flex-col bg-transparent p-4"
      : "flex h-full flex-col rounded-2xl border border-[color:var(--panel-border)] bg-[color:var(--panel)] p-4 shadow-sm";

  return (
    <section className={containerStyles}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--foreground)]">Terminal</h2>
          <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--muted)]">
            Diagnostics and execution notes
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(["error", "warn", "info"] as const).map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => toggleFilter(level)}
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] transition ${
                filters[level]
                  ? "bg-[color:var(--accent)] text-[color:var(--accent-contrast)]"
                  : "bg-[color:var(--panel-muted)] text-[color:var(--muted)]"
              }`}
            >
              {level}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 min-h-[200px] flex-1 space-y-2 overflow-auto pr-2">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] p-4 text-sm text-[color:var(--muted)]">
            No diagnostics in the selected severity range.
          </div>
        ) : (
          filtered.map((diag, idx) => (
            <button
              key={`${diag.id}-${idx}`}
              type="button"
              onClick={() => {
                if (diag.where?.actorId) selectActor(diag.where.actorId);
                if (diag.where?.channelId) selectChannel(diag.where.channelId);
              }}
              className="flex w-full items-start justify-between gap-4 rounded-xl border border-[color:var(--panel-border)] bg-[color:var(--panel)] px-4 py-3 text-left transition hover:border-[color:var(--muted)]"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${
                      severityStyles[diag.severity]
                    }`}
                  >
                    {diag.severity}
                  </span>
                  <span className="text-xs font-semibold text-[color:var(--muted-strong)]">
                    {diag.id}
                  </span>
                </div>
                <p className="mt-2 text-sm text-[color:var(--foreground)]">{diag.message}</p>
                {diag.hint && (
                  <p className="mt-1 text-xs text-[color:var(--muted)]">Hint: {diag.hint}</p>
                )}
              </div>
              {diag.where && (
                <div className="text-xs text-[color:var(--muted)]">
                  {diag.where.actorId && <p>Actor: {diag.where.actorId}</p>}
                  {diag.where.channelId && <p>Channel: {diag.where.channelId}</p>}
                  {diag.where.field && <p>Field: {diag.where.field}</p>}
                </div>
              )}
            </button>
          ))
        )}
      </div>
    </section>
  );
}
