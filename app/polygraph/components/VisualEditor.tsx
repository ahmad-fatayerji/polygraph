"use client";

import { useMemo } from "react";
import ReactFlow, { Background, Controls, type Node, type Edge } from "reactflow";
import "reactflow/dist/style.css";
import { usePolygraphStore } from "../store";

const defaultPosition = (index: number) => ({
  x: 60 + (index % 4) * 180,
  y: 60 + Math.floor(index / 4) * 160,
});

export default function VisualEditor() {
  const model = usePolygraphStore((state) => state.model);
  const setModel = usePolygraphStore((state) => state.setModel);
  const selectActor = usePolygraphStore((state) => state.selectActor);
  const selectChannel = usePolygraphStore((state) => state.selectChannel);
  const selectedActorId = usePolygraphStore((state) => state.ui.selectedActorId);
  const selectedChannelId = usePolygraphStore((state) => state.ui.selectedChannelId);

  const nodes = useMemo<Node[]>(() => {
    return model.actors.map((actor, idx) => ({
      id: actor.id,
      data: {
        label: (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold">{actor.label ?? actor.id}</span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">
              {actor.timed ? "timed" : "untimed"}
            </span>
          </div>
        ),
      },
      position: actor.ui ?? defaultPosition(idx),
      style: {
        borderRadius: 16,
        padding: 12,
        border: actor.id === selectedActorId ? "2px solid #111827" : "1px solid #cbd5f5",
        background: actor.timed ? "#eef2ff" : "#f8fafc",
        color: "#0f172a",
        boxShadow: "0 10px 20px rgba(15, 23, 42, 0.08)",
        minWidth: 150,
      },
    }));
  }, [model.actors, selectedActorId]);

  const edges = useMemo<Edge[]>(() => {
    return model.channels.map((channel) => ({
      id: channel.id,
      source: channel.src,
      target: channel.dst,
      label: `${channel.rateSrc} / ${channel.rateDst}`,
      style: {
        stroke: channel.id === selectedChannelId ? "#111827" : "#94a3b8",
        strokeWidth: channel.id === selectedChannelId ? 2.2 : 1.4,
      },
      labelStyle: {
        fill: "#0f172a",
        fontSize: 11,
        fontWeight: 600,
      },
    }));
  }, [model.channels, selectedChannelId]);

  return (
    <div className="h-full w-full rounded-2xl border border-neutral-200 bg-gradient-to-br from-white via-white to-slate-50 shadow-sm">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        onNodeClick={(_, node) => selectActor(node.id)}
        onEdgeClick={(_, edge) => selectChannel(edge.id)}
        onNodeDragStop={(_, node) => {
          const nextActors = model.actors.map((actor) =>
            actor.id === node.id
              ? { ...actor, ui: { x: node.position.x, y: node.position.y } }
              : actor
          );
          setModel({ ...model, actors: nextActors }, "visual");
        }}
      >
        <Background gap={24} color="#e2e8f0" />
        <Controls position="bottom-right" />
      </ReactFlow>
    </div>
  );
}
