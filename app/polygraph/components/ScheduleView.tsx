"use client";

import type { ExecutionResult, PolyGraphModel } from "@/lib/polygraph/types";

export default function ScheduleView({
  execution,
  model,
}: {
  execution?: ExecutionResult;
  model: PolyGraphModel;
}) {
  const schedule = execution?.artifacts?.schedule ?? [];
  const actorLabels = new Map(model.actors.map((actor) => [actor.id, actor.label ?? actor.id]));

  if (!execution?.artifacts?.schedule) {
    return (
      <div className="rounded-2xl border border-dashed border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] p-4 text-sm text-[color:var(--muted)]">
        Run Execute to generate a witness schedule.
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-2">
      <p className="text-xs text-[color:var(--muted)]">
        Showing active ticks only.
      </p>
      {schedule.map((entry) => (
        <div
          key={`tick-${entry.tick}`}
          className="rounded-xl border border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] px-4 py-3"
        >
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
              Tick {entry.tick}
            </p>
            <span className="shrink-0 text-[11px] text-[color:var(--muted)]">
              {entry.fires.length} fires
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {entry.fires.map((actorId, idx) => (
              <span
                key={`${actorId}-${idx}`}
                className="rounded-full bg-[color:var(--chip)] px-3 py-1 text-xs font-semibold text-[color:var(--chip-text)]"
              >
                {actorLabels.get(actorId) ?? actorId}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
