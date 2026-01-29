"use client";

import { usePolygraphStore } from "../store";
import ScheduleView from "./ScheduleView";
import TokenTraceView from "./TokenTraceView";

export default function VisualizationPanel() {
  const model = usePolygraphStore((state) => state.model);
  const execution = usePolygraphStore((state) => state.execution);

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col gap-4 px-4 pb-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[color:var(--foreground)]">
          Results
        </h2>
      </div>
      <div className="grid min-h-0 flex-1 gap-4">
        <div className="min-h-0">
          <h3 className="mb-2 text-sm font-semibold text-[color:var(--muted-strong)]">
            Schedule
          </h3>
          <ScheduleView execution={execution} model={model} />
        </div>
        <div className="min-h-0">
          <h3 className="mb-2 text-sm font-semibold text-[color:var(--muted-strong)]">
            Token Trace
          </h3>
          <TokenTraceView execution={execution} model={model} />
        </div>
      </div>
    </section>
  );
}
