"use client";

import type { ReactNode } from "react";

type ToolbarProps = {
  onValidate: () => void;
  onExecute: () => void;
  onReset: () => void;
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
      "bg-black text-white hover:bg-neutral-800 focus:ring-neutral-700 focus:ring-offset-neutral-200",
    ghost:
      "bg-transparent text-neutral-700 hover:bg-neutral-200 focus:ring-neutral-400 focus:ring-offset-neutral-200",
    outline:
      "border border-neutral-300 text-neutral-700 hover:bg-neutral-100 focus:ring-neutral-400 focus:ring-offset-neutral-200",
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

export default function Toolbar({ onValidate, onExecute, onReset, status }: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-500">
          PolyGraph Workspace
        </p>
        <h1 className="text-2xl font-semibold text-neutral-900">
          Model editor, verifier, and witness execution
        </h1>
      </div>
      <div className="flex items-center gap-3">
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
