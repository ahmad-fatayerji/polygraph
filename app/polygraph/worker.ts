/// <reference lib="webworker" />

import { autoDephaseMinTicks } from "@/lib/polygraph/autoDephase";
import type { ExecutionResult, WorkerRequest, WorkerResponse } from "@/lib/polygraph/types";
import { verify } from "@/lib/polygraph/verify";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  try {
    if (event.data.kind === "optimize-dephasing") {
      const result = autoDephaseMinTicks(event.data.model);
      const response: WorkerResponse = {
        kind: "optimize-dephasing",
        ok: result.ok,
        model: result.model,
        diagnostics: result.diagnostics,
        ...(result.ok
          ? {
              metrics: {
                tickCount: result.tickCount,
                baseTick: result.baseTick,
                phaseQuantum: result.phaseQuantum,
              },
            }
          : {}),
      };
      ctx.postMessage(response);
      return;
    }

    const result: ExecutionResult = verify(event.data.model, event.data.options);
    ctx.postMessage(result satisfies WorkerResponse);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown worker runtime error.";
    ctx.postMessage({
      ok: false,
      diagnostics: [
        {
          id: "E_TOPOLOGY_INVALID",
          severity: "error",
          message: `Worker execution failed: ${message}`,
          hint: "Check the latest code changes in timing analysis modules.",
        },
      ],
    } satisfies ExecutionResult);
  }
};

export {};
