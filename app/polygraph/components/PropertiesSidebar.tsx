"use client";

import { usePolygraphStore } from "../store";

const Field = ({ label, value }: { label: string; value: string }) => (
  <div className="space-y-1">
    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
      {label}
    </p>
    <p className="text-sm text-neutral-900">{value}</p>
  </div>
);

export default function PropertiesSidebar() {
  const model = usePolygraphStore((state) => state.model);
  const setModel = usePolygraphStore((state) => state.setModel);
  const selectedActorId = usePolygraphStore((state) => state.ui.selectedActorId);
  const selectedChannelId = usePolygraphStore((state) => state.ui.selectedChannelId);

  const actor = model.actors.find((item) => item.id === selectedActorId);
  const channel = model.channels.find((item) => item.id === selectedChannelId);

  if (!actor && !channel) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-200 bg-white/70 p-4 text-sm text-neutral-500">
        Select an actor or channel to inspect properties.
      </div>
    );
  }

  if (actor) {
    return (
      <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white/70 p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-neutral-400">
            Actor
          </p>
          <h3 className="text-lg font-semibold text-neutral-900">{actor.label ?? actor.id}</h3>
        </div>
        <Field label="ID" value={actor.id} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
            Label
          </span>
          <input
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"
            value={actor.label ?? ""}
            onChange={(event) => {
              const nextActors = model.actors.map((item) =>
                item.id === actor.id ? { ...item, label: event.target.value } : item
              );
              setModel({ ...model, actors: nextActors }, "visual");
            }}
          />
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
                      freq: timed ? item.freq ?? 1 : undefined,
                      phase: timed ? item.phase ?? 0 : undefined,
                    }
                  : item
              );
              setModel({ ...model, actors: nextActors }, "visual");
            }}
          />
          Timed actor
        </label>
        {actor.timed && (
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
                Freq (Hz)
              </span>
              <input
                type="number"
                className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"
                value={actor.freq ?? 1}
                onChange={(event) => {
                  const nextActors = model.actors.map((item) =>
                    item.id === actor.id
                      ? { ...item, freq: Number(event.target.value) }
                      : item
                  );
                  setModel({ ...model, actors: nextActors }, "visual");
                }}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
                Phase
              </span>
              <input
                type="number"
                className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"
                value={actor.phase ?? 0}
                onChange={(event) => {
                  const nextActors = model.actors.map((item) =>
                    item.id === actor.id
                      ? { ...item, phase: Number(event.target.value) }
                      : item
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
    <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white/70 p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-neutral-400">
          Channel
        </p>
        <h3 className="text-lg font-semibold text-neutral-900">{channel?.id}</h3>
      </div>
      {channel && (
        <>
          <Field label="Source" value={channel.src} />
          <Field label="Destination" value={channel.dst} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
              rateSrc
            </span>
            <input
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"
              value={channel.rateSrc}
              onChange={(event) => {
                const nextChannels = model.channels.map((item) =>
                  item.id === channel.id ? { ...item, rateSrc: event.target.value } : item
                );
                setModel({ ...model, channels: nextChannels }, "visual");
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
              rateDst
            </span>
            <input
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"
              value={channel.rateDst}
              onChange={(event) => {
                const nextChannels = model.channels.map((item) =>
                  item.id === channel.id ? { ...item, rateDst: event.target.value } : item
                );
                setModel({ ...model, channels: nextChannels }, "visual");
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
              init
            </span>
            <input
              className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"
              value={channel.init}
              onChange={(event) => {
                const nextChannels = model.channels.map((item) =>
                  item.id === channel.id ? { ...item, init: event.target.value } : item
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
