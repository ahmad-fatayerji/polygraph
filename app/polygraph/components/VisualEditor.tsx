"use client";

import { useEffect, useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  type Node,
  type Edge,
  useEdgesState,
  useNodesState,
} from "reactflow";
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

  const derivedNodes = useMemo<Node[]>(() => {
    return model.actors.map((actor, idx) => ({
      id: actor.id,
      data: {
        label: (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-[color:var(--foreground)]">
              {actor.label ?? actor.id}
            </span>
            <span className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--muted)]">
              {actor.timed ? "timed" : "untimed"}
            </span>
          </div>
        ),
      },
      position: actor.ui ?? defaultPosition(idx),
      style: {
        borderRadius: 14,
        padding: 12,
        border:
          actor.id === selectedActorId
            ? "2px solid var(--accent)"
            : "1px solid var(--panel-border)",
        background: actor.timed ? "var(--node-timed-bg)" : "var(--node-bg)",
        color: "var(--foreground)",
        boxShadow: "0 8px 16px rgba(0, 0, 0, 0.08)",
        minWidth: 150,
      },
    }));
  }, [model.actors, selectedActorId]);

  const derivedEdges = useMemo<Edge[]>(() => {
    return model.channels.map((channel) => ({
      id: channel.id,
      source: channel.src,
      target: channel.dst,
      label: `${channel.rateSrc} / ${channel.rateDst}`,
      style: {
        stroke: channel.id === selectedChannelId ? "var(--edge-active)" : "var(--edge)",
        strokeWidth: channel.id === selectedChannelId ? 2.2 : 1.4,
      },
      labelStyle: {
        fill: "var(--foreground)",
        fontSize: 11,
        fontWeight: 600,
      },
    }));
  }, [model.channels, selectedChannelId]);

  const [nodes, setNodes, onNodesChange] = useNodesState(derivedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(derivedEdges);

  useEffect(() => {
    setNodes(derivedNodes);
  }, [derivedNodes, setNodes]);

  useEffect(() => {
    setEdges(derivedEdges);
  }, [derivedEdges, setEdges]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col rounded-2xl border border-[color:var(--panel-border)] bg-[color:var(--panel)] shadow-sm">
      <div className="min-h-0 flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          className="h-full w-full"
          fitView
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
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
          <Background gap={24} color="var(--reactflow-grid)" />
          <Controls position="bottom-right" />
        </ReactFlow>
      </div>
    </div>
  );
}
