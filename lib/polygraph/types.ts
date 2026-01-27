export type Severity = "error" | "warn" | "info";

export type Diagnostic = {
  id: string;
  severity: Severity;
  message: string;
  where?: {
    actorId?: string;
    channelId?: string;
    field?: string;
  };
  hint?: string;
};

export type ExecutionResult = {
  ok: boolean;
  diagnostics: Diagnostic[];
  artifacts?: {
    hyperperiod?: {
      tickCount: number;
      significantTicks: number[];
    };
    schedule?: Array<{
      tick: number;
      fires: string[];
    }>;
    tokenTrace?: Array<{
      channelId: string;
      values: Array<{
        tick: number;
        tokens: string;
      }>;
    }>;
  };
};

export type PolyGraphModel = {
  meta?: { name?: string; version?: number };
  actors: Array<{
    id: string;
    label?: string;
    timed: boolean;
    freq?: number;
    phase?: number;
    ui?: { x: number; y: number };
  }>;
  channels: Array<{
    id: string;
    src: string;
    dst: string;
    rateSrc: string;
    rateDst: string;
    init: string;
  }>;
};

export type VerifyOptions = {
  computeExecution?: boolean;
};

