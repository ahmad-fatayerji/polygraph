# AGENTS.md

## Mission

Build a standalone client-side PolyGraph editor and verifier as a Next.js web application. The system targets CPS workloads (e.g., PX4 drones) with mixed real-time and non-real-time components. All verification must run client-side (no server compute), preferably inside a Web Worker.

## Product Requirements

- Allow users to create PolyGraph models in JSON or via a visual drag-and-drop editor.
- Validate correctness using PolyGraph theory.
- Compute a witness execution (schedule + token traces) when valid.
- Display diagnostics, errors, warnings, and info; diagnostics must be clickable to focus the related actor/channel.

## UI Layout (Single Workspace)

- Top toolbar: Validate, Execute, Reset.
- Center: Left editor panel (JSON or Visual toggle) and right results panel.
- Bottom: Full-width terminal panel with draggable height and diagnostics filters.

## Frontend Architecture (Next.js)

Route: `/polygraph`

- Top-level: `PolygraphWorkspace`
- Editor panel:
  - `EditorPanel`
  - `EditorToggle` (JSON | Visual)
  - `JsonEditor` (Monaco)
  - `VisualEditor` (React Flow)
  - `PropertiesSidebar`
- Visualization panel:
  - `VisualizationPanel`
  - `ScheduleView`
  - `TokenTraceView`
- Terminal:
  - `TerminalPanel`
  - `LogConsole`

Important: React Flow nodes/edges are NOT the source of truth.

## State Management (Single Source of Truth)

Use a single global store (e.g., Zustand) with these fields:

- `model: PolyGraphModel` (canonical source of truth)
- `jsonText: string` (editor buffer)
- `editorMode: "json" | "visual"`
- `diagnostics: Diagnostic[]`
- `execution?: ExecutionResult`
- `ui.selectedActorId?: string`
- `ui.selectedChannelId?: string`

Rules:

- The canonical PolyGraphModel is the ONLY source of truth.
- JSON and Visual editors sync through the model.
- Editors never sync directly to each other.

## Canonical PolyGraph Model

```ts
type PolyGraphModel = {
  meta?: { name?: string; version?: number };
  actors: Array<{
    id: string;
    label?: string;
    timed: boolean;
    freq?: number; // Hz (optional if period is provided)
    period?: number; // milliseconds (optional if freq is provided)
    phase?: number; // milliseconds, >= 0, optional
    ui?: { x: number; y: number };
  }>;
  channels: Array<{
    id: string;
    src: string; // actor id
    dst: string; // actor id
    rateSrc: string; // rational, e.g. "1", "1/3"
    rateDst: string; // negative rational, e.g. "-1", "-2/3"
    init: string; // initial marking, rational >= 0
  }>;
};
```

All rationals are strings and MUST be handled exactly. Timing can be specified using either:

- `freq`: frequency in Hz (cycles per second), e.g. 100 for 100 Hz
- `period`: period in milliseconds, e.g. 10 for 10 ms
  Only one of `freq` or `period` is required for timed actors. `phase` is in milliseconds.

## Client-Side Verifier Architecture

- Verifier runs in a Web Worker.
- UI -> `worker.postMessage({ model, options })`
- Worker -> `verify(model)` -> `ExecutionResult`
- UI renders diagnostics and artifacts.
- No DOM access inside the worker.

## Verifier Output Contract

```ts
type Severity = "error" | "warn" | "info";

type Diagnostic = {
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

type ExecutionResult = {
  ok: boolean;
  diagnostics: Diagnostic[];
  artifacts?: {
    hyperperiod?: {
      tickCount: number;
      significantTicks: number[];
    };
    schedule?: Array<{
      tick: number;
      fires: string[]; // actor ids
    }>;
    tokenTrace?: Array<{
      channelId: string;
      values: Array<{
        tick: number;
        tokens: string; // rational or integer string
      }>;
    }>;
  };
};
```

Diagnostics must ALWAYS be returned, even on failure.

## Verification Theory Overview

A PolyGraph is CORRECT iff it is CONSISTENT (bounded memory) and LIVE (deadlock-free). Temporal analysis is only meaningful if both hold.

### Level 1 — Structural Validation (Must Implement)

Reject invalid models early.
Actors:

- unique ids
- if timed: either `freq > 0` (Hz) or `period > 0` (ms), and `phase >= 0` (ms)

Channels:

- `src` and `dst` exist
- `rateSrc > 0`
- `rateDst < 0`
- at least ONE of `rateSrc` or `rateDst` must be INTEGER
- `init >= 0`
- Note: Self-loops (where `src == dst`) are allowed and represent feedback channels within an actor

Rationals:

- parse exactly
- denominator != 0
- normalized form (sign in numerator)

Emit errors such as:

- `E_PARSE_RATIONAL`
- `E_RATE_SIGN`
- `E_RATE_INTEGER_RULE`
- `E_INIT_INVALID`
- `E_REF_MISSING`

Stop verification if Level 1 has errors.

### Level 2 — Consistency (Bounded Memory)

Definitions:

- V = set of actors
- E = set of channels
- Γ (Gamma) is the topology matrix |E| x |V|

For channel ei = (src -> dst):

- Γ[i][src] = +rateSrc
- Γ[i][dst] = rateDst (negative)
- all other entries = 0

Consistency theorem:
A PolyGraph is CONSISTENT iff there exists a non-zero vector x in N^|V| such that:

- Γ \* x = 0
- x can be decomposed as x = y + r \* t where:
  - y = 0 on all timed actors
  - r > 0
  - t is the synchronization vector induced by timed actors (derived from frequencies + hyperperiod)

Implementation steps:

- Build Γ using exact rationals.
- Solve Γx = 0 in rationals.
- Scale to integer vector x (LCM of denominators).
- Ensure x != 0.
- Compute hyperperiod from timed actors.
- Derive t (expected firings per hyperperiod).
- Check x = y + r \* t.
- If no valid x exists -> emit `E_INCONSISTENT`.

Channel state rules (part of consistency):

- For each channel:
  - qi = max(denominator(rateSrc), denominator(rateDst))
  - ri = 1 / qi
- init must be a multiple of ri.
- channel state must never become negative.
- number of tokens = floor(channel_state).

### Level 3 — Liveness (Deadlock Freedom)

Definition:
Execution is LIVE iff it is consistent and no actor is permanently blocked waiting for tokens.

Algorithm (constructive):
Maintain:

- global tick k
- channel states ci (rationals)
- firing counters yσ(actor)
- repetition target x(actor)

At each step:

- Advance tick k.
- Determine Allowed actors:
  - timed actors only if this tick is significant
  - untimed actors always allowed
- Determine Enabled actors:
  - all input channels have enough tokens
- Determine Waiting actors:
  - yσ(actor) < x(actor)
- Fire any actor that is Allowed + Enabled + Waiting.
- On firing: update channel states, increment yσ, record schedule + token trace.

Termination:

- If yσ == x and channel state == initial -> LIVE.
- If no actor can fire and yσ != x -> DEADLOCK.

Emit:

- `E_NOT_LIVE` on deadlock
- success otherwise

### Execution Artifacts

If live, return:

- hyperperiod (ticks + significant ticks)
- schedule (actors fired per tick)
- token trace (tokens per channel per tick)

## Rational Arithmetic Requirements

- Do NOT use floating point.
- Use exact arithmetic with BigInt.
- Operations: normalize (gcd), add, subtract, multiply, divide, compare, floor.

## Worker Requirements

- Pure TypeScript
- Serializable inputs/outputs
- No DOM, no React imports
- Deterministic behavior

## Expected Diagnostic Codes

Errors:

- `E_PARSE_RATIONAL`
- `E_RATE_SIGN`
- `E_RATE_INTEGER_RULE`
- `E_INIT_INVALID`
- `E_REF_MISSING`
- `E_TOPOLOGY_INVALID`
- `E_INCONSISTENT`
- `E_NOT_LIVE`

Warnings:

- `W_DISCONNECTED_GRAPH`
- `W_UNUSED_ACTOR`

Info:

- `I_VALID_MODEL`
- `I_CONSISTENT`
- `I_LIVE`

## Expected Logical File Structure

- `rational.ts`
- `topology.ts`
- `consistency.ts`
- `liveness.ts`
- `verify.ts`
- `worker.ts`

## Final Goal

This is a FORMAL PolyGraph verifier, not a simulator. It must validate correctness, explain failures precisely, and produce witness executions when valid. The UI only visualizes verifier outputs.
