"use client";

import { usePolygraphStore } from "../store";

export default function EditorToggle() {
  const editorMode = usePolygraphStore((state) => state.editorMode);
  const setEditorMode = usePolygraphStore((state) => state.setEditorMode);

  const options: Array<{ id: "json" | "visual"; label: string }> = [
    { id: "json", label: "JSON" },
    { id: "visual", label: "Visual" },
  ];

  return (
    <div className="inline-flex rounded-full bg-[color:var(--panel-muted)] p-1">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => setEditorMode(option.id)}
          className={`rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] transition ${
            editorMode === option.id
              ? "bg-[color:var(--panel)] text-[color:var(--foreground)] shadow-sm"
              : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
