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

export type WorstCasePathArtifact = {
  duration: string; // milliseconds, exact rational string
  structuralCost: string; // milliseconds, exact rational string
  executionCost: string; // milliseconds, exact rational string
  bestCaseDuration?: string; // milliseconds, exact rational string
  dataDependencyCost?: string; // milliseconds, exact rational string
  contentionCost?: string; // milliseconds, exact rational string
  path: string[]; // actor ids on the worst path
  pathsAnalyzed: number;
  truncated: boolean;
  rankedPaths: Array<{
    path: string[];
    duration: string; // milliseconds, exact rational string
    structuralCost: string; // milliseconds, exact rational string
    executionCost: string; // milliseconds, exact rational string
    bestCaseDuration?: string; // milliseconds, exact rational string
    dataDependencyCost?: string; // milliseconds, exact rational string
    contentionCost?: string; // milliseconds, exact rational string
  }>;
};

export type FiringSequenceEntry = {
  actorId: string;
  firingIndex: number; // 1-based firing index per actor
  tick: number; // absolute tick in witness execution
};

export type CumulativeTokenTraceEntry = {
  channelId: string;
  // Produced/consumed cumulative token counts indexed by firing count.
  // Entry 0 is always "0".
  produced: string[];
  consumed: string[];
};

export type FiringTimingArtifact = {
  actorId: string;
  firingIndex: number;
  al: string;
  au: string;
  pl: string;
  pu: string;
  rl: string;
  ru: string;
  es: string;
  ls: string;
  ef: string;
  lf: string;
  bcif: string;
  wcif: string;
};

export type TimingAnalysisArtifact = {
  feasible: boolean;
  firingTiming: FiringTimingArtifact[];
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
    firingSequence?: FiringSequenceEntry[];
    cumulativeTokenTrace?: CumulativeTokenTraceEntry[];
    timingAnalysis?: TimingAnalysisArtifact;
    detailedTrace?: DetailedTraceStep[];
    worstCasePath?: WorstCasePathArtifact;
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
    executionTime?: string | number; // milliseconds, exact duration used for worst-case path analysis
    bcet?: string | number; // milliseconds, best-case execution time (defaults to executionTime)
    jitter?: string | number; // milliseconds, release jitter bound (defaults to 0)
    priority?: number; // fixed priority for preemptive analysis (higher value = higher priority)
    processor?: number; // processor/core index (defaults to 0)
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
  /** Capture the full state after every fire/tick event. Expensive on large graphs. */
  captureDetailedTrace?: boolean;
};

