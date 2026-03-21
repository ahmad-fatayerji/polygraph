/// <reference lib="webworker" />

import type { ExecutionResult, PolyGraphModel, VerifyOptions } from "@/lib/polygraph/types";
import { verify } from "@/lib/polygraph/verify";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<{ model: PolyGraphModel; options?: VerifyOptions }>) => {
  try {
    const result: ExecutionResult = verify(event.data.model, event.data.options);
    ctx.postMessage(result);
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

