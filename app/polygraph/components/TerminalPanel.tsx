"use client";

import { useMemo, useState } from "react";
import { usePolygraphStore } from "../store";
import type { Diagnostic } from "@/lib/polygraph/types";

const severityStyles: Record<Diagnostic["severity"], string> = {
  error: "bg-red-100 text-red-800",
  warn: "bg-amber-100 text-amber-800",
  info: "bg-blue-100 text-blue-800",
};

export default function TerminalPanel() {
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

  return (
    <section className="rounded-[28px] border border-neutral-200 bg-white/80 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Terminal</h2>
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
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
                  ? "bg-neutral-900 text-white"
                  : "bg-neutral-100 text-neutral-500"
              }`}
            >
              {level}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 max-h-[220px] space-y-2 overflow-auto pr-2">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-200 p-4 text-sm text-neutral-500">
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
              className="flex w-full items-start justify-between gap-4 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left transition hover:border-neutral-300"
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
                  <span className="text-xs font-semibold text-neutral-600">{diag.id}</span>
                </div>
                <p className="mt-2 text-sm text-neutral-800">{diag.message}</p>
                {diag.hint && (
                  <p className="mt-1 text-xs text-neutral-500">Hint: {diag.hint}</p>
                )}
              </div>
              {diag.where && (
                <div className="text-xs text-neutral-400">
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
