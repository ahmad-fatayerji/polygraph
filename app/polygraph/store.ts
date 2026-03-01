import { create } from "zustand";
import type { Diagnostic, ExecutionResult, PolyGraphModel } from "@/lib/polygraph/types";
import { buildDefaultPositions, type ActorPosition } from "./graphLayout";

export type EditorMode = "json" | "visual";

type PolygraphUI = {
  selectedActorId?: string;
  selectedChannelId?: string;
  actorPositions?: Record<string, ActorPosition>;
};

type PolygraphState = {
  model: PolyGraphModel;
  jsonText: string;
  editorMode: EditorMode;
  diagnostics: Diagnostic[];
  execution?: ExecutionResult;
  executionModel?: PolyGraphModel;
  ui: PolygraphUI;
  setEditorMode: (mode: EditorMode) => void;
  setJsonText: (text: string) => void;
  applyJsonText: (text: string) => void;
  setModel: (model: PolyGraphModel, source?: "json" | "visual" | "reset") => void;
  setDiagnostics: (diagnostics: Diagnostic[]) => void;
  clearDiagnostics: () => void;
  setExecution: (execution?: ExecutionResult) => void;
  setExecutionModel: (model?: PolyGraphModel) => void;
  setActorPosition: (id: string, position: ActorPosition) => void;
  setActorPositions: (positions: Record<string, ActorPosition>) => void;
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
    },
    {
      id: "est",
      label: "Estimator",
      timed: false,
    },
    {
      id: "ctrl",
      label: "Controller",
      timed: true,
      freq: 100,
      phase: 0,
    },
    {
      id: "log",
      label: "Logger",
      timed: false,
    },
  ],
  channels: [
    { id: "c1", src: "imu", dst: "est", rateSrc: "1", rateDst: "-1", init: "0" },
    { id: "c2", src: "est", dst: "ctrl", rateSrc: "1", rateDst: "-1", init: "0" },
    { id: "c3", src: "ctrl", dst: "log", rateSrc: "1/2", rateDst: "-1", init: "1/2" },
  ],
};

const isValidPosition = (value: unknown): value is ActorPosition =>
  typeof value === "object" &&
  value !== null &&
  "x" in value &&
  "y" in value &&
  typeof value.x === "number" &&
  Number.isFinite(value.x) &&
  typeof value.y === "number" &&
  Number.isFinite(value.y);

const stripUiFromModel = (model: PolyGraphModel): PolyGraphModel => ({
  ...(model.layout ? { ...model, layout: undefined } : model),
  actors: model.actors.map((actor) => {
    const sanitized = { ...actor };
    delete sanitized.ui;
    return sanitized;
  }),
});

const extractActorPositions = (model: PolyGraphModel) => {
  const positions: Record<string, ActorPosition> = {};
  model.actors.forEach((actor) => {
    if (actor.ui && isValidPosition(actor.ui)) {
      positions[actor.id] = { x: actor.ui.x, y: actor.ui.y };
    }
  });
  const layoutActors = model.layout?.actors;
  if (layoutActors && typeof layoutActors === "object") {
    Object.entries(layoutActors).forEach(([actorId, value]) => {
      if (isValidPosition(value)) {
        positions[actorId] = { x: value.x, y: value.y };
      }
    });
  }
  return positions;
};

const mergeActorPositions = (
  existing: Record<string, ActorPosition> | undefined,
  model: PolyGraphModel,
  incoming?: Record<string, ActorPosition>
) => {
  const merged = { ...(existing ?? {}), ...(incoming ?? {}) };
  const next: Record<string, ActorPosition> = {};
  model.actors.forEach((actor) => {
    const position = merged[actor.id];
    if (position) {
      next[actor.id] = position;
    }
  });
  return next;
};

const serializeModel = (model: PolyGraphModel) =>
  JSON.stringify(stripUiFromModel(model), null, 2);

const serializeModelWithLayout = (
  model: PolyGraphModel,
  actorPositions?: Record<string, ActorPosition>,
) => {
  const sanitized = stripUiFromModel(model);
  const layoutActors: Record<string, ActorPosition> = {};
  sanitized.actors.forEach((actor) => {
    const position = actorPositions?.[actor.id];
    if (position) {
      layoutActors[actor.id] = { x: position.x, y: position.y };
    }
  });

  if (Object.keys(layoutActors).length === 0) {
    return serializeModel(sanitized);
  }

  return JSON.stringify(
    {
      ...sanitized,
      layout: {
        actors: layoutActors,
      },
    },
    null,
    2,
  );
};

const STORAGE_KEY = "polygraph:jsonText";

const readStoredJsonText = () => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

const writeStoredJsonText = (text: string) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, text);
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
};

const defaultActorPositions = buildDefaultPositions(defaultModel.actors);
const initialState = (() => {
  let model = defaultModel;
  let jsonText = serializeModelWithLayout(defaultModel, defaultActorPositions);
  let actorPositions = defaultActorPositions;
  const stored = readStoredJsonText();
  if (stored) {
    jsonText = stored;
    try {
      const parsed = JSON.parse(stored) as PolyGraphModel;
      const incomingPositions = extractActorPositions(parsed);
      const sanitized = stripUiFromModel(parsed);
      const fallbackPositions = buildDefaultPositions(sanitized.actors);
      model = sanitized;
      actorPositions = mergeActorPositions(
        fallbackPositions,
        sanitized,
        incomingPositions
      );
    } catch {
      // Keep default model; preserve stored jsonText in editor.
    }
  }
  return { model, jsonText, actorPositions };
})();

export const usePolygraphStore = create<PolygraphState>((set) => ({
  model: initialState.model,
  jsonText: initialState.jsonText,
  editorMode: "json",
  diagnostics: [],
  execution: undefined,
  executionModel: undefined,
  ui: { actorPositions: initialState.actorPositions },
  setEditorMode: (mode) => set({ editorMode: mode }),
  setJsonText: (text) => {
    writeStoredJsonText(text);
    set({ jsonText: text });
  },
  applyJsonText: (text) => {
    writeStoredJsonText(text);
    set({ jsonText: text });
    try {
      const parsed = JSON.parse(text) as PolyGraphModel;
      const incomingPositions = extractActorPositions(parsed);
      const sanitized = stripUiFromModel(parsed);
      set((state) => ({
        model: sanitized,
        diagnostics: state.diagnostics,
        ui: {
          ...state.ui,
          actorPositions: mergeActorPositions(
            state.ui.actorPositions,
            sanitized,
            incomingPositions
          ),
        },
      }));
    } catch {
      // Keep last valid model; diagnostics handled on validate/execute.
    }
  },
  setModel: (model, source = "visual") =>
    set((state) => {
      const incomingPositions = source === "json" ? extractActorPositions(model) : undefined;
      const sanitized = source === "json" ? stripUiFromModel(model) : model;
      const actorPositions = mergeActorPositions(
        state.ui.actorPositions,
        sanitized,
        incomingPositions
      );
      const selectedActorId = sanitized.actors.some(
        (actor) => actor.id === state.ui.selectedActorId
      )
        ? state.ui.selectedActorId
        : undefined;
      const selectedChannelId = sanitized.channels.some(
        (channel) => channel.id === state.ui.selectedChannelId
      )
        ? state.ui.selectedChannelId
        : undefined;
      const nextJsonText =
        source === "json"
          ? state.jsonText
          : serializeModelWithLayout(sanitized, actorPositions);
      writeStoredJsonText(nextJsonText);
      return {
        model: sanitized,
        jsonText: nextJsonText,
        diagnostics: state.diagnostics,
        ui: {
          ...state.ui,
          actorPositions,
          selectedActorId,
          selectedChannelId,
        },
      };
    }),
  setDiagnostics: (diagnostics) =>
    set((state) => ({ diagnostics: [...state.diagnostics, ...diagnostics] })),
  clearDiagnostics: () => set({ diagnostics: [] }),
  setExecution: (execution) => set({ execution }),
  setExecutionModel: (model) =>
    set({ executionModel: model ? stripUiFromModel(model) : undefined }),
  setActorPosition: (id, position) =>
    set((state) => {
      const actorPositions = { ...(state.ui.actorPositions ?? {}), [id]: position };
      const jsonText = serializeModelWithLayout(state.model, actorPositions);
      writeStoredJsonText(jsonText);
      return {
        jsonText,
        ui: {
          ...state.ui,
          actorPositions,
        },
      };
    }),
  setActorPositions: (positions) =>
    set((state) => {
      const actorPositions = { ...(state.ui.actorPositions ?? {}), ...positions };
      const jsonText = serializeModelWithLayout(state.model, actorPositions);
      writeStoredJsonText(jsonText);
      return {
        jsonText,
        ui: {
          ...state.ui,
          actorPositions,
        },
      };
    }),
  selectActor: (id) =>
    set((state) => ({
      ui: {
        ...state.ui,
        selectedActorId: id,
        selectedChannelId: undefined,
      },
    })),
  selectChannel: (id) =>
    set((state) => ({
      ui: {
        ...state.ui,
        selectedChannelId: id,
        selectedActorId: undefined,
      },
    })),
  reset: () =>
    set(() => {
      const jsonText = serializeModelWithLayout(defaultModel, defaultActorPositions);
      writeStoredJsonText(jsonText);
      return {
        model: defaultModel,
        jsonText,
        diagnostics: [],
        execution: undefined,
        executionModel: undefined,
        ui: { actorPositions: defaultActorPositions },
      };
    }),
}));
