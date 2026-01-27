"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Diagnostic, ExecutionResult, PolyGraphModel } from "@/lib/polygraph/types";
import Toolbar from "./components/Toolbar";
import EditorPanel from "./components/EditorPanel";
import VisualizationPanel from "./components/VisualizationPanel";
import TerminalPanel from "./components/TerminalPanel";
import { usePolygraphStore } from "./store";

export default function PolygraphWorkspace() {
  const jsonText = usePolygraphStore((state) => state.jsonText);
  const setDiagnostics = usePolygraphStore((state) => state.setDiagnostics);
  const setExecution = usePolygraphStore((state) => state.setExecution);
  const setModel = usePolygraphStore((state) => state.setModel);
  const reset = usePolygraphStore((state) => state.reset);

  const workerRef = useRef<Worker | null>(null);
  const [status, setStatus] = useState<"idle" | "running">("idle");

  useEffect(() => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<ExecutionResult>) => {
      const result = event.data;
      setDiagnostics(result.diagnostics);
      setExecution(result.artifacts ? result : undefined);
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
      setExecution(undefined);
      setStatus("idle");
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [setDiagnostics, setExecution]);

  const runVerification = useCallback(
    (computeExecution: boolean) => {
      setStatus("running");
      setExecution(undefined);
      let parsed: PolyGraphModel;
      try {
        parsed = JSON.parse(jsonText) as PolyGraphModel;
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

      setModel(parsed, "json");

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

      workerRef.current.postMessage({ model: parsed, options: { computeExecution } });
    },
    [jsonText, setDiagnostics, setExecution, setModel]
  );

  return (
    <div className="min-h-screen bg-slate-100/70 px-6 py-8 text-neutral-900">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl flex-col gap-6">
        <header
          className="animate-float-in rounded-[28px] border border-neutral-200 bg-white/80 p-6 shadow-sm"
          style={{ animationDelay: "40ms" }}
        >
          <Toolbar
            onValidate={() => runVerification(false)}
            onExecute={() => runVerification(true)}
            onReset={reset}
            status={status}
          />
          {status === "running" && (
            <p className="mt-3 text-xs uppercase tracking-[0.25em] text-neutral-500">
              Verifying... running in worker
            </p>
          )}
        </header>
        <main className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div
            className="animate-float-in rounded-[28px] border border-neutral-200 bg-white/70 p-6 shadow-sm"
            style={{ animationDelay: "120ms" }}
          >
            <EditorPanel />
          </div>
          <div
            className="animate-float-in rounded-[28px] border border-neutral-200 bg-white/70 p-6 shadow-sm"
            style={{ animationDelay: "180ms" }}
          >
            <VisualizationPanel />
          </div>
        </main>
        <div className="animate-float-in" style={{ animationDelay: "220ms" }}>
          <TerminalPanel />
        </div>
      </div>
    </div>
  );
}
