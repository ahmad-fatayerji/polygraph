import type { ExecutionResult, PolyGraphModel, VerifyOptions } from "@/lib/polygraph/types";
import { verify } from "@/lib/polygraph/verify";

const ctx: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<{ model: PolyGraphModel; options?: VerifyOptions }>) => {
  const result: ExecutionResult = verify(event.data.model, event.data.options);
  ctx.postMessage(result);
};

export {};

