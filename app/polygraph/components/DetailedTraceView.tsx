"use client";

import type { ExecutionResult, PolyGraphModel, DetailedTraceStep } from "@/lib/polygraph/types";

export default function DetailedTraceView({
  execution,
  model,
}: {
  execution?: ExecutionResult;
  model: PolyGraphModel;
}) {
  const trace = execution?.artifacts?.detailedTrace;

  if (!trace || trace.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] p-4 text-sm text-[color:var(--muted)]">
        Run Execute to generate a detailed trace.
      </div>
    );
  }

  const channels = model.channels;
  const actors = model.actors;
  const timedActorIndices = actors
    .map((a, i) => (a.timed ? i : -1))
    .filter((i) => i >= 0);

  return (
    <div className="overflow-auto rounded-xl border border-[color:var(--panel-border)]">
      <table className="w-full border-collapse text-xs font-mono">
        <thead>
          <tr className="bg-[color:var(--panel-muted)]">
            {/* State label */}
            <th className="sticky left-0 z-10 border-b border-r border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] px-3 py-2 text-left font-semibold text-[color:var(--muted-strong)]">
              State
            </th>
            {/* Channel states */}
            {channels.map((ch, i) => (
              <th
                key={`ch-${ch.id}`}
                className="border-b border-r border-[color:var(--panel-border)] px-2 py-2 text-center font-semibold text-[color:var(--muted-strong)]"
                title={`${ch.id}: ${ch.src} → ${ch.dst}`}
              >
                <div>c<sub>{i + 1}</sub></div>
                <div className="text-[9px] font-normal text-[color:var(--muted)] leading-tight">
                  {ch.src}→{ch.dst}
                </div>
              </th>
            ))}
            {/* τ^l */}
            <th className="border-b border-r border-[color:var(--panel-border)] px-3 py-2 text-center font-semibold text-[color:var(--muted-strong)]">
              τ<sup>l</sup>
            </th>
            {/* a_i for each timed actor */}
            {timedActorIndices.map((idx) => (
              <th
                key={`a-${idx}`}
                className="border-b border-r border-[color:var(--panel-border)] px-2 py-2 text-center font-semibold text-[color:var(--muted-strong)]"
                title={actors[idx].label ?? actors[idx].id}
              >
                <div>a<sub>{idx + 1}</sub></div>
                <div className="text-[9px] font-normal text-[color:var(--muted)] leading-tight">
                  {actors[idx].label ?? actors[idx].id}
                </div>
              </th>
            ))}
            {/* y^σ */}
            <th className="border-b border-r border-[color:var(--panel-border)] px-3 py-2 text-center font-semibold text-[color:var(--muted-strong)]">
              y<sup>σ</sup>
            </th>
            {/* z^σ */}
            <th className="border-b border-[color:var(--panel-border)] px-3 py-2 text-center font-semibold text-[color:var(--muted-strong)]">
              z<sup>σ</sup>
            </th>
          </tr>
        </thead>
        <tbody>
          {trace.map((step, rowIdx) => (
            <TraceRow
              key={step.stateIndex}
              step={step}
              channelCount={channels.length}
              timedActorIndices={timedActorIndices}
              actorCount={actors.length}
              isEven={rowIdx % 2 === 0}
              isFireRow={step.label.startsWith("fire")}
              isTickRow={step.label.startsWith("tick")}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TraceRow({
  step,
  channelCount,
  timedActorIndices,
  actorCount,
  isEven,
  isFireRow,
  isTickRow,
}: {
  step: DetailedTraceStep;
  channelCount: number;
  timedActorIndices: number[];
  actorCount: number;
  isEven: boolean;
  isFireRow: boolean;
  isTickRow: boolean;
}) {
  const bgClass = isEven
    ? "bg-[color:var(--panel)]"
    : "bg-[color:var(--panel-muted)]";

  // Format the firing vector as a bracket tuple like the paper
  const yTuple = `[${step.firingVector.join(", ")}]`;

  return (
    <tr className={bgClass}>
      {/* State label */}
      <td
        className={`sticky left-0 z-10 border-r border-b border-[color:var(--panel-border)] px-3 py-1.5 text-left font-semibold whitespace-nowrap ${bgClass} ${
          isFireRow
            ? "text-blue-400"
            : isTickRow
              ? "text-amber-400"
              : "text-[color:var(--foreground)]"
        }`}
      >
        <span className="text-[color:var(--muted)] mr-2">
          s<sup>{step.stateIndex}</sup>
        </span>
        {step.label.startsWith("s") ? "" : `= ${step.label}`}
      </td>
      {/* Channel states */}
      {step.channelStates.slice(0, channelCount).map((val, i) => (
        <td
          key={`c-${i}`}
          className="border-r border-b border-[color:var(--panel-border)] px-3 py-1.5 text-center text-[color:var(--foreground)]"
        >
          {val}
        </td>
      ))}
      {/* τ^l */}
      <td className="border-r border-b border-[color:var(--panel-border)] px-3 py-1.5 text-center text-[color:var(--foreground)]">
        {step.tau}
      </td>
      {/* a_i for each timed actor */}
      {timedActorIndices.map((idx) => (
        <td
          key={`a-${idx}`}
          className="border-r border-b border-[color:var(--panel-border)] px-3 py-1.5 text-center text-[color:var(--foreground)]"
        >
          {step.tracking[idx] ?? "0"}
        </td>
      ))}
      {/* y^σ */}
      <td className="border-r border-b border-[color:var(--panel-border)] px-3 py-1.5 text-center text-[color:var(--foreground)] whitespace-nowrap">
        {yTuple}
      </td>
      {/* z^σ */}
      <td className="border-b border-[color:var(--panel-border)] px-3 py-1.5 text-center text-[color:var(--foreground)]">
        {step.totalTicks}
      </td>
    </tr>
  );
}
