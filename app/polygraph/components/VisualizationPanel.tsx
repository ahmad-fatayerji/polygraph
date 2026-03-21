"use client";

import { useEffect, useRef, useState } from "react";
import { usePolygraphStore } from "../store";
import PolygraphGraphView, {
  type PolygraphGraphViewHandle,
} from "./PolygraphGraphView";
import ScheduleView from "./ScheduleView";
import TokenTraceView from "./TokenTraceView";
import DetailedTraceView, {
  type DetailedTraceViewHandle,
} from "./DetailedTraceView";
import WorstCasePathView from "./WorstCasePathView";

export default function VisualizationPanel() {
  const model = usePolygraphStore((state) => state.model);
  const executionModel = usePolygraphStore((state) => state.executionModel);
  const execution = usePolygraphStore((state) => state.execution);
  const hasExecutionModel = Boolean(executionModel);
  const renderModel = executionModel;
  const hasDetailedTrace = Boolean(execution?.artifacts?.detailedTrace?.length);

  const [viewMode, setViewMode] = useState<"summary" | "detailed">("summary");
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<PolygraphGraphViewHandle | null>(null);
  const traceRef = useRef<DetailedTraceViewHandle | null>(null);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(e.target as Node)
      )
        setExportMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [exportMenuOpen]);

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col gap-4 px-4 pb-4">
      <div className="flex shrink-0 items-center justify-between">
        {/* Summary / Detailed toggle */}
        <div>
          {execution?.ok && (
            <div className="flex rounded-lg border border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] p-0.5">
              <button
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  viewMode === "summary"
                    ? "bg-[color:var(--chip)] text-[color:var(--chip-text)]"
                    : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
                }`}
                onClick={() => setViewMode("summary")}
              >
                Summary
              </button>
              <button
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  viewMode === "detailed"
                    ? "bg-[color:var(--chip)] text-[color:var(--chip-text)]"
                    : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
                }`}
                onClick={() => setViewMode("detailed")}
              >
                Detailed
              </button>
            </div>
          )}
        </div>

        {/* Unified Export dropdown */}
        <div className="relative" ref={exportMenuRef}>
          <button
            type="button"
            disabled={!hasExecutionModel || isExporting}
            onClick={() => setExportMenuOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-full border border-[color:var(--panel-border)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--muted-strong)] transition hover:border-[color:var(--muted)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isExporting ? (
              <>
                <svg
                  className="h-3 w-3 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"
                  />
                </svg>
                Exporting…
              </>
            ) : (
              <>
                Export
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 10 6"
                  fill="currentColor"
                  className="h-2.5 w-2.5"
                >
                  <path d="M0 0l5 6 5-6z" />
                </svg>
              </>
            )}
          </button>

          {exportMenuOpen && (
            <div className="absolute right-0 top-full z-20 mt-1.5 min-w-[220px] overflow-hidden rounded-xl border border-[color:var(--panel-border)] bg-[color:var(--panel)] shadow-lg">
              {/* Graph */}
              <p className="px-3 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[color:var(--muted)]">
                Graph
              </p>
              {(["svg", "png", "jpg"] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => {
                    graphRef.current?.exportAs(fmt);
                    setExportMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-sm text-[color:var(--foreground)] transition-colors hover:bg-[color:var(--panel-muted)]"
                >
                  <span>Visual graph</span>
                  <span className="rounded border border-[color:var(--panel-border)] px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-[color:var(--muted)]">
                    {fmt}
                  </span>
                </button>
              ))}

              <div className="mx-3 my-1 border-t border-[color:var(--panel-border)]" />

              {/* Trace */}
              <p className="px-3 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[color:var(--muted)]">
                Execution Trace
              </p>
              {(
                [
                  {
                    label: "Trace table",
                    fmt: "svg",
                    action: () => traceRef.current?.exportSvg(),
                  },
                  {
                    label: "Trace table",
                    fmt: "png",
                    action: async () => {
                      setIsExporting(true);
                      try {
                        await traceRef.current?.exportPng();
                      } finally {
                        setIsExporting(false);
                      }
                    },
                  },
                  {
                    label: "Trace table",
                    fmt: "csv",
                    action: () => traceRef.current?.exportCsv(),
                  },
                ] as const
              ).map(({ label, fmt, action }) => (
                <button
                  key={fmt}
                  type="button"
                  disabled={!hasDetailedTrace}
                  onClick={() => {
                    action();
                    setExportMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-sm text-[color:var(--foreground)] transition-colors hover:bg-[color:var(--panel-muted)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span>{label}</span>
                  <span className="rounded border border-[color:var(--panel-border)] px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-[color:var(--muted)]">
                    {fmt}
                  </span>
                </button>
              ))}
              {!hasDetailedTrace ? (
                <p className="px-3 pb-2 text-[10px] text-[color:var(--muted)]">
                  Enable Full trace before Execute to export the detailed table.
                </p>
              ) : null}

              <div className="mx-3 my-1 border-t border-[color:var(--panel-border)]" />

              {/* Both */}
              <button
                type="button"
                onClick={() => {
                  graphRef.current?.exportAs("png");
                  traceRef.current?.exportCsv();
                  setExportMenuOpen(false);
                }}
                className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-semibold text-[color:var(--foreground)] transition-colors hover:bg-[color:var(--panel-muted)]"
              >
                <span>Both</span>
                <span className="text-[10px] text-[color:var(--muted)]">
                  Graph PNG + Trace CSV
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-auto pr-2">
        <div className="min-h-0 shrink-0">
          <h3 className="mb-3 text-sm font-semibold text-[color:var(--muted-strong)]">
            PolyGraph
          </h3>
          {hasExecutionModel && renderModel ? (
            <PolygraphGraphView ref={graphRef} model={renderModel} />
          ) : (
            <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] p-4 text-sm text-[color:var(--muted)]">
              Run Execute to compile a PolyGraph render.
            </div>
          )}
        </div>

        {viewMode === "summary" ? (
          <>
            <div className="min-h-0 shrink-0">
              <h3 className="mb-3 text-sm font-semibold text-[color:var(--muted-strong)]">
                Schedule
              </h3>
              <ScheduleView
                execution={execution}
                model={renderModel ?? model}
              />
            </div>
            <div className="min-h-0 shrink-0">
              <h3 className="mb-3 text-sm font-semibold text-[color:var(--muted-strong)]">
                Token Trace
              </h3>
              <TokenTraceView
                execution={execution}
                model={renderModel ?? model}
              />
            </div>
            <div className="min-h-0 shrink-0">
              <h3 className="mb-3 text-sm font-semibold text-[color:var(--muted-strong)]">
                End-to-End Response Bound
              </h3>
              <WorstCasePathView
                execution={execution}
                model={renderModel ?? model}
              />
            </div>
          </>
        ) : (
          <div className="min-h-0 shrink-0">
            <h3 className="mb-3 text-sm font-semibold text-[color:var(--muted-strong)]">
              Detailed Execution Trace
            </h3>
            <DetailedTraceView
              ref={traceRef}
              execution={execution}
              model={renderModel ?? model}
            />
          </div>
        )}
      </div>
    </section>
  );
}
