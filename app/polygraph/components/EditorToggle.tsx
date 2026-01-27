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
    <div className="inline-flex rounded-full bg-neutral-100 p-1">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => setEditorMode(option.id)}
          className={`rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] transition ${
            editorMode === option.id
              ? "bg-white text-neutral-900 shadow-sm"
              : "text-neutral-500 hover:text-neutral-800"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
