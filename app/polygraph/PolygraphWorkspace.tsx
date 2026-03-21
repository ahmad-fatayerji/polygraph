"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Diagnostic,
  ExecutionResult,
  PolyGraphModel,
  WorkerResponse,
} from "@/lib/polygraph/types";
import Toolbar from "./components/Toolbar";
import EditorPanel from "./components/EditorPanel";
import VisualizationPanel from "./components/VisualizationPanel";
import TerminalPanel from "./components/TerminalPanel";
import { usePolygraphStore } from "./store";

type Tab = "editor" | "results" | "diagnostics";

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
  const applyJsonText = usePolygraphStore((state) => state.applyJsonText);
  const setDiagnostics = usePolygraphStore((state) => state.setDiagnostics);
  const setExecution = usePolygraphStore((state) => state.setExecution);
  const setExecutionModel = usePolygraphStore(
    (state) => state.setExecutionModel,
  );
  const setModel = usePolygraphStore((state) => state.setModel);
  const reset = usePolygraphStore((state) => state.reset);

  const workerRef = useRef<Worker | null>(null);
  const pendingRunRef = useRef<
    "validate" | "execute" | "optimize-dephasing" | null
  >(null);
  const lastExecutionModelRef = useRef<PolyGraphModel | null>(null);
  const [status, setStatus] = useState<"idle" | "running">("idle");
  const [cycles, setCycles] = useState(1);
  const [captureDetailedTrace, setCaptureDetailedTrace] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("editor");
  const [terminalSeen, setTerminalSeen] = useState(0);
  const diagnostics = usePolygraphStore((state) => state.diagnostics);

  useEffect(() => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const result = event.data;

      if ("kind" in result && result.kind === "optimize-dephasing") {
        setDiagnostics(result.diagnostics);
        if (result.ok) {
          applyJsonText(JSON.stringify(result.model, null, 2));
          setExecution(undefined);
          setExecutionModel(undefined);
        }
        pendingRunRef.current = null;
        setStatus("idle");
        return;
      }

      const verificationResult = result as ExecutionResult;
      setDiagnostics(verificationResult.diagnostics);
      if (pendingRunRef.current === "execute") {
        const hasArtifacts = Boolean(verificationResult.artifacts);
        setExecution(hasArtifacts ? verificationResult : undefined);
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
  }, [applyJsonText, setDiagnostics, setExecution, setExecutionModel]);

  useEffect(() => {
    document.documentElement.dataset.theme = "light";
    document.documentElement.style.colorScheme = "light";
  }, []);

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
        kind: "verify",
        model,
        options: { computeExecution, cycles, captureDetailedTrace },
      });
    },
    [
      jsonText,
      cycles,
      captureDetailedTrace,
      setDiagnostics,
      setExecution,
      setExecutionModel,
      setModel,
    ],
  );

  const runAutoDephase = useCallback(() => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setDiagnostics([
        {
          id: "E_TOPOLOGY_INVALID",
          severity: "error",
          message: "JSON parse error: unable to parse the model.",
        },
      ]);
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

    if (!workerRef.current) {
      setDiagnostics([
        {
          id: "E_TOPOLOGY_INVALID",
          severity: "error",
          message: "Verifier worker is not available.",
        },
      ]);
      setStatus("idle");
      return;
    }

    const model = parsed as PolyGraphModel;
    setModel(model, "json");
    pendingRunRef.current = "optimize-dephasing";
    setStatus("running");
    workerRef.current.postMessage({
      kind: "optimize-dephasing",
      model,
    });
  }, [jsonText, setDiagnostics, setModel]);

  return (
    <div className="h-[100dvh] overflow-hidden bg-[color:var(--panel)] text-[color:var(--foreground)]">
      <div className="animate-float-in flex h-full min-h-0 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-[color:var(--panel-border)] px-4 py-3">
          <Toolbar
            onValidate={() => runVerification(false)}
            onExecute={() => runVerification(true)}
            onAutoDephase={runAutoDephase}
            onReset={reset}
            status={status}
            cycles={cycles}
            onCyclesChange={setCycles}
            captureDetailedTrace={captureDetailedTrace}
            onCaptureDetailedTraceChange={setCaptureDetailedTrace}
          />
          {status === "running" && (
            <p className="mt-2 text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">
              Running… worker active
            </p>
          )}
        </div>

        <div className="shrink-0 flex items-end gap-1 border-b border-[color:var(--panel-border)] px-4 bg-[color:var(--panel)]">
          {(
            [
              { key: "editor", label: "Editor" },
              { key: "results", label: "Results" },
              {
                key: "diagnostics",
                label: "Terminal",
                badge:
                  Math.max(0, diagnostics.length - terminalSeen) || undefined,
              },
            ] as { key: Tab; label: string; badge?: number }[]
          ).map(({ key, label, badge }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setActiveTab(key);
                if (key === "diagnostics") setTerminalSeen(diagnostics.length);
              }}
              className={`relative flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none ${
                activeTab === key
                  ? "border-[color:var(--accent)] text-[color:var(--foreground)]"
                  : "border-transparent text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
              }`}
            >
              {label}
              {badge !== undefined && (
                <span className="rounded-full bg-[color:var(--severity-error-bg)] px-1.5 py-0.5 text-[10px] font-bold leading-none text-[color:var(--severity-error-text)]">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <div
            className={`h-full min-h-0 pt-4 ${activeTab === "editor" ? "block" : "hidden"}`}
          >
            <EditorPanel />
          </div>
          <div
            className={`h-full min-h-0 pt-4 ${activeTab === "results" ? "block" : "hidden"}`}
          >
            <VisualizationPanel />
          </div>
          <div
            className={`h-full min-h-0 ${activeTab === "diagnostics" ? "block" : "hidden"}`}
          >
            <TerminalPanel variant="embedded" />
          </div>
        </div>
      </div>
    </div>
  );
}
