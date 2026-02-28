"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Diagnostic,
  ExecutionResult,
  PolyGraphModel,
} from "@/lib/polygraph/types";
import Toolbar from "./components/Toolbar";
import EditorPanel from "./components/EditorPanel";
import VisualizationPanel from "./components/VisualizationPanel";
import TerminalPanel from "./components/TerminalPanel";
import { usePolygraphStore } from "./store";

const isRenderableModel = (value: unknown): value is PolyGraphModel =>
  Boolean(value) &&
  typeof value === "object" &&
  Array.isArray((value as PolyGraphModel).actors) &&
  Array.isArray((value as PolyGraphModel).channels) &&
  (value as PolyGraphModel).actors.every(
    (actor) => typeof actor?.id === "string" && actor.id.trim().length > 0,
  ) &&
  (value as PolyGraphModel).channels.every(
    (channel) =>
      typeof channel?.id === "string" &&
      channel.id.trim().length > 0 &&
      typeof channel.src === "string" &&
      typeof channel.dst === "string",
  );

export default function PolygraphWorkspace() {
  const jsonText = usePolygraphStore((state) => state.jsonText);
  const setDiagnostics = usePolygraphStore((state) => state.setDiagnostics);
  const setExecution = usePolygraphStore((state) => state.setExecution);
  const setExecutionModel = usePolygraphStore(
    (state) => state.setExecutionModel,
  );
  const setModel = usePolygraphStore((state) => state.setModel);
  const reset = usePolygraphStore((state) => state.reset);

  const workerRef = useRef<Worker | null>(null);
  const pendingRunRef = useRef<"validate" | "execute" | null>(null);
  const lastExecutionModelRef = useRef<PolyGraphModel | null>(null);
  const [status, setStatus] = useState<"idle" | "running">("idle");
  const [terminalHeight, setTerminalHeight] = useState(280);
  const [editorWidthPx, setEditorWidthPx] = useState<number | null>(null);
  const splitRef = useRef<HTMLDivElement | null>(null);
  const splitDragRef = useRef<{
    left: number;
    min: number;
    max: number;
  } | null>(null);
  const splitHandleWidth = 8;
  const minEditorWidth = 500;
  const minResultWidth = 280;
  const dragStateRef = useRef<{ startY: number; startHeight: number } | null>(
    null,
  );

  useEffect(() => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<ExecutionResult>) => {
      const result = event.data;
      setDiagnostics(result.diagnostics);
      if (pendingRunRef.current === "execute") {
        const hasArtifacts = Boolean(result.artifacts);
        setExecution(hasArtifacts ? result : undefined);
        setExecutionModel(
          hasArtifacts
            ? (lastExecutionModelRef.current ?? undefined)
            : undefined,
        );
      }
      pendingRunRef.current = null;
      setStatus("idle");
    };

    worker.onerror = () => {
      setDiagnostics([
        {
          id: "E_TOPOLOGY_INVALID",
          severity: "error",
          message: "Worker execution failed.",
        },
      ]);
      if (pendingRunRef.current === "execute") {
        setExecution(undefined);
        setExecutionModel(undefined);
      }
      pendingRunRef.current = null;
      setStatus("idle");
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [setDiagnostics, setExecution, setExecutionModel]);

  useEffect(() => {
    document.documentElement.dataset.theme = "light";
    document.documentElement.style.colorScheme = "light";
  }, []);

  useEffect(() => {
    const updateHeight = (clientY: number) => {
      if (!dragStateRef.current) return;
      const delta = dragStateRef.current.startY - clientY;
      const minHeight = 200;
      const maxHeight = Math.max(
        minHeight,
        Math.round(window.innerHeight * 0.55),
      );
      const nextHeight = dragStateRef.current.startHeight + delta;
      setTerminalHeight(Math.min(maxHeight, Math.max(minHeight, nextHeight)));
    };

    const handlePointerMove = (event: PointerEvent) =>
      updateHeight(event.clientY);
    const handleMouseMove = (event: MouseEvent) => updateHeight(event.clientY);

    const stopDrag = () => {
      if (dragStateRef.current) {
        dragStateRef.current = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopDrag);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopDrag);
    };
  }, []);

  useEffect(() => {
    const updateWidth = (clientX: number) => {
      if (!splitDragRef.current) return;
      const next = clientX - splitDragRef.current.left;
      const clamped = Math.min(
        splitDragRef.current.max,
        Math.max(splitDragRef.current.min, next),
      );
      setEditorWidthPx(clamped);
    };

    const handlePointerMove = (event: PointerEvent) =>
      updateWidth(event.clientX);

    const stopDrag = () => {
      if (splitDragRef.current) {
        splitDragRef.current = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
    };
  }, []);

  useEffect(() => {
    if (!splitRef.current) return;
    const updateInitial = () => {
      if (!splitRef.current) return;
      const rect = splitRef.current.getBoundingClientRect();
      const maxEditor = Math.max(
        minEditorWidth,
        rect.width - minResultWidth - splitHandleWidth,
      );
      setEditorWidthPx((prev) => {
        const fallback = Math.round(rect.width * 0.55);
        const next = prev ?? fallback;
        return Math.min(maxEditor, Math.max(minEditorWidth, next));
      });
    };

    updateInitial();
    const observer = new ResizeObserver(updateInitial);
    observer.observe(splitRef.current);
    return () => observer.disconnect();
  }, [splitHandleWidth]);

  const runVerification = useCallback(
    (computeExecution: boolean) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        const diagnostics: Diagnostic[] = [
          {
            id: "E_TOPOLOGY_INVALID",
            severity: "error",
            message: "JSON parse error: unable to parse the model.",
          },
        ];
        setDiagnostics(diagnostics);
        setStatus("idle");
        return;
      }

      if (!isRenderableModel(parsed)) {
        setDiagnostics([
          {
            id: "E_TOPOLOGY_INVALID",
            severity: "error",
            message:
              "Model must include actors/channels arrays with string ids and endpoints.",
          },
        ]);
        setStatus("idle");
        return;
      }

      const model = parsed as PolyGraphModel;
      if (computeExecution) {
        setExecution(undefined);
        lastExecutionModelRef.current = model;
      }
      setModel(model, "json");

      if (!workerRef.current) {
        setDiagnostics([
          {
            id: "E_TOPOLOGY_INVALID",
            severity: "error",
            message: "Verifier worker is not available.",
          },
        ]);
        pendingRunRef.current = null;
        setStatus("idle");
        return;
      }

      pendingRunRef.current = computeExecution ? "execute" : "validate";
      setStatus("running");
      workerRef.current.postMessage({
        model,
        options: { computeExecution },
      });
    },
    [jsonText, setDiagnostics, setExecution, setExecutionModel, setModel],
  );

  return (
    <div className="h-[100dvh] overflow-hidden bg-transparent p-2 text-[color:var(--foreground)]">
      <div
        className="grid h-full min-h-0 gap-0"
        style={{ gridTemplateRows: `minmax(0, 1fr) 12px ${terminalHeight}px` }}
      >
        <main
          className="animate-float-in min-h-0 overflow-hidden rounded-2xl border border-[color:var(--panel-border)] bg-[color:var(--panel)] shadow-sm"
          style={{ animationDelay: "40ms" }}
        >
          <div
            ref={splitRef}
            className="flex h-full min-h-0 flex-col lg:flex-row"
          >
            <div
              className="h-full min-h-0 min-w-0 overflow-hidden"
              style={{
                width: editorWidthPx ? `${editorWidthPx}px` : "55%",
                flex: "0 0 auto",
              }}
            >
              <div className="flex h-full min-h-0 flex-col border-b border-[color:var(--panel-border)] pt-4 lg:border-b-0 lg:border-r-0">
                <div className="mb-4 px-4">
                  <Toolbar
                    onValidate={() => runVerification(false)}
                    onExecute={() => runVerification(true)}
                    onReset={reset}
                    status={status}
                  />
                  {status === "running" && (
                    <p className="mt-3 text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">
                      Verifying... running in worker
                    </p>
                  )}
                </div>
                <div className="min-h-0 flex-1">
                  <EditorPanel />
                </div>
              </div>
            </div>
            <div
              className="hidden cursor-col-resize bg-[color:var(--panel-border)] lg:block"
              onPointerDown={(event) => {
                event.preventDefault();
                if (event.currentTarget.setPointerCapture) {
                  event.currentTarget.setPointerCapture(event.pointerId);
                }
                if (!splitRef.current) return;
                const rect = splitRef.current.getBoundingClientRect();
                const maxEditor = Math.max(
                  minEditorWidth,
                  rect.width - minResultWidth - splitHandleWidth,
                );
                splitDragRef.current = {
                  left: rect.left,
                  min: minEditorWidth,
                  max: maxEditor,
                };
                setEditorWidthPx(
                  (prev) => prev ?? Math.round(rect.width * 0.55),
                );
                document.body.style.cursor = "col-resize";
                document.body.style.userSelect = "none";
              }}
              style={{ width: splitHandleWidth }}
              role="separator"
              aria-label="Resize editor panel"
              aria-orientation="vertical"
            />
            <div className="h-full min-h-0 min-w-0 flex-1 border-t border-[color:var(--panel-border)] lg:border-t-0">
              <div className="h-full min-h-0 pt-4">
                <VisualizationPanel />
              </div>
            </div>
          </div>
        </main>
        <div
          className="cursor-row-resize touch-none bg-[color:var(--panel-border)]"
          onPointerDown={(event) => {
            event.preventDefault();
            if (event.currentTarget.setPointerCapture) {
              event.currentTarget.setPointerCapture(event.pointerId);
            }
            dragStateRef.current = {
              startY: event.clientY,
              startHeight: terminalHeight,
            };
            document.body.style.cursor = "row-resize";
            document.body.style.userSelect = "none";
          }}
          role="separator"
          aria-label="Resize terminal"
          aria-orientation="horizontal"
        />
        <div className="animate-float-in min-h-0 overflow-hidden rounded-2xl border border-[color:var(--panel-border)] bg-[color:var(--panel)] shadow-sm">
          <TerminalPanel variant="embedded" />
        </div>
      </div>
    </div>
  );
}
