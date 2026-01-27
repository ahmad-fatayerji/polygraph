"use client";

import { usePolygraphStore } from "../store";
import EditorToggle from "./EditorToggle";
import JsonEditor from "./JsonEditor";
import VisualEditor from "./VisualEditor";
import PropertiesSidebar from "./PropertiesSidebar";

export default function EditorPanel() {
  const editorMode = usePolygraphStore((state) => state.editorMode);

  return (
    <section className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-900">Editor</h2>
        <EditorToggle />
      </div>
      <div className="grid h-full flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="h-full min-h-[420px]">
          {editorMode === "json" ? <JsonEditor /> : <VisualEditor />}
        </div>
        <PropertiesSidebar />
      </div>
    </section>
  );
}
