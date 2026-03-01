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

export type DetailedTraceStep = {
  stateIndex: number;        // l in s^l
  label: string;             // e.g. "s⁰" (initial), "fire(v₁, s⁰)", "tick(s²)"
  channelStates: string[];   // token count per channel (rational string), ordered by channel index
  tau: number;               // τ^l — current tick mod hyperperiod
  tracking: string[];        // a_i per actor (bigint as string)
  firingVector: string[];    // y^σ per actor (bigint as string)
  totalTicks: number;        // z^σ
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
    detailedTrace?: DetailedTraceStep[];
  };
};

export type PolyGraphModel = {
  meta?: { name?: string; version?: number };
  layout?: {
    actors?: Record<string, { x: number; y: number }>;
  };
  actors: Array<{
    id: string;
    label?: string;
    timed: boolean;
    freq?: number; // Hz (optional if period is provided)
    period?: number; // milliseconds (optional if freq is provided)
    phase?: string | number; // milliseconds, rational string e.g. "0", "20", "200/3", or number
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
  /** Number of minimal cycles to simulate (default: 1). Paper examples often use 2. */
  cycles?: number;
};

