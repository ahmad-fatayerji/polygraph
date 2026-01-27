"use client";

import type { ExecutionResult, PolyGraphModel } from "@/lib/polygraph/types";

export default function TokenTraceView({
  execution,
  model,
}: {
  execution?: ExecutionResult;
  model: PolyGraphModel;
}) {
  const tokenTrace = execution?.artifacts?.tokenTrace ?? [];

  if (!execution?.artifacts?.tokenTrace) {
    return (
      <div className="rounded-2xl border border-dashed border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] p-4 text-sm text-[color:var(--muted)]">
        Token trace appears after execution succeeds.
      </div>
    );
  }

  const channelMap = new Map(model.channels.map((channel) => [channel.id, channel]));

  return (
    <div className="space-y-3">
      {tokenTrace.map((trace) => {
        const channel = channelMap.get(trace.channelId);
        return (
          <div
            key={trace.channelId}
            className="rounded-xl border border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] px-4 py-3"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
                {trace.channelId}
              </p>
              {channel && (
                <span className="text-[11px] text-[color:var(--muted)]">
                  {channel.src} {" -> "} {channel.dst}
                </span>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[color:var(--muted-strong)] sm:grid-cols-3">
              {trace.values.map((value) => (
                <div
                  key={`${trace.channelId}-${value.tick}`}
                  className="rounded-lg bg-[color:var(--panel)] px-2 py-1"
                >
                  t{value.tick}: {value.tokens}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
