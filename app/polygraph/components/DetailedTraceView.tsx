"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ExecutionResult,
  PolyGraphModel,
  DetailedTraceStep,
} from "@/lib/polygraph/types";

export interface DetailedTraceViewHandle {
  exportPng: () => Promise<void>;
  exportSvg: () => void;
  exportCsv: () => void;
}

const DetailedTraceView = forwardRef<
  DetailedTraceViewHandle,
  { execution?: ExecutionResult; model: PolyGraphModel }
>(function DetailedTraceView(
  {
    execution,
    model,
  }: {
    execution?: ExecutionResult;
    model: PolyGraphModel;
  },
  ref,
) {
  const trace = execution?.artifacts?.detailedTrace;
  const tableRef = useRef<HTMLDivElement | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const channels = model.channels;
  const actors = model.actors;
  const timedActorIndices = actors
    .map((a, i) => (a.timed ? i : -1))
    .filter((i) => i >= 0);

  // --- Export PNG (direct OffscreenCanvas — no DOM cloning, no CSS resolution) ---
  const handleExportPng = useCallback(async () => {
    if (!trace || isExporting) return;
    setIsExporting(true);
    // Yield two rAF so the loading overlay paints before heavy work
    await new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r())),
    );
    try {
      const cs = getComputedStyle(document.documentElement);
      const v = (name: string, fallback: string) =>
        cs.getPropertyValue(name).trim() || fallback;

      const bgColor = v("--panel", "#18181b");
      const bgAltColor = v("--panel-muted", "#1f1f23");
      const headerBg = v("--panel-muted", "#1f1f23");
      const fgColor = v("--foreground", "#fafafa");
      const mutedColor = v("--muted-strong", "#a1a1aa");
      const borderColor = v("--panel-border", "#27272a");
      const fireBg = v("--severity-info-bg", "#14261a");
      const tickBg = v("--severity-warn-bg", "#26200f");

      const FONT_PX = 11;
      const FONT = `${FONT_PX}px "Consolas","Courier New",monospace`;
      const BOLD = `bold ${FONT_PX}px "Consolas","Courier New",monospace`;
      const SM = `${FONT_PX - 1}px "Consolas","Courier New",monospace`;
      const ROW_H = 22;
      const HEADER_H = 44;
      const PAD_X = 8;

      type Col = { label: string; sub?: string; w: number };
      const cols: Col[] = [
        { label: "State", w: 220 },
        ...channels.map((ch, i) => ({
          label: `c${i + 1}`,
          sub: `${ch.src}→${ch.dst}`.slice(0, 14),
          w: 62,
        })),
        { label: "τˡ", w: 44 },
        ...timedActorIndices.map((idx) => ({
          label: `a${idx + 1}`,
          sub: (actors[idx].label ?? actors[idx].id).slice(0, 10),
          w: 56,
        })),
        { label: "yσ", w: 220 },
        { label: "zσ", w: 44 },
      ];

      const totalW = cols.reduce((s, c) => s + c.w, 0);
      const totalH = HEADER_H + trace.length * ROW_H;

      const canvas = new OffscreenCanvas(totalW, totalH);
      const ctx = canvas.getContext("2d")!;

      // Background
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, totalW, totalH);

      // Header
      ctx.fillStyle = headerBg;
      ctx.fillRect(0, 0, totalW, HEADER_H);

      let x = 0;
      for (const col of cols) {
        const cx = x + col.w / 2;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (col.sub) {
          ctx.font = BOLD;
          ctx.fillStyle = mutedColor;
          ctx.fillText(col.label, cx, HEADER_H / 2 - 8, col.w - 4);
          ctx.font = SM;
          ctx.fillStyle = mutedColor;
          ctx.globalAlpha = 0.6;
          ctx.fillText(col.sub, cx, HEADER_H / 2 + 8, col.w - 4);
          ctx.globalAlpha = 1;
        } else {
          ctx.font = BOLD;
          ctx.fillStyle = mutedColor;
          ctx.fillText(col.label, cx, HEADER_H / 2, col.w - 4);
        }
        ctx.fillStyle = borderColor;
        ctx.fillRect(x + col.w - 1, 0, 1, HEADER_H);
        x += col.w;
      }
      // Header bottom border
      ctx.fillStyle = borderColor;
      ctx.fillRect(0, HEADER_H - 1, totalW, 1);

      // Rows
      for (let r = 0; r < trace.length; r++) {
        const step = trace[r];
        const y = HEADER_H + r * ROW_H;
        const isFireRow = step.label.startsWith("fire");
        const isTickRow = step.label.startsWith("tick");

        ctx.fillStyle = isFireRow
          ? fireBg
          : isTickRow
            ? tickBg
            : r % 2 === 0
              ? bgColor
              : bgAltColor;
        ctx.fillRect(0, y, totalW, ROW_H);
        ctx.fillStyle = borderColor;
        ctx.fillRect(0, y + ROW_H - 1, totalW, 1);

        const cells: string[] = [
          step.label,
          ...step.channelStates.slice(0, channels.length),
          String(step.tau),
          ...timedActorIndices.map((idx) => String(step.tracking[idx] ?? "0")),
          step.firingVector.join(" "),
          String(step.totalTicks),
        ];

        ctx.font = FONT;
        ctx.textBaseline = "middle";
        ctx.fillStyle = fgColor;
        x = 0;
        for (let ci = 0; ci < cols.length; ci++) {
          const col = cols[ci];
          if (ci === 0) {
            ctx.textAlign = "left";
            ctx.fillText(cells[0], x + PAD_X, y + ROW_H / 2, col.w - PAD_X * 2);
          } else {
            ctx.textAlign = "center";
            ctx.fillText(
              cells[ci] ?? "",
              x + col.w / 2,
              y + ROW_H / 2,
              col.w - 4,
            );
          }
          ctx.fillStyle = borderColor;
          ctx.fillRect(x + col.w - 1, y, 1, ROW_H);
          ctx.fillStyle = fgColor;
          x += col.w;
        }
      }

      const blob = await canvas.convertToBlob({ type: "image/png" });
      const url = URL.createObjectURL(blob);
      const name =
        model.meta?.name?.trim().replace(/[^a-z0-9\-_]+/gi, "-") || "polygraph";
      const link = document.createElement("a");
      link.download = `${name}-trace.png`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  }, [
    isExporting,
    trace,
    channels,
    actors,
    timedActorIndices,
    model.meta?.name,
  ]);

  // --- Export SVG (direct string builder — synchronous, vector, instant) ---
  const handleExportSvg = useCallback(() => {
    if (!trace) return;
    const cs = getComputedStyle(document.documentElement);
    const v = (name: string, fallback: string) =>
      cs.getPropertyValue(name).trim() || fallback;

    const bgColor = v("--panel", "#18181b");
    const bgAltColor = v("--panel-muted", "#1f1f23");
    const headerBg = v("--panel-muted", "#1f1f23");
    const fgColor = v("--foreground", "#fafafa");
    const mutedColor = v("--muted-strong", "#a1a1aa");
    const borderColor = v("--panel-border", "#27272a");
    const fireBg = v("--severity-info-bg", "#14261a");
    const tickBg = v("--severity-warn-bg", "#26200f");

    const FONT_PX = 11;
    const FONT_FAM = `"Consolas","Courier New",monospace`;
    const ROW_H = 22;
    const HEADER_H = 44;
    const PAD_X = 8;

    type Col = { label: string; sub?: string; w: number };
    const cols: Col[] = [
      { label: "State", w: 220 },
      ...channels.map((ch, i) => ({
        label: `c${i + 1}`,
        sub: `${ch.src}\u2192${ch.dst}`.slice(0, 16),
        w: 62,
      })),
      { label: "\u03c4\u02e1", w: 44 },
      ...timedActorIndices.map((idx) => ({
        label: `a${idx + 1}`,
        sub: (actors[idx].label ?? actors[idx].id).slice(0, 10),
        w: 56,
      })),
      { label: "y\u03c3", w: 220 },
      { label: "z\u03c3", w: 44 },
    ];

    const totalW = cols.reduce((s, c) => s + c.w, 0);
    const totalH = HEADER_H + trace.length * ROW_H;

    const esc = (s: string) =>
      s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const parts: string[] = [];
    parts.push(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">`,
    );
    parts.push(
      `<style>text{font-family:${FONT_FAM};font-size:${FONT_PX}px;}</style>`,
    );

    // Full background
    parts.push(
      `<rect width="${totalW}" height="${totalH}" fill="${esc(bgColor)}"/>`,
    );

    // Header background
    parts.push(
      `<rect width="${totalW}" height="${HEADER_H}" fill="${esc(headerBg)}"/>`,
    );

    // Header cells
    let x = 0;
    for (const col of cols) {
      const cx = x + col.w / 2;
      if (col.sub) {
        parts.push(
          `<text x="${cx}" y="${HEADER_H / 2 - 8}" text-anchor="middle" dominant-baseline="middle" ` +
            `fill="${esc(mutedColor)}" font-weight="bold" font-size="${FONT_PX}">${esc(col.label)}</text>`,
        );
        parts.push(
          `<text x="${cx}" y="${HEADER_H / 2 + 8}" text-anchor="middle" dominant-baseline="middle" ` +
            `fill="${esc(mutedColor)}" font-size="${FONT_PX - 1}" opacity="0.6">${esc(col.sub)}</text>`,
        );
      } else {
        parts.push(
          `<text x="${cx}" y="${HEADER_H / 2}" text-anchor="middle" dominant-baseline="middle" ` +
            `fill="${esc(mutedColor)}" font-weight="bold" font-size="${FONT_PX}">${esc(col.label)}</text>`,
        );
      }
      // Right border
      parts.push(
        `<line x1="${x + col.w}" y1="0" x2="${x + col.w}" y2="${HEADER_H}" stroke="${esc(borderColor)}" stroke-width="1"/>`,
      );
      x += col.w;
    }
    // Header bottom border
    parts.push(
      `<line x1="0" y1="${HEADER_H}" x2="${totalW}" y2="${HEADER_H}" stroke="${esc(borderColor)}" stroke-width="1"/>`,
    );

    // Rows
    for (let r = 0; r < trace.length; r++) {
      const step = trace[r];
      const ry = HEADER_H + r * ROW_H;
      const isFireRow = step.label.startsWith("fire");
      const isTickRow = step.label.startsWith("tick");
      const rowBg = isFireRow
        ? fireBg
        : isTickRow
          ? tickBg
          : r % 2 === 0
            ? bgColor
            : bgAltColor;

      parts.push(
        `<rect x="0" y="${ry}" width="${totalW}" height="${ROW_H}" fill="${esc(rowBg)}"/>`,
      );
      parts.push(
        `<line x1="0" y1="${ry + ROW_H}" x2="${totalW}" y2="${ry + ROW_H}" stroke="${esc(borderColor)}" stroke-width="1"/>`,
      );

      const cells: string[] = [
        step.label,
        ...step.channelStates.slice(0, channels.length),
        String(step.tau),
        ...timedActorIndices.map((idx) => String(step.tracking[idx] ?? "0")),
        step.firingVector.join(" "),
        String(step.totalTicks),
      ];

      x = 0;
      for (let ci = 0; ci < cols.length; ci++) {
        const col = cols[ci];
        const cy = ry + ROW_H / 2;
        if (ci === 0) {
          parts.push(
            `<text x="${x + PAD_X}" y="${cy}" dominant-baseline="middle" fill="${esc(fgColor)}">${esc(cells[0])}</text>`,
          );
        } else {
          parts.push(
            `<text x="${x + col.w / 2}" y="${cy}" text-anchor="middle" dominant-baseline="middle" fill="${esc(fgColor)}">${esc(cells[ci] ?? "")}</text>`,
          );
        }
        parts.push(
          `<line x1="${x + col.w}" y1="${ry}" x2="${x + col.w}" y2="${ry + ROW_H}" stroke="${esc(borderColor)}" stroke-width="1"/>`,
        );
        x += col.w;
      }
    }

    parts.push(`</svg>`);

    const blob = new Blob([parts.join("")], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const name =
      model.meta?.name?.trim().replace(/[^a-z0-9\-_]+/gi, "-") || "polygraph";
    const link = document.createElement("a");
    link.download = `${name}-trace.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }, [trace, channels, actors, timedActorIndices, model.meta?.name]);
  const handleExportCsv = useCallback(() => {
    if (!trace) return;
    const escape = (v: string) =>
      v.includes(",") || v.includes('"') || v.includes("\n")
        ? `"${v.replace(/"/g, '""')}"`
        : v;

    // Header row
    const headers: string[] = [
      "State",
      ...channels.map((ch, i) => `c${i + 1} (${ch.src}->${ch.dst})`),
      "tau_l",
      ...timedActorIndices.map(
        (idx) => `a${idx + 1} (${actors[idx].label ?? actors[idx].id})`,
      ),
      "y_sigma",
      "z_sigma",
    ];

    const rows = trace.map((step) => {
      const stateLabel = step.label.startsWith("s")
        ? `s${step.stateIndex}`
        : `s${step.stateIndex} = ${step.label}`;
      const cols: string[] = [
        stateLabel,
        ...step.channelStates.slice(0, channels.length).map(String),
        String(step.tau),
        ...timedActorIndices.map((idx) => String(step.tracking[idx] ?? 0)),
        `[${step.firingVector.join("; ")}]`,
        String(step.totalTicks),
      ];
      return cols.map(escape).join(",");
    });

    const csv = [headers.map(escape).join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const name =
      model.meta?.name?.trim().replace(/[^a-z0-9\-_]+/gi, "-") || "polygraph";
    const link = document.createElement("a");
    link.download = `${name}-trace.csv`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }, [trace, channels, actors, timedActorIndices, model.meta?.name]);

  useImperativeHandle(
    ref,
    () => ({
      exportPng: handleExportPng,
      exportSvg: handleExportSvg,
      exportCsv: handleExportCsv,
    }),
    [handleExportPng, handleExportSvg, handleExportCsv],
  );

  // --- Critical path analysis ---
  const criticalPaths = useMemo(() => {
    const schedule = execution?.artifacts?.schedule;
    const tickCount = execution?.artifacts?.hyperperiod?.tickCount;
    if (!schedule || !tickCount || schedule.length === 0) return null;

    // baseTick in ms = GCD of all timed actor periods
    const gcdF = (a: number, b: number): number =>
      b < 0.0001 ? a : gcdF(b, a % b);
    const periods = model.actors
      .filter((a) => a.timed)
      .map((a) => (a.period != null ? a.period : a.freq ? 1000 / a.freq : 0))
      .filter((p) => p > 0);
    const baseTick_ms = periods.length > 0 ? periods.reduce(gcdF) : 1;

    // Build adjacency (skip self-loops for path analysis)
    const outEdges = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    for (const a of model.actors) {
      outEdges.set(a.id, []);
      inDegree.set(a.id, 0);
    }
    for (const ch of model.channels) {
      if (ch.src !== ch.dst) {
        outEdges.get(ch.src)?.push(ch.dst);
        inDegree.set(ch.dst, (inDegree.get(ch.dst) ?? 0) + 1);
      }
    }
    const sources = model.actors
      .filter((a) => (inDegree.get(a.id) ?? 0) === 0)
      .map((a) => a.id);
    const sinkSet = new Set(
      model.actors
        .filter((a) => (outEdges.get(a.id) ?? []).length === 0)
        .map((a) => a.id),
    );

    // Actor firing ticks (and 2-hyperperiod extension for wrap-around)
    const actorTicks = new Map<string, number[]>();
    for (const step of schedule)
      for (const id of step.fires) {
        if (!actorTicks.has(id)) actorTicks.set(id, []);
        actorTicks.get(id)!.push(step.tick);
      }
    const extTicks = new Map<string, number[]>();
    for (const [id, tks] of actorTicks)
      extTicks.set(id, [...tks, ...tks.map((t) => t + tickCount)]);

    function latencyOf(
      chain: string[],
    ): { worst: number; best: number } | null {
      const starts = actorTicks.get(chain[0]);
      if (!starts) return null;
      const lats: number[] = [];
      for (const s of starts) {
        let cur = s;
        let ok = true;
        for (let i = 1; i < chain.length; i++) {
          const nexts = extTicks.get(chain[i]);
          if (!nexts) {
            ok = false;
            break;
          }
          const nxt = nexts.find((t) => t >= cur);
          if (nxt === undefined) {
            ok = false;
            break;
          }
          cur = nxt;
        }
        if (ok) lats.push(cur - s);
      }
      if (lats.length === 0) return null;
      return { worst: Math.max(...lats), best: Math.min(...lats) };
    }

    // DFS: enumerate all simple source→sink paths (capped)
    const allPaths: string[][] = [];
    const MAX = 300;
    function dfs(path: string[], visited: Set<string>) {
      if (allPaths.length >= MAX) return;
      const cur = path[path.length - 1];
      if (sinkSet.has(cur) && path.length > 1) allPaths.push([...path]);
      for (const nxt of outEdges.get(cur) ?? []) {
        if (!visited.has(nxt)) {
          visited.add(nxt);
          path.push(nxt);
          dfs(path, visited);
          path.pop();
          visited.delete(nxt);
        }
      }
    }
    for (const src of sources) dfs([src], new Set([src]));
    if (allPaths.length === 0) return null;

    const label = (id: string) =>
      model.actors.find((a) => a.id === id)?.label ?? id;

    const ranked = allPaths
      .map((chain) => ({ chain, lat: latencyOf(chain) }))
      .filter((r) => r.lat !== null)
      .sort((a, b) => b.lat!.worst - a.lat!.worst)
      .slice(0, 5);

    return { ranked, baseTick_ms, totalPaths: allPaths.length, label };
  }, [execution, model]);

  if (!trace || trace.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] p-4 text-sm text-[color:var(--muted)]">
        Run Execute to generate a detailed trace.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Table */}
      <div className="relative">
        {isExporting && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-[color:var(--panel)]/80 backdrop-blur-sm">
            <div className="flex items-center gap-2.5 rounded-full border border-[color:var(--panel-border)] bg-[color:var(--panel)] px-4 py-2 text-xs font-semibold text-[color:var(--muted-strong)] shadow-lg">
              <svg
                className="h-3.5 w-3.5 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"
                />
              </svg>
              Rendering PNG…
            </div>
          </div>
        )}
        <div
          ref={tableRef}
          className="overflow-auto rounded-xl border border-[color:var(--panel-border)]"
        >
          <table className="w-full border-collapse text-xs font-mono">
            <thead>
              <tr className="bg-[color:var(--panel-muted)]">
                <th className="sticky left-0 z-10 border-b border-r border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] px-3 py-2 text-left font-semibold text-[color:var(--muted-strong)]">
                  State
                </th>
                {channels.map((ch, i) => (
                  <th
                    key={`ch-${ch.id}`}
                    className="border-b border-r border-[color:var(--panel-border)] px-2 py-2 text-center font-semibold text-[color:var(--muted-strong)]"
                    title={`${ch.id}: ${ch.src} → ${ch.dst}`}
                  >
                    <div>
                      c<sub>{i + 1}</sub>
                    </div>
                    <div className="text-[9px] font-normal leading-tight text-[color:var(--muted)]">
                      {ch.src}→{ch.dst}
                    </div>
                  </th>
                ))}
                <th className="border-b border-r border-[color:var(--panel-border)] px-3 py-2 text-center font-semibold text-[color:var(--muted-strong)]">
                  τ<sup>l</sup>
                </th>
                {timedActorIndices.map((idx) => (
                  <th
                    key={`a-${idx}`}
                    className="border-b border-r border-[color:var(--panel-border)] px-2 py-2 text-center font-semibold text-[color:var(--muted-strong)]"
                    title={actors[idx].label ?? actors[idx].id}
                  >
                    <div>
                      a<sub>{idx + 1}</sub>
                    </div>
                    <div className="text-[9px] font-normal leading-tight text-[color:var(--muted)]">
                      {actors[idx].label ?? actors[idx].id}
                    </div>
                  </th>
                ))}
                <th className="border-b border-r border-[color:var(--panel-border)] px-3 py-2 text-center font-semibold text-[color:var(--muted-strong)]">
                  y<sup>σ</sup>
                </th>
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
      </div>

      {/* Critical Path Analysis */}
      {criticalPaths && criticalPaths.ranked.length > 0 && (
        <div className="rounded-xl border border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-[color:var(--muted-strong)]">
              Critical Path
            </span>
            <span className="text-[10px] text-[color:var(--muted)]">
              {criticalPaths.totalPaths} path
              {criticalPaths.totalPaths !== 1 ? "s" : ""} analysed
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {criticalPaths.ranked.map(({ chain, lat }, i) => (
              <div
                key={i}
                className={`rounded-lg border px-3 py-2.5 ${
                  i === 0
                    ? "border-[color:var(--accent)] bg-[color:var(--panel)]"
                    : "border-[color:var(--panel-border)] bg-[color:var(--panel)]"
                }`}
              >
                <div className="mb-1.5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-1.5">
                    {i === 0 && (
                      <span className="rounded-sm bg-[color:var(--accent)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-[color:var(--panel)]">
                        Critical
                      </span>
                    )}
                    <span className="text-[10px] font-semibold text-[color:var(--muted-strong)]">
                      #{i + 1}
                    </span>
                    <span className="text-[10px] text-[color:var(--muted)]">
                      {chain.length} actors
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-xs">
                    <span className="text-[color:var(--muted)]">
                      best&nbsp;
                      <span className="text-[color:var(--foreground)]">
                        {lat!.best} ticks
                        {" = "}
                        {(lat!.best * criticalPaths.baseTick_ms).toFixed(2)} ms
                      </span>
                    </span>
                    <span
                      className={
                        i === 0
                          ? "font-bold text-[color:var(--foreground)]"
                          : "text-[color:var(--muted-strong)]"
                      }
                    >
                      worst&nbsp;
                      <span
                        className={
                          i === 0
                            ? "text-blue-400"
                            : "text-[color:var(--foreground)]"
                        }
                      >
                        {lat!.worst} ticks
                        {" = "}
                        {(lat!.worst * criticalPaths.baseTick_ms).toFixed(2)} ms
                      </span>
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1 font-mono text-[10px]">
                  {chain.map((id, ci) => (
                    <span key={ci} className="flex items-center gap-1">
                      <span className="rounded bg-[color:var(--panel-muted)] px-1.5 py-0.5 text-[color:var(--foreground)]">
                        {criticalPaths.label(id)}
                      </span>
                      {ci < chain.length - 1 && (
                        <span className="text-[color:var(--muted)]">
                          &rarr;
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

export default DetailedTraceView;

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
