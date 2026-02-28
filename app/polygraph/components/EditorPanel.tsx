"use client";

import Link from "next/link";
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
        <h2 className="text-lg font-semibold text-[color:var(--foreground)]">
          Editor
        </h2>
        <div className="flex items-center gap-2">
          {editorMode === "json" && (
            <Link
              href="/docs"
              target="_blank"
              className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--panel-border)] px-3 py-1.5 text-xs font-semibold text-[color:var(--muted-strong)] transition hover:bg-[color:var(--accent-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--focus-ring)]"
              aria-label="Open JSON syntax documentation"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-3.5 w-3.5"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM8.94 6.94a.75.75 0 11-1.061-1.061 3 3 0 112.871 5.026v.345a.75.75 0 01-1.5 0v-.5c0-.72.57-1.172 1.081-1.287A1.5 1.5 0 108.94 6.94zM10 15a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
              Docs
            </Link>
          )}
          <EditorToggle />
        </div>
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
