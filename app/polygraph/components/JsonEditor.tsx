"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { usePolygraphStore } from "../store";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

export default function JsonEditor() {
  const jsonText = usePolygraphStore((state) => state.jsonText);
  const applyJsonText = usePolygraphStore((state) => state.applyJsonText);

  const options = useMemo(
    () => ({
      minimap: { enabled: false },
      fontSize: 13,
      lineNumbers: "on",
      scrollBeyondLastLine: false,
      wordWrap: "on",
      formatOnPaste: true,
      formatOnType: false,
    }),
    []
  );

  return (
    <div className="h-full w-full rounded-2xl border border-neutral-200 bg-white/70 shadow-sm">
      <MonacoEditor
        height="100%"
        theme="vs"
        language="json"
        value={jsonText}
        options={options}
        onChange={(value) => {
          if (value !== undefined) applyJsonText(value);
        }}
      />
    </div>
  );
}
