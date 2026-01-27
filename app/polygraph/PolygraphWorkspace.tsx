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
  const theme = usePolygraphStore((state) => state.theme);
  const setTheme = usePolygraphStore((state) => state.setTheme);
  const toggleTheme = usePolygraphStore((state) => state.toggleTheme);

  const workerRef = useRef<Worker | null>(null);
  const [status, setStatus] = useState<"idle" | "running">("idle");
  const [terminalHeight, setTerminalHeight] = useState(280);
  const dragStateRef = useRef<{ startY: number; startHeight: number } | null>(null);

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

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("polygraph-theme");
    if (storedTheme === "light" || storedTheme === "dark") {
      setTheme(storedTheme);
    } else {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      setTheme(media.matches ? "dark" : "light");
    }
  }, [setTheme]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem("polygraph-theme", theme);
  }, [theme]);

  useEffect(() => {
    const updateHeight = (clientY: number) => {
      if (!dragStateRef.current) return;
      const delta = dragStateRef.current.startY - clientY;
      const minHeight = 200;
      const maxHeight = Math.max(minHeight, Math.round(window.innerHeight * 0.55));
      const nextHeight = dragStateRef.current.startHeight + delta;
      setTerminalHeight(Math.min(maxHeight, Math.max(minHeight, nextHeight)));
    };

    const handlePointerMove = (event: PointerEvent) => updateHeight(event.clientY);
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
    <div className="min-h-screen bg-transparent px-4 py-6 text-[color:var(--foreground)]">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-[1500px] flex-col gap-6">
        <header
          className="animate-float-in rounded-2xl border border-[color:var(--panel-border)] bg-[color:var(--panel)] p-6 shadow-sm"
          style={{ animationDelay: "40ms" }}
        >
          <Toolbar
            onValidate={() => runVerification(false)}
            onExecute={() => runVerification(true)}
            onReset={reset}
            status={status}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
          {status === "running" && (
            <p className="mt-3 text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">
              Verifying... running in worker
            </p>
          )}
        </header>
        <div className="flex min-h-0 flex-1 flex-col">
          <main className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
            <div
              className="animate-float-in rounded-2xl border border-[color:var(--panel-border)] bg-[color:var(--panel)] p-6 shadow-sm"
              style={{ animationDelay: "120ms" }}
            >
              <EditorPanel />
            </div>
            <div
              className="animate-float-in rounded-2xl border border-[color:var(--panel-border)] bg-[color:var(--panel)] p-6 shadow-sm"
              style={{ animationDelay: "180ms" }}
            >
              <VisualizationPanel />
            </div>
          </main>
          <div
            className="mt-4 h-3 cursor-row-resize touch-none rounded-full bg-[color:var(--panel-border)]"
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
            onMouseDown={(event) => {
              event.preventDefault();
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
          <div
            className="animate-float-in mt-4"
            style={{ animationDelay: "220ms", height: terminalHeight }}
          >
            <TerminalPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
