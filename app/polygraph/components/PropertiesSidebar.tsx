"use client";

import { useEffect, useState } from "react";
import {
  div,
  mul,
  parseNumberToRational,
  parseRational,
  toString as rationalToString,
} from "@/lib/polygraph/rational";
import type { PipelineStage } from "@/lib/polygraph/types";
import { PIPELINE_STAGE_OPTIONS } from "../pipelineStages";
import { usePolygraphStore } from "../store";

const Field = ({ label, value }: { label: string; value: string }) => (
  <div className="space-y-1">
    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
      {label}
    </p>
    <p className="text-sm text-[color:var(--foreground)]">{value}</p>
  </div>
);

type ExecutionTimeUnit = "ms" | "us";

const parseExecutionTimeValue = (value: string | number | undefined) => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") {
    return parseNumberToRational(value);
  }
  const parsed = parseRational(String(value));
  return parsed.ok ? parsed.value : null;
};

export default function PropertiesSidebar() {
  const model = usePolygraphStore((state) => state.model);
  const setModel = usePolygraphStore((state) => state.setModel);
  const selectedActorId = usePolygraphStore(
    (state) => state.ui.selectedActorId,
  );
  const selectedChannelId = usePolygraphStore(
    (state) => state.ui.selectedChannelId,
  );
  const [executionTimeUnit, setExecutionTimeUnit] =
    useState<ExecutionTimeUnit>("ms");

  const actor = model.actors.find((item) => item.id === selectedActorId);
  const channel = model.channels.find((item) => item.id === selectedChannelId);

  useEffect(() => {
    setExecutionTimeUnit("ms");
  }, [selectedActorId]);

  if (!actor && !channel) {
    return (
      <div className="rounded-2xl border border-dashed border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] p-4 text-sm text-[color:var(--muted)]">
        Select an actor or channel to inspect properties.
      </div>
    );
  }

  if (actor) {
    return (
      <div className="space-y-4 rounded-2xl border border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
            Actor
          </p>
          <h3 className="text-lg font-semibold text-[color:var(--foreground)]">
            {actor.label ?? actor.id}
          </h3>
        </div>
        <Field label="ID" value={actor.id} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
            Label
          </span>
          <input
            className="rounded-lg border border-[color:var(--input-border)] bg-[color:var(--input-bg)] px-3 py-2 text-sm text-[color:var(--foreground)]"
            value={actor.label ?? ""}
            onChange={(event) => {
              const nextActors = model.actors.map((item) =>
                item.id === actor.id
                  ? { ...item, label: event.target.value }
                  : item,
              );
              setModel({ ...model, actors: nextActors }, "visual");
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
            Pipeline Stage
          </span>
          <select
            className="rounded-lg border border-[color:var(--input-border)] bg-[color:var(--input-bg)] px-3 py-2 text-sm text-[color:var(--foreground)]"
            value={actor.pipelineStage ?? ""}
            onChange={(event) => {
              const stage = event.target.value as PipelineStage | "";
              const nextActors = model.actors.map((item) => {
                if (item.id !== actor.id) return item;
                if (stage === "") {
                  const nextActor = { ...item };
                  delete nextActor.pipelineStage;
                  return nextActor;
                }
                return { ...item, pipelineStage: stage };
              });
              setModel({ ...model, actors: nextActors }, "visual");
            }}
          >
            <option value="">Uncategorized</option>
            {PIPELINE_STAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={actor.timed}
            onChange={(event) => {
              const timed = event.target.checked;
              const nextActors = model.actors.map((item) =>
                item.id === actor.id
                  ? {
                      ...item,
                      timed,
                      freq: timed ? (item.freq ?? 1) : undefined,
                      period: undefined,
                      phase: timed ? (item.phase ?? "0") : undefined,
                    }
                  : item,
              );
              setModel({ ...model, actors: nextActors }, "visual");
            }}
          />
          Timed actor
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
            Execution Time
          </span>
          <div className="flex items-center gap-2">
            <input
              type="text"
              className="min-w-0 flex-1 rounded-lg border border-[color:var(--input-border)] bg-[color:var(--input-bg)] px-3 py-2 text-sm text-[color:var(--foreground)]"
              value={(() => {
                const parsed = parseExecutionTimeValue(actor.executionTime);
                if (!parsed) return "";
                return executionTimeUnit === "us"
                  ? rationalToString(mul(parsed, { n: 1000n, d: 1n }))
                  : rationalToString(parsed);
              })()}
              placeholder={
                executionTimeUnit === "us"
                  ? "e.g., 94, 211/2"
                  : "e.g., 2, 5/2"
              }
              onChange={(event) => {
                const raw = event.target.value.trim();
                let nextValue: string | undefined;

                if (raw !== "") {
                  const parsed = parseRational(raw);
                  if (parsed.ok) {
                    nextValue =
                      executionTimeUnit === "us"
                        ? rationalToString(
                            div(parsed.value, { n: 1000n, d: 1n }),
                          )
                        : rationalToString(parsed.value);
                  } else {
                    nextValue = raw;
                  }
                }

                const nextActors = model.actors.map((item) =>
                  item.id === actor.id
                    ? {
                        ...item,
                        executionTime: nextValue,
                      }
                    : item,
                );
                setModel({ ...model, actors: nextActors }, "visual");
              }}
            />
            <div className="flex rounded-lg border border-[color:var(--panel-border)] bg-[color:var(--panel)] p-0.5">
              {(["ms", "us"] as const).map((unit) => (
                <button
                  key={unit}
                  type="button"
                  onClick={() => setExecutionTimeUnit(unit)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    executionTimeUnit === unit
                      ? "bg-[color:var(--chip)] text-[color:var(--chip-text)]"
                      : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
                  }`}
                >
                  {unit}
                </button>
              ))}
            </div>
          </div>
        </label>
        {actor.timed && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
                  Freq (Hz)
                </span>
                <input
                  type="number"
                  className="rounded-lg border border-[color:var(--input-border)] bg-[color:var(--input-bg)] px-3 py-2 text-sm text-[color:var(--foreground)]"
                  value={actor.freq ?? ""}
                  placeholder="e.g., 100"
                  onChange={(event) => {
                    const freq = event.target.value
                      ? Number(event.target.value)
                      : undefined;
                    const nextActors = model.actors.map((item) =>
                      item.id === actor.id
                        ? { ...item, freq, period: undefined }
                        : item,
                    );
                    setModel({ ...model, actors: nextActors }, "visual");
                  }}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
                  Period (ms)
                </span>
                <input
                  type="number"
                  className="rounded-lg border border-[color:var(--input-border)] bg-[color:var(--input-bg)] px-3 py-2 text-sm text-[color:var(--foreground)]"
                  value={actor.period ?? ""}
                  placeholder="e.g., 10"
                  onChange={(event) => {
                    const period = event.target.value
                      ? Number(event.target.value)
                      : undefined;
                    const nextActors = model.actors.map((item) =>
                      item.id === actor.id
                        ? { ...item, period, freq: undefined }
                        : item,
                    );
                    setModel({ ...model, actors: nextActors }, "visual");
                  }}
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
                Phase (ms)
              </span>
              <input
                type="text"
                className="rounded-lg border border-[color:var(--input-border)] bg-[color:var(--input-bg)] px-3 py-2 text-sm text-[color:var(--foreground)]"
                value={actor.phase != null ? String(actor.phase) : "0"}
                placeholder="e.g., 0, 20, 200/3"
                onChange={(event) => {
                  const nextActors = model.actors.map((item) =>
                    item.id === actor.id
                      ? { ...item, phase: event.target.value }
                      : item,
                  );
                  setModel({ ...model, actors: nextActors }, "visual");
                }}
              />
            </label>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
          Channel
        </p>
        <h3 className="text-lg font-semibold text-[color:var(--foreground)]">
          {channel?.id}
        </h3>
      </div>
      {channel && (
        <>
          <Field label="Source" value={channel.src} />
          <Field label="Destination" value={channel.dst} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
              rateSrc
            </span>
            <input
              className="rounded-lg border border-[color:var(--input-border)] bg-[color:var(--input-bg)] px-3 py-2 text-sm text-[color:var(--foreground)]"
              value={channel.rateSrc}
              onChange={(event) => {
                const nextChannels = model.channels.map((item) =>
                  item.id === channel.id
                    ? { ...item, rateSrc: event.target.value }
                    : item,
                );
                setModel({ ...model, channels: nextChannels }, "visual");
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
              rateDst
            </span>
            <input
              className="rounded-lg border border-[color:var(--input-border)] bg-[color:var(--input-bg)] px-3 py-2 text-sm text-[color:var(--foreground)]"
              value={channel.rateDst.replace(/^-/, "")}
              onChange={(event) => {
                const raw = event.target.value;
                // Store as-is; the verifier will auto-negate
                const nextChannels = model.channels.map((item) =>
                  item.id === channel.id
                    ? { ...item, rateDst: raw }
                    : item,
                );
                setModel({ ...model, channels: nextChannels }, "visual");
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
              init
            </span>
            <input
              className="rounded-lg border border-[color:var(--input-border)] bg-[color:var(--input-bg)] px-3 py-2 text-sm text-[color:var(--foreground)]"
              value={channel.init}
              onChange={(event) => {
                const nextChannels = model.channels.map((item) =>
                  item.id === channel.id
                    ? { ...item, init: event.target.value }
                    : item,
                );
                setModel({ ...model, channels: nextChannels }, "visual");
              }}
            />
          </label>
        </>
      )}
    </div>
  );
}
