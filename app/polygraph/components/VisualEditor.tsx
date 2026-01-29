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

const arraysEqual = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

type ContextMenuState =
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
  | null;

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
  const selectedNodeIdsRef = useRef<string[]>([]);
  const selectedEdgeIdsRef = useRef<string[]>([]);
  const keydownStateRef = useRef<{
    addActorAt: (position: { x: number; y: number }) => void;
    getFlowPositionFromPointer: () => { x: number; y: number };
    duplicateSelection: () => void;
    removeActors: (ids: string[]) => void;
    removeChannels: (ids: string[]) => void;
    removeActor: (id: string) => void;
    selectedActorId?: string;
    selectedChannelId?: string;
    selectActor: (id?: string) => void;
    setContextMenu: (
      value: ContextMenuState | ((prev: ContextMenuState) => ContextMenuState)
    ) => void;
  } | null>(null);

  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);

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
        border: "1px solid var(--panel-border)",
        background: actor.timed ? "var(--node-timed-bg)" : "var(--node-bg)",
        color: "var(--foreground)",
        boxShadow: "0 8px 16px rgba(0, 0, 0, 0.08)",
        minWidth: 150,
      },
    }));
  }, [model.actors, actorPositions]);

  const derivedEdges = useMemo<Edge[]>(() => {
    return model.channels.map((channel) => ({
      id: channel.id,
      source: channel.src,
      target: channel.dst,
      label: `${channel.rateSrc} / ${channel.rateDst}`,
      style: {
        stroke: "var(--edge)",
        strokeWidth: 1.4,
      },
      labelStyle: {
        fill: "var(--foreground)",
        fontSize: 11,
        fontWeight: 600,
      },
    }));
  }, [model.channels]);

  const [nodes, setNodes, onNodesChange] = useNodesState(derivedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(derivedEdges);

  useEffect(() => {
    setNodes((prev) => {
      const prevMap = new Map(prev.map((node) => [node.id, node]));
      const selectedSet = new Set(selectedNodeIdsRef.current);
      return derivedNodes.map((node) => {
        const existing = prevMap.get(node.id);
        const selected = existing?.selected ?? selectedSet.has(node.id);
        return selected ? { ...node, selected } : node;
      });
    });
  }, [derivedNodes, setNodes]);

  useEffect(() => {
    setEdges((prev) => {
      const prevMap = new Map(prev.map((edge) => [edge.id, edge]));
      const selectedSet = new Set(selectedEdgeIdsRef.current);
      return derivedEdges.map((edge) => {
        const existing = prevMap.get(edge.id);
        const selected = existing?.selected ?? selectedSet.has(edge.id);
        return selected ? { ...edge, selected } : edge;
      });
    });
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

  const isHandleTarget = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    return Boolean(target?.closest(".react-flow__handle"));
  };

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

  const removeActors = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      const nextActors = model.actors.filter((actor) => !idSet.has(actor.id));
      const nextChannels = model.channels.filter(
        (channel) => !idSet.has(channel.src) && !idSet.has(channel.dst)
      );
      setModel({ ...model, actors: nextActors, channels: nextChannels }, "visual");
    },
    [model, setModel]
  );

  const removeActor = useCallback((id: string) => removeActors([id]), [removeActors]);

  const duplicateSelection = useCallback(() => {
    const selectedIds = selectedNodeIdsRef.current;
    if (selectedIds.length === 0) return;
    const idMap = new Map<string, string>();
    const nextActors = [...model.actors];
    const nextChannels = [...model.channels];

    const newSelectedIds: string[] = [];
    selectedIds.forEach((actorId, index) => {
      const actor = model.actors.find((entry) => entry.id === actorId);
      if (!actor) return;
      const id = nextId(
        "a",
        nextActors.map((entry) => entry.id)
      );
      idMap.set(actorId, id);
      newSelectedIds.push(id);
      const nextActor = {
        ...actor,
        id,
        label: actor.label ? `${actor.label} Copy` : `${actor.id.toUpperCase()} Copy`,
      };
      nextActors.push(nextActor);

      const position = actorPositions?.[actorId];
      if (position) {
        setActorPosition(id, { x: position.x + 32, y: position.y + 32 });
      }
      if (index === 0) {
        selectActor(id);
      }
    });

    model.channels.forEach((channel) => {
      const nextSrc = idMap.get(channel.src);
      const nextDst = idMap.get(channel.dst);
      if (!nextSrc || !nextDst) return;
      const id = nextId(
        "c",
        nextChannels.map((entry) => entry.id)
      );
      nextChannels.push({
        ...channel,
        id,
        src: nextSrc,
        dst: nextDst,
      });
    });

    const sortedSelectedIds = [...newSelectedIds].sort();
    setModel({ ...model, actors: nextActors, channels: nextChannels }, "visual");
    selectedNodeIdsRef.current = sortedSelectedIds;
    selectedEdgeIdsRef.current = [];
  }, [actorPositions, model, selectActor, setActorPosition, setModel]);

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
    if (!selectedActorId) return;
    setNodes((prev) =>
      prev.map((node) =>
        node.id === selectedActorId && !node.selected ? { ...node, selected: true } : node
      )
    );
  }, [selectedActorId, setNodes]);

  useEffect(() => {
    if (!selectedChannelId) return;
    setEdges((prev) =>
      prev.map((edge) =>
        edge.id === selectedChannelId && !edge.selected ? { ...edge, selected: true } : edge
      )
    );
  }, [selectedChannelId, setEdges]);

  useEffect(() => {
    keydownStateRef.current = {
      addActorAt,
      getFlowPositionFromPointer,
      duplicateSelection,
      removeActors,
      removeChannels,
      removeActor,
      selectedActorId,
      selectedChannelId,
      selectActor,
      setContextMenu,
    };
  }, [
    addActorAt,
    getFlowPositionFromPointer,
    duplicateSelection,
    removeActors,
    removeChannels,
    removeActor,
    selectedActorId,
    selectedChannelId,
    selectActor,
    setContextMenu,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const state = keydownStateRef.current;
      if (!state) return;
      const {
        addActorAt: addActor,
        getFlowPositionFromPointer: getPosition,
        duplicateSelection: duplicateSelected,
        removeActors: removeActorBatch,
        removeChannels: removeChannelBatch,
        removeActor: removeSingleActor,
        selectedActorId: selectedActor,
        selectedChannelId: selectedChannel,
        selectActor: clearSelection,
        setContextMenu: closeContextMenu,
      } = state;
      if (event.defaultPrevented) return;
      if (event.altKey) return;
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
        const selectedNodeIds = selectedNodeIdsRef.current;
        const selectedEdgeIds = selectedEdgeIdsRef.current;
        if (
          selectedNodeIds.length === 0 &&
          selectedEdgeIds.length === 0 &&
          !selectedActor &&
          !selectedChannel
        ) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (selectedNodeIds.length > 0) {
          removeActorBatch(selectedNodeIds);
        } else if (selectedEdgeIds.length > 0) {
          removeChannelBatch(selectedEdgeIds);
        } else if (selectedActor) {
          removeSingleActor(selectedActor);
        } else if (selectedChannel) {
          removeChannelBatch([selectedChannel]);
        }
        selectedNodeIdsRef.current = [];
        selectedEdgeIdsRef.current = [];
        closeContextMenu(null);
        clearSelection();
        return;
      }

      if (event.key.toLowerCase() === "a") {
        if (event.metaKey || event.ctrlKey) return;
        event.preventDefault();
        event.stopPropagation();
        addActor(getPosition());
        closeContextMenu(null);
      }

      if (event.key.toLowerCase() === "d" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        event.stopPropagation();
        duplicateSelected();
        closeContextMenu(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="flex h-full min-h-0 w-full flex-col rounded-2xl border border-[color:var(--panel-border)] bg-[color:var(--panel)] shadow-sm">
      <div
        ref={wrapperRef}
        className="relative min-h-0 flex-1"
        onMouseMove={(event) => {
          lastPointerRef.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerDownCapture={(event) => {
          if (!contextMenu) return;
          const target = event.target as HTMLElement | null;
          if (target?.closest("[data-polygraph-context-menu]")) return;
          setContextMenu(null);
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
          panOnDrag={[1]}
          panOnScroll={false}
          zoomOnScroll
          preventScrolling
          connectionRadius={30}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          selectionOnDrag
          onSelectionChange={({ nodes: selectedNodes, edges: selectedEdges }) => {
            const nextNodeIds = selectedNodes.map((node) => node.id).sort();
            const nextEdgeIds = selectedEdges.map((edge) => edge.id).sort();

            if (!arraysEqual(selectedNodeIdsRef.current, nextNodeIds)) {
              selectedNodeIdsRef.current = nextNodeIds;
            }
            if (!arraysEqual(selectedEdgeIdsRef.current, nextEdgeIds)) {
              selectedEdgeIdsRef.current = nextEdgeIds;
            }

            if (nextNodeIds.length === 1 && nextEdgeIds.length === 0) {
              if (selectedActorId !== nextNodeIds[0]) {
                selectActor(nextNodeIds[0]);
              }
              return;
            }
            if (nextEdgeIds.length === 1 && nextNodeIds.length === 0) {
              if (selectedChannelId !== nextEdgeIds[0]) {
                selectChannel(nextEdgeIds[0]);
              }
              return;
            }
            if (nextNodeIds.length === 0 && nextEdgeIds.length === 0) {
              if (selectedActorId || selectedChannelId) {
                selectActor();
              }
            }
          }}
          onEdgesDelete={(edgesToDelete) => removeChannels(edgesToDelete.map((edge) => edge.id))}
          onEdgeDoubleClick={(_, edge) => removeChannels([edge.id])}
          onConnect={handleConnect}
          onInit={(instance) => {
            flowRef.current = instance;
          }}
          onPaneClick={() => {
            if (contextMenu) setContextMenu(null);
            selectedNodeIdsRef.current = [];
            selectedEdgeIdsRef.current = [];
            setNodes((prev) =>
              prev.map((node) => (node.selected ? { ...node, selected: false } : node))
            );
            setEdges((prev) =>
              prev.map((edge) => (edge.selected ? { ...edge, selected: false } : edge))
            );
            selectActor();
          }}
          onPaneContextMenu={(event) => {
            const instance = flowRef.current;
            const position = instance
              ? instance.screenToFlowPosition({ x: event.clientX, y: event.clientY })
              : defaultPosition(model.actors.length);
            openContextMenu(event, { type: "pane", flowPosition: position });
          }}
          onNodeClick={(event, node) => {
            if (isHandleTarget(event)) return;
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
            data-polygraph-context-menu
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


