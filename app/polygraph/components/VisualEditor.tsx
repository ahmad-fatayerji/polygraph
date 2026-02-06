"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import ReactFlow, {
  Background,
  Controls,
  Position,
  SelectionMode,
  type Connection,
  type Edge,
  type Node,
  type ReactFlowInstance,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useStoreApi,
} from "reactflow";
import "reactflow/dist/style.css";
import type { PolyGraphModel } from "@/lib/polygraph/types";
import { usePolygraphStore } from "../store";
import { defaultPosition, type ActorPosition } from "../graphLayout";

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
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

const cloneValue = <T,>(value: T): T => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

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

type HistoryEntry = {
  model: PolyGraphModel;
  actorPositions?: Record<string, ActorPosition>;
  selectedActorId?: string;
  selectedChannelId?: string;
};

const MAX_HISTORY = 100;
const HISTORY_KEY = "polygraph:visualHistory";

const readStoredHistory = (): {
  undo: HistoryEntry[];
  redo: HistoryEntry[];
} | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      undo?: HistoryEntry[];
      redo?: HistoryEntry[];
    };
    return {
      undo: Array.isArray(parsed.undo) ? parsed.undo : [],
      redo: Array.isArray(parsed.redo) ? parsed.redo : [],
    };
  } catch {
    return null;
  }
};

const writeStoredHistory = (history: {
  undo: HistoryEntry[];
  redo: HistoryEntry[];
}) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
};

function VisualEditorInner() {
  const model = usePolygraphStore((state) => state.model);
  const setModel = usePolygraphStore((state) => state.setModel);
  const setActorPosition = usePolygraphStore((state) => state.setActorPosition);
  const setActorPositions = usePolygraphStore(
    (state) => state.setActorPositions,
  );
  const selectActor = usePolygraphStore((state) => state.selectActor);
  const selectChannel = usePolygraphStore((state) => state.selectChannel);
  const actorPositions = usePolygraphStore((state) => state.ui.actorPositions);
  const selectedActorId = usePolygraphStore(
    (state) => state.ui.selectedActorId,
  );
  const selectedChannelId = usePolygraphStore(
    (state) => state.ui.selectedChannelId,
  );

  const store = useStoreApi();

  const flowRef = useRef<ReactFlowInstance | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const selectedNodeIdsRef = useRef<string[]>([]);
  const selectedEdgeIdsRef = useRef<string[]>([]);
  const suppressSelectionChangeRef = useRef(false);
  const selectionSuppressionFrameRef = useRef<number | null>(null);
  const undoStackRef = useRef<HistoryEntry[]>([]);
  const redoStackRef = useRef<HistoryEntry[]>([]);
  const dragStartPositionsRef = useRef<Record<string, ActorPosition> | null>(
    null,
  );
  const dragModeRef = useRef<"node" | "selection" | null>(null);
  const keydownStateRef = useRef<{
    addActorAt: (position: { x: number; y: number }) => void;
    getFlowPositionFromPointer: () => { x: number; y: number };
    duplicateSelection: () => void;
    clearSelectionState: () => void;
    removeActors: (ids: string[]) => void;
    removeChannels: (ids: string[]) => void;
    removeActor: (id: string) => void;
    undo: () => void;
    redo: () => void;
    selectedActorId?: string;
    selectedChannelId?: string;
    selectActor: (id?: string) => void;
    setContextMenu: (
      value: ContextMenuState | ((prev: ContextMenuState) => ContextMenuState),
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

  useEffect(() => {
    const stored = readStoredHistory();
    if (!stored) return;
    undoStackRef.current = stored.undo.slice(-MAX_HISTORY);
    redoStackRef.current = stored.redo.slice(-MAX_HISTORY);
  }, []);

  const getSnapshot = useCallback(
    (): HistoryEntry => ({
      model: cloneValue(model),
      actorPositions: actorPositions ? { ...actorPositions } : undefined,
      selectedActorId,
      selectedChannelId,
    }),
    [actorPositions, model, selectedActorId, selectedChannelId],
  );

  const pushHistory = useCallback(() => {
    undoStackRef.current.push(getSnapshot());
    if (undoStackRef.current.length > MAX_HISTORY) {
      undoStackRef.current.shift();
    }
    redoStackRef.current = [];
    writeStoredHistory({
      undo: undoStackRef.current,
      redo: redoStackRef.current,
    });
  }, [getSnapshot]);

  const applyHistoryEntry = useCallback(
    (entry: HistoryEntry) => {
      selectedNodeIdsRef.current = entry.selectedActorId
        ? [entry.selectedActorId]
        : [];
      selectedEdgeIdsRef.current = entry.selectedChannelId
        ? [entry.selectedChannelId]
        : [];
      setModel(entry.model, "visual");
      if (entry.actorPositions) {
        setActorPositions(entry.actorPositions);
      }
      if (entry.selectedActorId) {
        selectActor(entry.selectedActorId);
      } else if (entry.selectedChannelId) {
        selectChannel(entry.selectedChannelId);
      } else {
        selectActor();
      }
    },
    [selectActor, selectChannel, setActorPositions, setModel],
  );

  const undo = useCallback(() => {
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    redoStackRef.current.push(getSnapshot());
    applyHistoryEntry(previous);
    writeStoredHistory({
      undo: undoStackRef.current,
      redo: redoStackRef.current,
    });
  }, [applyHistoryEntry, getSnapshot]);

  const redo = useCallback(() => {
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current.push(getSnapshot());
    applyHistoryEntry(next);
    writeStoredHistory({
      undo: undoStackRef.current,
      redo: redoStackRef.current,
    });
  }, [applyHistoryEntry, getSnapshot]);

  const addActorAt = useCallback(
    (position: { x: number; y: number }) => {
      pushHistory();
      const id = nextId(
        "a",
        model.actors.map((actor) => actor.id),
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
    [model, pushHistory, selectActor, setActorPosition, setModel],
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
        | { type: "pane"; flowPosition: { x: number; y: number } },
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
              },
        );
      }
    },
    [clampToBounds],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      pushHistory();
      const id = nextId(
        "c",
        model.channels.map((channel) => channel.id),
      );
      const nextChannel = {
        id,
        src: connection.source,
        dst: connection.target,
        rateSrc: "1",
        rateDst: "-1",
        init: "0",
      };
      setModel(
        { ...model, channels: [...model.channels, nextChannel] },
        "visual",
      );
      selectChannel(id);
    },
    [model, pushHistory, selectChannel, setModel],
  );

  const removeChannels = useCallback(
    (ids: string[]) => {
      if (ids.length == 0) return;
      pushHistory();
      const nextChannels = model.channels.filter(
        (channel) => !ids.includes(channel.id),
      );
      setModel({ ...model, channels: nextChannels }, "visual");
    },
    [model, pushHistory, setModel],
  );

  const removeActors = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      pushHistory();
      const idSet = new Set(ids);
      const nextActors = model.actors.filter((actor) => !idSet.has(actor.id));
      const nextChannels = model.channels.filter(
        (channel) => !idSet.has(channel.src) && !idSet.has(channel.dst),
      );
      setModel(
        { ...model, actors: nextActors, channels: nextChannels },
        "visual",
      );
    },
    [model, pushHistory, setModel],
  );

  const removeActor = useCallback(
    (id: string) => removeActors([id]),
    [removeActors],
  );

  const suppressSelectionChange = useCallback(() => {
    suppressSelectionChangeRef.current = true;
    if (selectionSuppressionFrameRef.current !== null) {
      cancelAnimationFrame(selectionSuppressionFrameRef.current);
    }
    selectionSuppressionFrameRef.current = requestAnimationFrame(() => {
      suppressSelectionChangeRef.current = false;
      selectionSuppressionFrameRef.current = null;
    });
  }, []);

  const applySelectionState = useCallback(
    (nodeIds: string[], edgeIds: string[]) => {
      const nextNodeIds = [...nodeIds].sort();
      const nextEdgeIds = [...edgeIds].sort();
      suppressSelectionChange();
      selectedNodeIdsRef.current = nextNodeIds;
      selectedEdgeIdsRef.current = nextEdgeIds;

      setNodes((prev) =>
        prev.map((node) => {
          const selected = nextNodeIds.includes(node.id);
          return node.selected === selected ? node : { ...node, selected };
        }),
      );
      setEdges((prev) =>
        prev.map((edge) => {
          const selected = nextEdgeIds.includes(edge.id);
          return edge.selected === selected ? edge : { ...edge, selected };
        }),
      );
    },
    [setEdges, setNodes, suppressSelectionChange],
  );

  const clearSelectionState = useCallback(() => {
    applySelectionState([], []);
    selectActor();
  }, [applySelectionState, selectActor]);

  const duplicateSelection = useCallback(() => {
    const selectedIdsFromNodes = nodes
      .filter((node) => node.selected)
      .map((node) => node.id);
    const selectedIds =
      selectedIdsFromNodes.length > 0
        ? selectedIdsFromNodes
        : selectedNodeIdsRef.current;
    if (selectedIds.length === 0) return;
    pushHistory();
    const idMap = new Map<string, string>();
    const nextActors = [...model.actors];
    const nextChannels = [...model.channels];
    const positionLookup = new Map<string, ActorPosition>();
    nodes.forEach((node) => {
      const position = node.positionAbsolute ?? node.position;
      positionLookup.set(node.id, { x: position.x, y: position.y });
    });

    const newActorPositions: Record<string, ActorPosition> = {};
    const newSelectedIds: string[] = [];
    selectedIds.forEach((actorId) => {
      const actor = model.actors.find((entry) => entry.id === actorId);
      if (!actor) return;
      const id = nextId(
        "a",
        nextActors.map((entry) => entry.id),
      );
      idMap.set(actorId, id);
      newSelectedIds.push(id);
      const nextActor = {
        ...actor,
        id,
        label: actor.label
          ? `${actor.label} Copy`
          : `${actor.id.toUpperCase()} Copy`,
      };
      nextActors.push(nextActor);

      const fallbackIndex = model.actors.findIndex(
        (entry) => entry.id === actorId,
      );
      const fallbackPosition =
        fallbackIndex >= 0 ? defaultPosition(fallbackIndex) : undefined;
      const position =
        positionLookup.get(actorId) ??
        actorPositions?.[actorId] ??
        fallbackPosition;
      if (position) {
        newActorPositions[id] = { x: position.x + 32, y: position.y + 32 };
      }
    });

    model.channels.forEach((channel) => {
      const nextSrc = idMap.get(channel.src);
      const nextDst = idMap.get(channel.dst);
      if (!nextSrc || !nextDst) return;
      const id = nextId(
        "c",
        nextChannels.map((entry) => entry.id),
      );
      nextChannels.push({
        ...channel,
        id,
        src: nextSrc,
        dst: nextDst,
      });
    });

    if (Object.keys(newActorPositions).length > 0) {
      setActorPositions(newActorPositions);
    }

    // Clear ReactFlow's internal selection state to remove the blue highlight box
    const { unselectNodesAndEdges, resetSelectedElements } = store.getState();
    if (typeof unselectNodesAndEdges === "function") {
      unselectNodesAndEdges();
    }
    if (typeof resetSelectedElements === "function") {
      resetSelectedElements();
    }

    // Also clear our tracked selection refs
    selectedNodeIdsRef.current = [];
    selectedEdgeIdsRef.current = [];

    setModel(
      { ...model, actors: nextActors, channels: nextChannels },
      "visual",
    );

    // After a frame, select the new duplicated nodes (without the selection box)
    requestAnimationFrame(() => {
      applySelectionState(newSelectedIds, []);
      if (newSelectedIds.length === 1 && newSelectedIds[0]) {
        selectActor(newSelectedIds[0]);
      } else {
        selectActor();
      }
    });
  }, [
    actorPositions,
    applySelectionState,
    model,
    nodes,
    pushHistory,
    selectActor,
    setActorPositions,
    setModel,
    store,
  ]);

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

  const getNodePosition = useCallback((node: Node) => {
    const position = node.positionAbsolute ?? node.position;
    return { x: position.x, y: position.y };
  }, []);

  const ensureGroupSelection = useCallback(
    (nodeId: string) => {
      const desiredNodeIds = selectedNodeIdsRef.current;
      if (desiredNodeIds.length <= 1 || !desiredNodeIds.includes(nodeId))
        return;
      const currentSelectedIds = nodes
        .filter((node) => node.selected)
        .map((node) => node.id);
      if (currentSelectedIds.length === 1 && currentSelectedIds[0] === nodeId) {
        applySelectionState(desiredNodeIds, selectedEdgeIdsRef.current);
      }
    },
    [applySelectionState, nodes],
  );

  useEffect(() => {
    if (!selectedActorId) return;
    setNodes((prev) =>
      prev.map((node) =>
        node.id === selectedActorId && !node.selected
          ? { ...node, selected: true }
          : node,
      ),
    );
  }, [selectedActorId, setNodes]);

  useEffect(() => {
    if (!selectedChannelId) return;
    setEdges((prev) =>
      prev.map((edge) =>
        edge.id === selectedChannelId && !edge.selected
          ? { ...edge, selected: true }
          : edge,
      ),
    );
  }, [selectedChannelId, setEdges]);

  useEffect(() => {
    keydownStateRef.current = {
      addActorAt,
      getFlowPositionFromPointer,
      duplicateSelection,
      clearSelectionState,
      removeActors,
      removeChannels,
      removeActor,
      undo,
      redo,
      selectedActorId,
      selectedChannelId,
      selectActor,
      setContextMenu,
    };
  }, [
    addActorAt,
    getFlowPositionFromPointer,
    duplicateSelection,
    clearSelectionState,
    removeActors,
    removeChannels,
    removeActor,
    undo,
    redo,
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
        clearSelectionState: clearSelection,
        removeActors: removeActorBatch,
        removeChannels: removeChannelBatch,
        removeActor: removeSingleActor,
        undo: undoAction,
        redo: redoAction,
        selectedActorId: selectedActor,
        selectedChannelId: selectedChannel,
        selectActor: clearSingleSelection,
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

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) {
          redoAction();
        } else {
          undoAction();
        }
        closeContextMenu(null);
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        event.stopPropagation();
        redoAction();
        closeContextMenu(null);
        return;
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
          selectionMode={SelectionMode.Partial}
          onSelectionChange={({
            nodes: selectedNodes,
            edges: selectedEdges,
          }) => {
            if (suppressSelectionChangeRef.current) return;
            const nextNodeIds = selectedNodes.map((node) => node.id).sort();
            const nextEdgeIds = selectedEdges.map((edge) => edge.id).sort();
            const hasMultipleSelection =
              nextNodeIds.length + nextEdgeIds.length > 1;

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
            if (
              hasMultipleSelection &&
              (selectedActorId || selectedChannelId)
            ) {
              selectActor();
              return;
            }
            if (nextNodeIds.length === 0 && nextEdgeIds.length === 0) {
              if (selectedActorId || selectedChannelId) {
                selectActor();
              }
            }
          }}
          onEdgesDelete={(edgesToDelete) =>
            removeChannels(edgesToDelete.map((edge) => edge.id))
          }
          onEdgeDoubleClick={(_, edge) => removeChannels([edge.id])}
          onConnect={handleConnect}
          onInit={(instance) => {
            flowRef.current = instance;
          }}
          onPaneClick={() => {
            if (contextMenu) setContextMenu(null);
            clearSelectionState();
          }}
          onPaneContextMenu={(event) => {
            const instance = flowRef.current;
            const position = instance
              ? instance.screenToFlowPosition({
                  x: event.clientX,
                  y: event.clientY,
                })
              : defaultPosition(model.actors.length);
            openContextMenu(event, { type: "pane", flowPosition: position });
          }}
          onNodeClick={(event, node) => {
            if (isHandleTarget(event)) return;
            if (contextMenu) setContextMenu(null);
            if (
              selectedNodeIdsRef.current.length > 1 &&
              selectedNodeIdsRef.current.includes(node.id)
            ) {
              return;
            }
            selectActor(node.id);
          }}
          onNodeDragStart={(_, node) => {
            if (!node) return;
            ensureGroupSelection(node.id);
            dragModeRef.current = "node";
            // Capture positions of ALL selected nodes, not just the node being dragged
            const selectedNodes = nodes.filter(
              (n) => n.selected || selectedNodeIdsRef.current.includes(n.id),
            );
            if (
              selectedNodes.length > 1 &&
              selectedNodes.some((n) => n.id === node.id)
            ) {
              const positions: Record<string, ActorPosition> = {};
              selectedNodes.forEach((n) => {
                positions[n.id] = getNodePosition(n);
              });
              dragStartPositionsRef.current = positions;
            } else {
              dragStartPositionsRef.current = {
                [node.id]: getNodePosition(node),
              };
            }
          }}
          onSelectionDragStart={(_, selectedNodes) => {
            dragModeRef.current = "selection";
            const positions: Record<string, ActorPosition> = {};
            selectedNodes.forEach((node) => {
              positions[node.id] = getNodePosition(node);
            });
            dragStartPositionsRef.current = positions;
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
            const startPositions = dragStartPositionsRef.current;
            const selectedNodeIds = Object.keys(startPositions ?? {});
            const isMultiNodeDrag =
              dragModeRef.current === "node" && selectedNodeIds.length > 1;

            if (dragModeRef.current === "node") {
              const start = startPositions?.[node.id];
              const next = getNodePosition(node);
              if (start && (start.x !== next.x || start.y !== next.y)) {
                pushHistory();
              }
              dragStartPositionsRef.current = null;
              dragModeRef.current = null;
            }

            if (isMultiNodeDrag) {
              // Update positions for ALL selected nodes that were dragged together
              const positionsToUpdate: Record<string, ActorPosition> = {};
              const selectedNodes = nodes.filter((n) =>
                selectedNodeIds.includes(n.id),
              );
              selectedNodes.forEach((n) => {
                positionsToUpdate[n.id] = getNodePosition(n);
              });
              setActorPositions(positionsToUpdate);
            } else {
              setActorPosition(node.id, getNodePosition(node));
            }
          }}
          onSelectionDragStop={(_, draggedNodes) => {
            if (
              dragModeRef.current === "selection" &&
              dragStartPositionsRef.current
            ) {
              const startPositions = dragStartPositionsRef.current;
              const moved = draggedNodes.some((node) => {
                const start = startPositions[node.id];
                if (!start) return false;
                const next = getNodePosition(node);
                return start.x !== next.x || start.y !== next.y;
              });
              if (moved) {
                pushHistory();
              }
              dragStartPositionsRef.current = null;
              dragModeRef.current = null;
            }
            draggedNodes.forEach((node) => {
              setActorPosition(node.id, getNodePosition(node));
            });
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
                  <span className="text-xs font-medium text-[color:var(--muted)]">
                    Del
                  </span>
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
                  <span className="text-xs font-medium text-[color:var(--muted)]">
                    A
                  </span>
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
                  <span className="text-xs font-medium text-[color:var(--muted)]">
                    Del
                  </span>
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

export default function VisualEditor() {
  return (
    <ReactFlowProvider>
      <VisualEditorInner />
    </ReactFlowProvider>
  );
}
