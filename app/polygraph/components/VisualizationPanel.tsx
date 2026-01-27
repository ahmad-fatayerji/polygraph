"use client";

import { usePolygraphStore } from "../store";
import ScheduleView from "./ScheduleView";
import TokenTraceView from "./TokenTraceView";

export default function VisualizationPanel() {
  const model = usePolygraphStore((state) => state.model);
  const execution = usePolygraphStore((state) => state.execution);

  return (
    <section className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-900">Visualization</h2>
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
          Schedule + Tokens
        </div>
      </div>
      <div className="grid flex-1 gap-4">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-neutral-700">Schedule</h3>
          <ScheduleView execution={execution} model={model} />
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-neutral-700">Token Trace</h3>
          <TokenTraceView execution={execution} model={model} />
        </div>
      </div>
    </section>
  );
}
