"use client";

import { usePolygraphStore } from "../store";
import EditorToggle from "./EditorToggle";
import JsonEditor from "./JsonEditor";
import VisualEditor from "./VisualEditor";
import PropertiesSidebar from "./PropertiesSidebar";

export default function EditorPanel() {
  const editorMode = usePolygraphStore((state) => state.editorMode);

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 pb-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[color:var(--foreground)]">Editor</h2>
        <EditorToggle />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden xl:flex-row">
        <div className="min-h-0 flex-1 overflow-hidden">
          {editorMode === "json" ? <JsonEditor /> : <VisualEditor />}
        </div>
        {editorMode === "visual" ? (
          <div className="min-h-0 w-full xl:w-[240px] xl:flex-shrink-0">
            <PropertiesSidebar />
          </div>
        ) : null}
      </div>
    </section>
  );
}
