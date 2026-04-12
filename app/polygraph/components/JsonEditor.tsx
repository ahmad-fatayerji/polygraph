"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef } from "react";
import { usePolygraphStore } from "../store";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
});

export default function JsonEditor() {
  const jsonText = usePolygraphStore((state) => state.jsonText);
  const applyJsonText = usePolygraphStore((state) => state.applyJsonText);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<
    import("monaco-editor").editor.IStandaloneCodeEditor | null
  >(null);

  const relayoutEditor = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.render(true);
    editor.layout();
  };

  const options = useMemo(
    () => ({
      minimap: { enabled: false },
      fontSize: 13,
      lineHeight: 20,
      fontFamily: "var(--font-code), 'IBM Plex Mono', monospace",
      fontLigatures: false,
      lineNumbers: "on" as const,
      scrollBeyondLastLine: false,
      wordWrap: "on" as const,
      formatOnPaste: true,
      formatOnType: false,
      automaticLayout: true,
    }),
    [],
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      relayoutEditor();
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-[color:var(--panel-border)] bg-[color:var(--panel)] shadow-sm"
    >
      <div className="min-h-0 flex-1 overflow-hidden">
        <MonacoEditor
          height="100%"
          width="100%"
          className="h-full w-full"
          theme="vs"
          language="json"
          value={jsonText}
          options={options}
          onMount={(editor, monaco) => {
            editorRef.current = editor;
            editor.updateOptions(options);
            monaco.editor.remeasureFonts();
            relayoutEditor();

            requestAnimationFrame(() => {
              monaco.editor.remeasureFonts();
              relayoutEditor();
            });

            if ("fonts" in document) {
              void document.fonts.ready.then(() => {
                monaco.editor.remeasureFonts();
                relayoutEditor();
              });
            }
          }}
          onChange={(value) => {
            if (value !== undefined) applyJsonText(value);
          }}
        />
      </div>
    </div>
  );
}
