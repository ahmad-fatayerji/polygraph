"use client";

import type { ExecutionResult, PolyGraphModel } from "@/lib/polygraph/types";
import { parseRational } from "@/lib/polygraph/rational";

const formatDuration = (raw: string) => {
  const parsed = parseRational(raw);
  if (!parsed.ok) return `${raw} ms`;

  const approx =
    Number(parsed.value.n) / Number(parsed.value.d);
  if (!Number.isFinite(approx)) return `${raw} ms`;
  if (parsed.value.d === 1n) return `${raw} ms`;

  return `${raw} ms (${approx.toFixed(2)} ms)`;
};

export default function WorstCasePathView({
  execution,
  model,
}: {
  execution?: ExecutionResult;
  model: PolyGraphModel;
}) {
  const worstCasePath = execution?.artifacts?.worstCasePath;

  if (!worstCasePath) {
    return (
      <div className="rounded-2xl border border-dashed border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] p-4 text-sm text-[color:var(--muted)]">
        Worst-case path appears after execution succeeds.
      </div>
    );
  }

  const labelById = new Map(
    model.actors.map((actor) => [actor.id, actor.label ?? actor.id])
  );
  const actorById = new Map(model.actors.map((actor) => [actor.id, actor]));

  return (
    <div className="rounded-xl border border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] p-4">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--muted-strong)]">
            End-to-End Response Bound
          </p>
          <p className="mt-1 text-sm font-semibold text-[color:var(--foreground)]">
            {formatDuration(worstCasePath.duration)}
          </p>
          <p className="mt-1 text-[11px] text-[color:var(--muted)]">
            Source release to sink completion on the witness schedule.
          </p>
        </div>
        <p className="text-[10px] text-[color:var(--muted)]">
          {worstCasePath.pathsAnalyzed} path
          {worstCasePath.pathsAnalyzed !== 1 ? "s" : ""} analysed
          {worstCasePath.truncated ? " (capped)" : ""}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {worstCasePath.path.map((actorId, index) => {
          const actor = actorById.get(actorId);
          return (
            <span key={`${actorId}-${index}`} className="flex items-center gap-1.5">
              <span className="rounded-lg bg-[color:var(--panel)] px-2 py-1 text-xs font-semibold text-[color:var(--foreground)]">
                {labelById.get(actorId) ?? actorId}
              </span>
              {actor?.executionTime != null &&
              String(actor.executionTime).trim() !== "" ? (
                <span className="text-[10px] text-[color:var(--muted)]">
                  {String(actor.executionTime)} ms
                </span>
              ) : null}
              {index < worstCasePath.path.length - 1 ? (
                <span className="text-[color:var(--muted)]">&rarr;</span>
              ) : null}
            </span>
          );
        })}
      </div>

      {worstCasePath.rankedPaths.length > 1 ? (
        <div className="mt-4 grid gap-2">
          {worstCasePath.rankedPaths.slice(0, 5).map((entry, index) => (
            <div
              key={`${entry.path.join("->")}-${index}`}
              className={`rounded-lg border px-3 py-2 ${
                index === 0
                  ? "border-[color:var(--accent)] bg-[color:var(--panel)]"
                  : "border-[color:var(--panel-border)] bg-[color:var(--panel)]"
              }`}
            >
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">
                  Path #{index + 1}
                </span>
                <span className="text-xs font-semibold text-[color:var(--foreground)]">
                  {formatDuration(entry.duration)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1 text-[11px] text-[color:var(--muted-strong)]">
                {entry.path.map((actorId, actorIndex) => (
                  <span key={`${actorId}-${actorIndex}`} className="flex items-center gap-1">
                    <span>{labelById.get(actorId) ?? actorId}</span>
                    {actorIndex < entry.path.length - 1 ? (
                      <span className="text-[color:var(--muted)]">&rarr;</span>
                    ) : null}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
