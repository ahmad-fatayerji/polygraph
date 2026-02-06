"use client";

import { usePolygraphStore } from "../store";
import PolygraphGraphView from "./PolygraphGraphView";
import ScheduleView from "./ScheduleView";
import TokenTraceView from "./TokenTraceView";

export default function VisualizationPanel() {
  const model = usePolygraphStore((state) => state.model);
  const executionModel = usePolygraphStore((state) => state.executionModel);
  const execution = usePolygraphStore((state) => state.execution);
  const hasExecutionModel = Boolean(executionModel);
  const renderModel = executionModel;

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col gap-4 px-4 pb-4">
      <div className="flex shrink-0 items-center justify-between">
        <h2 className="text-lg font-semibold text-[color:var(--foreground)]">
          Results
        </h2>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-auto pr-2">
        <div className="min-h-0 shrink-0">
          <h3 className="mb-3 text-sm font-semibold text-[color:var(--muted-strong)]">
            PolyGraph
          </h3>
          {hasExecutionModel && renderModel ? (
            <PolygraphGraphView model={renderModel} />
          ) : (
            <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] p-4 text-sm text-[color:var(--muted)]">
              Run Execute to compile a PolyGraph render.
            </div>
          )}
        </div>
        <div className="min-h-0 shrink-0">
          <h3 className="mb-3 text-sm font-semibold text-[color:var(--muted-strong)]">
            Schedule
          </h3>
          <ScheduleView execution={execution} model={renderModel ?? model} />
        </div>
        <div className="min-h-0 shrink-0">
          <h3 className="mb-3 text-sm font-semibold text-[color:var(--muted-strong)]">
            Token Trace
          </h3>
          <TokenTraceView execution={execution} model={renderModel ?? model} />
        </div>
      </div>
    </section>
  );
}
