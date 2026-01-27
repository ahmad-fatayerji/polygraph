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
      <div className="rounded-2xl border border-dashed border-neutral-200 bg-white/70 p-4 text-sm text-neutral-500">
        Run Execute to generate a witness schedule.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {schedule.map((entry) => (
        <div
          key={`tick-${entry.tick}`}
          className="rounded-xl border border-neutral-200 bg-white/70 px-4 py-3"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-neutral-500">
              Tick {entry.tick}
            </p>
            <span className="text-[11px] text-neutral-400">
              {entry.fires.length} fires
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {entry.fires.length === 0 ? (
              <span className="text-sm text-neutral-400">No firings</span>
            ) : (
              entry.fires.map((actorId, idx) => (
                <span
                  key={`${actorId}-${idx}`}
                  className="rounded-full bg-neutral-900/10 px-3 py-1 text-xs font-semibold text-neutral-700"
                >
                  {actorLabels.get(actorId) ?? actorId}
                </span>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
