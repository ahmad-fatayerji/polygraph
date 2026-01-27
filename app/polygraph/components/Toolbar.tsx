"use client";

import type { ReactNode } from "react";

type ToolbarProps = {
  onValidate: () => void;
  onExecute: () => void;
  onReset: () => void;
  onToggleTheme: () => void;
  theme: "light" | "dark";
  status: "idle" | "running";
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
  onToggleTheme,
  theme,
  status,
}: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
          PolyGraph Workspace
        </p>
        <h1 className="text-2xl font-semibold text-[color:var(--foreground)]">
          Model editor, verifier, and witness execution
        </h1>
      </div>
      <div className="flex items-center gap-3">
        <ToolbarButton onClick={onToggleTheme} variant="outline">
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </ToolbarButton>
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
        <ToolbarButton onClick={onReset} variant="ghost" disabled={status === "running"}>
          Reset
        </ToolbarButton>
      </div>
    </div>
  );
}
