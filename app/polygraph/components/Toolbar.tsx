"use client";

import type { ReactNode } from "react";

type ToolbarProps = {
  onValidate: () => void;
  onExecute: () => void;
  onReset: () => void;
  status: "idle" | "running";
  cycles: number;
  onCyclesChange: (cycles: number) => void;
  captureDetailedTrace: boolean;
  onCaptureDetailedTraceChange: (captureDetailedTrace: boolean) => void;
};

const ToolbarButton = ({
  onClick,
  children,
  variant = "primary",
  disabled,
}: {
  onClick: () => void;
  children: ReactNode;
  variant?: "primary" | "ghost" | "outline";
  disabled?: boolean;
}) => {
  const base =
    "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2";
  const styles = {
    primary:
      "bg-[color:var(--accent)] text-[color:var(--accent-contrast)] hover:opacity-90 focus:ring-[color:var(--focus-ring)] focus:ring-offset-[color:var(--panel)]",
    ghost:
      "bg-transparent text-[color:var(--muted-strong)] hover:bg-[color:var(--accent-muted)] focus:ring-[color:var(--focus-ring)] focus:ring-offset-[color:var(--panel)]",
    outline:
      "border border-[color:var(--panel-border)] text-[color:var(--muted-strong)] hover:bg-[color:var(--accent-muted)] focus:ring-[color:var(--focus-ring)] focus:ring-offset-[color:var(--panel)]",
  }[variant];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${styles} ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
    >
      {children}
    </button>
  );
};

export default function Toolbar({
  onValidate,
  onExecute,
  onReset,
  status,
  cycles,
  onCyclesChange,
  captureDetailedTrace,
  onCaptureDetailedTraceChange,
}: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
          PolyGraph
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-full border border-[color:var(--panel-border)] px-3 py-1.5">
          <label
            htmlFor="cycles-input"
            className="text-xs font-medium text-[color:var(--muted)]"
          >
            Cycles
          </label>
          <input
            id="cycles-input"
            type="number"
            min={1}
            max={20}
            value={cycles}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (v >= 1 && v <= 20) onCyclesChange(v);
            }}
            className="w-10 rounded bg-[color:var(--panel-muted)] px-1.5 py-0.5 text-center text-xs font-semibold text-[color:var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[color:var(--focus-ring)]"
          />
        </div>
        <label className="flex items-center gap-2 rounded-full border border-[color:var(--panel-border)] px-3 py-1.5 text-xs font-medium text-[color:var(--muted)]">
          <input
            type="checkbox"
            checked={captureDetailedTrace}
            onChange={(e) => onCaptureDetailedTraceChange(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] text-[color:var(--accent)] focus:ring-[color:var(--focus-ring)]"
          />
          Full trace
        </label>
        <ToolbarButton onClick={onValidate} disabled={status === "running"}>
          Validate
        </ToolbarButton>
        <ToolbarButton
          onClick={onExecute}
          variant="outline"
          disabled={status === "running"}
        >
          Execute
        </ToolbarButton>
        <ToolbarButton
          onClick={onReset}
          variant="ghost"
          disabled={status === "running"}
        >
          Reset
        </ToolbarButton>
      </div>
    </div>
  );
}
