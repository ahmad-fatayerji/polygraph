import { create } from "zustand";
import type { Diagnostic, ExecutionResult, PolyGraphModel } from "@/lib/polygraph/types";

export type EditorMode = "json" | "visual";

type PolygraphUI = {
  selectedActorId?: string;
  selectedChannelId?: string;
};

type PolygraphState = {
  model: PolyGraphModel;
  jsonText: string;
  editorMode: EditorMode;
  diagnostics: Diagnostic[];
  execution?: ExecutionResult;
  ui: PolygraphUI;
  setEditorMode: (mode: EditorMode) => void;
  setJsonText: (text: string) => void;
  applyJsonText: (text: string) => void;
  setModel: (model: PolyGraphModel, source?: "json" | "visual" | "reset") => void;
  setDiagnostics: (diagnostics: Diagnostic[]) => void;
  setExecution: (execution?: ExecutionResult) => void;
  selectActor: (id?: string) => void;
  selectChannel: (id?: string) => void;
  reset: () => void;
};

export const defaultModel: PolyGraphModel = {
  meta: { name: "PX4 Control Loop", version: 1 },
  actors: [
    {
      id: "imu",
      label: "IMU",
      timed: true,
      freq: 200,
      phase: 0,
      ui: { x: 80, y: 80 },
    },
    {
      id: "est",
      label: "Estimator",
      timed: false,
      ui: { x: 260, y: 220 },
    },
    {
      id: "ctrl",
      label: "Controller",
      timed: true,
      freq: 100,
      phase: 0,
      ui: { x: 440, y: 80 },
    },
    {
      id: "log",
      label: "Logger",
      timed: false,
      ui: { x: 620, y: 220 },
    },
  ],
  channels: [
    { id: "c1", src: "imu", dst: "est", rateSrc: "1", rateDst: "-1", init: "0" },
    { id: "c2", src: "est", dst: "ctrl", rateSrc: "1", rateDst: "-1", init: "0" },
    { id: "c3", src: "ctrl", dst: "log", rateSrc: "1/2", rateDst: "-1", init: "1/2" },
  ],
};

const serializeModel = (model: PolyGraphModel) => JSON.stringify(model, null, 2);

export const usePolygraphStore = create<PolygraphState>((set) => ({
  model: defaultModel,
  jsonText: serializeModel(defaultModel),
  editorMode: "json",
  diagnostics: [],
  execution: undefined,
  ui: {},
  setEditorMode: (mode) => set({ editorMode: mode }),
  setJsonText: (text) => set({ jsonText: text }),
  applyJsonText: (text) => {
    set({ jsonText: text });
    try {
      const parsed = JSON.parse(text) as PolyGraphModel;
      set((state) => ({
        model: parsed,
        execution: undefined,
        diagnostics: state.diagnostics,
        ui: state.ui,
      }));
    } catch {
      // Keep last valid model; diagnostics handled on validate/execute.
    }
  },
  setModel: (model, source = "visual") =>
    set((state) => ({
      model,
      jsonText: source === "json" ? state.jsonText : serializeModel(model),
      execution: undefined,
      diagnostics: state.diagnostics,
      ui: state.ui,
    })),
  setDiagnostics: (diagnostics) =>
    set((state) => ({ diagnostics: [...state.diagnostics, ...diagnostics] })),
  setExecution: (execution) => set({ execution }),
  selectActor: (id) =>
    set({ ui: { selectedActorId: id, selectedChannelId: undefined } }),
  selectChannel: (id) =>
    set({ ui: { selectedChannelId: id, selectedActorId: undefined } }),
  reset: () =>
    set({
      model: defaultModel,
      jsonText: serializeModel(defaultModel),
      diagnostics: [],
      execution: undefined,
      ui: {},
    }),
}));

