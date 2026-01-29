"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import ReactFlow, {
  Background,
  Controls,
  Position,
  type Connection,
  type Edge,
  type Node,
  type ReactFlowInstance,
  useEdgesState,
  useNodesState,
} from "reactflow";
import "reactflow/dist/style.css";
import { usePolygraphStore } from "../store";
import { defaultPosition } from "../graphLayout";

const nextId = (prefix: string, existing: string[]) => {
  let index = 1;
  let candidate = `${prefix}${index}`;
  const taken = new Set(existing);
  while (taken.has(candidate)) {
    index += 1;
    candidate = `${prefix}${index}`;
  }
  return candidate;
};

export default function VisualEditor() {
  const model = usePolygraphStore((state) => state.model);
  const setModel = usePolygraphStore((state) => state.setModel);
  const setActorPosition = usePolygraphStore((state) => state.setActorPosition);
  const selectActor = usePolygraphStore((state) => state.selectActor);
  const selectChannel = usePolygraphStore((state) => state.selectChannel);
  const actorPositions = usePolygraphStore((state) => state.ui.actorPositions);
  const selectedActorId = usePolygraphStore((state) => state.ui.selectedActorId);
  const selectedChannelId = usePolygraphStore((state) => state.ui.selectedChannelId);

  const flowRef = useRef<ReactFlowInstance | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);

  const [contextMenu, setContextMenu] = useState<
    | {
        type: "node";
        x: number;
        y: number;
        nodeId: string;
      }
    | {
        type: "edge";
        x: number;
        y: number;
        edgeId: string;
      }
    | {
        type: "pane";
        x: number;
        y: number;
        flowPosition: { x: number; y: number };
      }
    | null
  >(null);

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
      position: actorPositions?.[actor.id] ?? defaultPosition(idx),
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
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
  }, [model.actors, actorPositions, selectedActorId]);

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

  const addActorAt = useCallback(
    (position: { x: number; y: number }) => {
      const id = nextId(
        "a",
        model.actors.map((actor) => actor.id)
      );
      const nextActor = {
        id,
        label: `Actor ${id.toUpperCase()}`,
        timed: false,
      };
      setActorPosition(id, position);
      setModel({ ...model, actors: [...model.actors, nextActor] }, "visual");
      selectActor(id);
    },
    [model, selectActor, setActorPosition, setModel]
  );

  const clampToBounds = useCallback((x: number, y: number) => {
    const bounds = wrapperRef.current?.getBoundingClientRect();
    if (!bounds) return { x, y };
    const menuWidth = 220;
    const menuHeight = 140;
    const maxX = Math.max(8, bounds.width - menuWidth - 8);
    const maxY = Math.max(8, bounds.height - menuHeight - 8);
    return {
      x: Math.min(Math.max(8, x), maxX),
      y: Math.min(Math.max(8, y), maxY),
    };
  }, []);

  const openContextMenu = useCallback(
    (
      event: MouseEvent,
      payload:
        | { type: "node"; nodeId: string }
        | { type: "edge"; edgeId: string }
        | { type: "pane"; flowPosition: { x: number; y: number } }
    ) => {
      event.preventDefault();
      event.stopPropagation();
      const bounds = wrapperRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const unclampedX = event.clientX - bounds.left;
      const unclampedY = event.clientY - bounds.top;
      const { x, y } = clampToBounds(unclampedX, unclampedY);
      if (payload.type === "node") {
        setContextMenu({
          type: "node",
          x,
          y,
          nodeId: payload.nodeId,
        });
      } else {
        setContextMenu(
          payload.type === "edge"
            ? {
                type: "edge",
                x,
                y,
                edgeId: payload.edgeId,
              }
            : {
                type: "pane",
                x,
                y,
                flowPosition: payload.flowPosition,
              }
        );
      }
    },
    [clampToBounds]
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      if (connection.source === connection.target) return;
      const id = nextId(
        "c",
        model.channels.map((channel) => channel.id)
      );
      const nextChannel = {
        id,
        src: connection.source,
        dst: connection.target,
        rateSrc: "1",
        rateDst: "-1",
        init: "0",
      };
      setModel({ ...model, channels: [...model.channels, nextChannel] }, "visual");
      selectChannel(id);
    },
    [model, selectChannel, setModel]
  );

  const removeChannels = useCallback(
    (ids: string[]) => {
      if (ids.length == 0) return;
      const nextChannels = model.channels.filter((channel) => !ids.includes(channel.id));
      setModel({ ...model, channels: nextChannels }, "visual");
    },
    [model, setModel]
  );

  const removeActor = useCallback(
    (id: string) => {
      const nextActors = model.actors.filter((actor) => actor.id !== id);
      const nextChannels = model.channels.filter(
        (channel) => channel.src !== id && channel.dst !== id
      );
      setModel({ ...model, actors: nextActors, channels: nextChannels }, "visual");
    },
    [model, setModel]
  );

  const getFlowPositionFromPointer = useCallback(() => {
    const bounds = wrapperRef.current?.getBoundingClientRect();
    const pointer = lastPointerRef.current;
    const fallback = bounds
      ? { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }
      : null;
    const screenPosition = pointer ?? fallback;
    if (!screenPosition) return defaultPosition(model.actors.length);
    const instance = flowRef.current;
    return instance
      ? instance.screenToFlowPosition(screenPosition)
      : defaultPosition(model.actors.length);
  }, [model.actors.length]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName;
        if (
          tagName === "INPUT" ||
          tagName === "TEXTAREA" ||
          tagName === "SELECT" ||
          target.isContentEditable
        ) {
          return;
        }
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (!selectedActorId && !selectedChannelId) return;
        event.preventDefault();
        event.stopPropagation();
        if (selectedActorId) {
          removeActor(selectedActorId);
        } else if (selectedChannelId) {
          removeChannels([selectedChannelId]);
        }
        setContextMenu(null);
        return;
      }

      if (event.key.toLowerCase() === "a") {
        event.preventDefault();
        event.stopPropagation();
        addActorAt(getFlowPositionFromPointer());
        setContextMenu(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    addActorAt,
    getFlowPositionFromPointer,
    removeActor,
    removeChannels,
    selectedActorId,
    selectedChannelId,
    setContextMenu,
  ]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col rounded-2xl border border-[color:var(--panel-border)] bg-[color:var(--panel)] shadow-sm">
      <div
        ref={wrapperRef}
        className="relative min-h-0 flex-1"
        onMouseMove={(event) => {
          lastPointerRef.current = { x: event.clientX, y: event.clientY };
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          className="h-full w-full"
          fitView
          nodesConnectable
          connectOnClick={false}
          zoomOnDoubleClick={false}
          connectionRadius={30}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onEdgesDelete={(edgesToDelete) => removeChannels(edgesToDelete.map((edge) => edge.id))}
          onEdgeDoubleClick={(_, edge) => removeChannels([edge.id])}
          onConnect={handleConnect}
          onInit={(instance) => {
            flowRef.current = instance;
          }}
          onPaneClick={() => {
            if (contextMenu) setContextMenu(null);
            selectActor();
          }}
          onPaneContextMenu={(event) => {
            const instance = flowRef.current;
            const position = instance
              ? instance.screenToFlowPosition({ x: event.clientX, y: event.clientY })
              : defaultPosition(model.actors.length);
            openContextMenu(event, { type: "pane", flowPosition: position });
          }}
          onNodeClick={(_, node) => {
            if (contextMenu) setContextMenu(null);
            selectActor(node.id);
          }}
          onEdgeClick={(_, edge) => {
            if (contextMenu) setContextMenu(null);
            selectChannel(edge.id);
          }}
          onNodeContextMenu={(event, node) => {
            selectActor(node.id);
            openContextMenu(event, { type: "node", nodeId: node.id });
          }}
          onEdgeContextMenu={(event, edge) => {
            selectChannel(edge.id);
            openContextMenu(event, { type: "edge", edgeId: edge.id });
          }}
          onNodeDragStop={(_, node) => {
            if (!node) return;
            setActorPosition(node.id, { x: node.position.x, y: node.position.y });
          }}
        >
          <Background gap={24} color="var(--reactflow-grid)" />
          <Controls position="bottom-right" />
        </ReactFlow>
        {contextMenu ? (
          <div
            className="absolute z-50 w-[220px] rounded-2xl border border-[color:var(--panel-border)] bg-[color:var(--panel)]/95 px-2 py-2 text-sm shadow-[0_18px_45px_rgba(15,23,42,0.18)] backdrop-blur"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {contextMenu.type === "node" ? (
              <div className="flex flex-col gap-1">
                <div className="px-2 pb-1 text-[10px] uppercase tracking-[0.28em] text-[color:var(--muted)]">
                  Node actions
                </div>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold text-[color:var(--foreground)] transition hover:bg-[color:var(--accent-muted)]"
                  onClick={() => {
                    removeActor(contextMenu.nodeId);
                    setContextMenu(null);
                  }}
                >
                  Delete actor
                  <span className="text-xs font-medium text-[color:var(--muted)]">Del</span>
                </button>
                <div className="px-2 pt-1 text-[11px] text-[color:var(--muted)]">
                  Removes the actor and its connections.
                </div>
              </div>
            ) : contextMenu.type === "pane" ? (
              <div className="flex flex-col gap-1">
                <div className="px-2 pb-1 text-[10px] uppercase tracking-[0.28em] text-[color:var(--muted)]">
                  Canvas
                </div>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold text-[color:var(--foreground)] transition hover:bg-[color:var(--accent-muted)]"
                  onClick={() => {
                    addActorAt(contextMenu.flowPosition);
                    setContextMenu(null);
                  }}
                >
                  Add actor here
                  <span className="text-xs font-medium text-[color:var(--muted)]">A</span>
                </button>
                <div className="px-2 pt-1 text-[11px] text-[color:var(--muted)]">
                  Creates a new actor at this position.
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <div className="px-2 pb-1 text-[10px] uppercase tracking-[0.28em] text-[color:var(--muted)]">
                  Connection
                </div>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-semibold text-[color:var(--foreground)] transition hover:bg-[color:var(--accent-muted)]"
                  onClick={() => {
                    removeChannels([contextMenu.edgeId]);
                    setContextMenu(null);
                  }}
                >
                  Delete connection
                  <span className="text-xs font-medium text-[color:var(--muted)]">Del</span>
                </button>
                <div className="px-2 pt-1 text-[11px] text-[color:var(--muted)]">
                  Removes this channel from the model.
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}


