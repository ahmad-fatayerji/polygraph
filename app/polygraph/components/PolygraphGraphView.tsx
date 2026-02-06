"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import ReactFlow, {
  MarkerType,
  Position,
  getNodesBounds,
  getViewportForBounds,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import { toJpeg, toPng, toSvg } from "html-to-image";
import { usePolygraphStore } from "../store";
import type { PolyGraphModel } from "@/lib/polygraph/types";
import { defaultPosition } from "../graphLayout";

export default function PolygraphGraphView({
  model,
}: {
  model: PolyGraphModel;
}) {
  const actorPositions = usePolygraphStore((state) => state.ui.actorPositions);
  const selectedActorId = usePolygraphStore(
    (state) => state.ui.selectedActorId,
  );
  const selectedChannelId = usePolygraphStore(
    (state) => state.ui.selectedChannelId,
  );
  const flowRef = useRef<ReactFlowInstance | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const nodes = useMemo<Node[]>(() => {
    return model.actors.map((actor, idx) => ({
      id: actor.id,
      data: {
        label: (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-[color:var(--foreground)]">
              {actor.label ?? actor.id}
            </span>
            <span className="text-[11px] text-[color:var(--muted)]">
              {actor.timed
                ? actor.freq !== undefined
                  ? `Timed - ${actor.freq} Hz`
                  : actor.period !== undefined
                    ? `Timed - ${actor.period} ms`
                    : "Timed - ?"
                : "Untimed"}
            </span>
          </div>
        ),
      },
      position: actorPositions?.[actor.id] ?? defaultPosition(idx),
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      selectable: false,
      draggable: false,
      style: {
        borderRadius: 18,
        padding: "14px 16px",
        border:
          actor.id === selectedActorId
            ? "2px solid var(--accent)"
            : "1px solid var(--panel-border)",
        background: actor.timed ? "var(--node-timed-bg)" : "var(--node-bg)",
        color: "var(--foreground)",
        boxShadow: "0 16px 30px rgba(0, 0, 0, 0.1)",
        minWidth: 160,
      },
    }));
  }, [model.actors, actorPositions, selectedActorId]);

  const edges = useMemo<Edge[]>(() => {
    return model.channels.map((channel) => ({
      id: channel.id,
      source: channel.src,
      target: channel.dst,
      label: `${channel.rateSrc} -> ${channel.rateDst}`,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color:
          channel.id === selectedChannelId
            ? "var(--edge-active)"
            : "var(--edge)",
      },
      style: {
        stroke:
          channel.id === selectedChannelId
            ? "var(--edge-active)"
            : "var(--edge)",
        strokeWidth: channel.id === selectedChannelId ? 2.2 : 1.4,
      },
      labelStyle: {
        fill: "var(--foreground)",
        fontSize: 11,
        fontWeight: 600,
      },
      labelBgPadding: [8, 4],
      labelBgBorderRadius: 10,
      labelBgStyle: {
        fill: "var(--panel)",
        fillOpacity: 0.9,
        stroke: "var(--panel-border)",
        strokeWidth: 1,
      },
    }));
  }, [model.channels, selectedChannelId]);
  const isExportDisabled = isExporting || nodes.length === 0;

  const handleExport = useCallback(
    async (format: "svg" | "png" | "jpg") => {
      if (isExporting) return;
      const viewport = containerRef.current?.querySelector(
        ".react-flow__viewport",
      ) as HTMLElement | null;
      if (!viewport) return;
      const nodesForBounds = flowRef.current?.getNodes() ?? nodes;
      if (nodesForBounds.length === 0) return;
      const bounds = getNodesBounds(nodesForBounds);
      const padding = 80;
      const fallbackBounds = viewport.getBoundingClientRect();
      const width = Math.max(
        Math.ceil(bounds.width + padding * 2),
        Math.ceil(fallbackBounds.width),
      );
      const height = Math.max(
        Math.ceil(bounds.height + padding * 2),
        Math.ceil(fallbackBounds.height),
      );
      const safeBounds =
        bounds.width > 0 && bounds.height > 0
          ? bounds
          : {
              x: 0,
              y: 0,
              width: Math.max(fallbackBounds.width, 1),
              height: Math.max(fallbackBounds.height, 1),
            };
      const viewportForBounds = getViewportForBounds(
        safeBounds,
        width,
        height,
        0.2,
        2,
        0.1,
      );
      const background =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--panel")
          .trim() || "#ffffff";

      setIsExporting(true);
      try {
        const commonOptions = {
          backgroundColor: background,
          width,
          height,
          skipFonts: true,
          style: {
            width: `${width}px`,
            height: `${height}px`,
            transform: `translate(${viewportForBounds.x}px, ${viewportForBounds.y}px) scale(${viewportForBounds.zoom})`,
            transformOrigin: "top left",
          },
        };
        const dataUrl =
          format === "svg"
            ? await toSvg(viewport, commonOptions)
            : format === "png"
              ? await toPng(viewport, commonOptions)
              : await toJpeg(viewport, { ...commonOptions, quality: 0.95 });
        const fileBase =
          model.meta?.name?.trim().replace(/[^a-z0-9\-_]+/gi, "-") ||
          "polygraph";
        const link = document.createElement("a");
        link.download = `${fileBase}.${format}`;
        link.href = dataUrl;
        link.click();
      } finally {
        setIsExporting(false);
      }
    },
    [isExporting, model.meta?.name, nodes],
  );

  return (
    <div
      ref={containerRef}
      className="relative h-[280px] min-h-[240px] w-full overflow-hidden rounded-2xl border border-[color:var(--panel-border)] bg-[color:var(--panel)] shadow-sm"
    >
      <div className="absolute right-3 top-3 z-10 flex items-center gap-2 rounded-full border border-[color:var(--panel-border)] bg-[color:var(--panel)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted-strong)] shadow">
        <span>Export</span>
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[color:var(--muted)]">
          <button
            type="button"
            className="rounded-full border border-[color:var(--panel-border)] px-3 py-1 transition hover:border-[color:var(--muted)]"
            onClick={() => handleExport("svg")}
            disabled={isExportDisabled}
          >
            SVG
          </button>
          <button
            type="button"
            className="rounded-full border border-[color:var(--panel-border)] px-3 py-1 transition hover:border-[color:var(--muted)]"
            onClick={() => handleExport("png")}
            disabled={isExportDisabled}
          >
            PNG
          </button>
          <button
            type="button"
            className="rounded-full border border-[color:var(--panel-border)] px-3 py-1 transition hover:border-[color:var(--muted)]"
            onClick={() => handleExport("jpg")}
            disabled={isExportDisabled}
          >
            JPG
          </button>
        </div>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnDoubleClick={false}
        onInit={(instance) => {
          flowRef.current = instance;
        }}
      />
    </div>
  );
}
