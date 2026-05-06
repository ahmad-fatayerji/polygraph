/* This module exports the PolyGraph JSON specification as a raw markdown
   string so it can be copied to the clipboard and fed to an AI. The rendered
   /docs page also uses it to build the sidebar table of contents. */

export const DOC_MARKDOWN = `# PolyGraph JSON Model Specification

> **Version:** 1.0
> **Last updated:** February 2026
>
> This document describes the JSON format used to define a PolyGraph model. A PolyGraph models a dataflow network of concurrent actors connected by channels, targeting CPS workloads (e.g., PX4 drones) with mixed real-time and non-real-time components.

---

## Table of Contents

1. [Top-Level Structure](#top-level-structure)
2. [Meta Object](#meta-object)
3. [Layout Object (Optional)](#layout-object-optional)
4. [Actors Array](#actors-array)
   - [Timed Actors](#timed-actors)
   - [Untimed Actors](#untimed-actors)
5. [Channels Array](#channels-array)
6. [Rational Number Format](#rational-number-format)
   - [Valid Formats](#valid-formats)
   - [Rules](#rules)
6. [Verification Pipeline](#verification-pipeline)
   - [Level 1 — Structural Validation](#level-1--structural-validation)
   - [Level 2 — Consistency](#level-2--consistency)
   - [Level 3 — Liveness](#level-3--liveness)
7. [Diagnostic Codes](#diagnostic-codes)
   - [Errors](#errors)
   - [Warnings](#warnings)
   - [Info](#info)
8. [Complete Examples](#complete-examples)
   - [Minimal PX4 Control Loop](#minimal-px4-control-loop)
   - [ADAS System](#adas-system)
9. [Visual Editor Keyboard Shortcuts](#visual-editor-keyboard-shortcuts)
10. [Tips & Best Practices](#tips--best-practices)

---

## Top-Level Structure

A PolyGraph model is a JSON object with these top-level keys:

\`\`\`json
{
  "meta": { ... },
  "layout": { ... },
  "actors": [ ... ],
  "channels": [ ... ]
}
\`\`\`

| Key        | Type   | Required | Description                         |
| ---------- | ------ | -------- | ----------------------------------- |
| \`meta\`     | object | No       | Optional metadata (name, version).  |
| \`layout\`   | object | No       | Optional visual node positions.     |
| \`actors\`   | array  | **Yes**  | List of actor definitions.          |
| \`channels\` | array  | **Yes**  | List of channel (edge) definitions. |

---

## Meta Object

Optional metadata about the model. Has no effect on verification.

\`\`\`json
"meta": {
  "name": "ADAS System Model",
  "version": 1
}
\`\`\`

| Field     | Type   | Required | Description                |
| --------- | ------ | -------- | -------------------------- |
| \`name\`    | string | No       | Human-readable model name. |
| \`version\` | number | No       | Schema version number.     |

---

## Layout Object (Optional)

\`layout\` stores visual coordinates for actors. It does not affect verification.

\`\`\`json
"layout": {
  "actors": {
    "cam": { "x": 80, "y": 60 },
    "rad": { "x": 80, "y": 170 },
    "lid": { "x": 80, "y": 280 },
    "fus": { "x": 300, "y": 170 },
    "disp": { "x": 520, "y": 170 }
  }
}
\`\`\`

| Field            | Type   | Required | Description                                    |
| ---------------- | ------ | -------- | ---------------------------------------------- |
| \`layout.actors\`  | object | No       | Map of actor id -> \`{ x, y }\` node positions. |
| \`x\` / \`y\`        | number | Yes      | Canvas coordinates used by the visual editor. |

Unknown actor IDs in \`layout.actors\` are ignored.

---

## Actors Array

Actors are the processing nodes in the dataflow graph. Each actor fires (executes) and produces/consumes tokens on its connected channels.

\`\`\`json
"actors": [
  {
    "id": "imu",
    "label": "IMU Sensor",
    "pipelineStage": "sensing",
    "timed": true,
    "freq": 200,
    "phase": 0
  },
  {
    "id": "estimator",
    "label": "State Estimator",
    "pipelineStage": "perception",
    "timed": false
  }
]
\`\`\`

### Actor Fields

| Field    | Type    | Required | Description                                                                                              |
| -------- | ------- | -------- | -------------------------------------------------------------------------------------------------------- |
| \`id\`     | string  | **Yes**  | Unique identifier. Referenced by channels. Must be non-empty and unique across all actors.               |
| \`label\`  | string  | No       | Human-readable display name.                                                                             |
| \`pipelineStage\` | string | No | Optional visual category. Allowed values: \`"sensing"\`, \`"perception"\`, \`"planning"\`, \`"control-actuators"\`. |
| \`timed\`  | boolean | **Yes**  | \`true\` for actors that fire at a fixed rate; \`false\` for data-driven actors.                             |
| \`freq\`   | number  | Cond.    | Firing frequency in **Hz** (cycles/sec). Required for timed actors if \`period\` is not set. Must be > 0.  |
| \`period\` | number  | Cond.    | Firing period in **milliseconds**. Required for timed actors if \`freq\` is not set. Must be > 0.          |
| \`phase\`  | number  | No       | Initial phase offset in **milliseconds**. Must be >= 0. Defaults to 0. Only meaningful for timed actors. |
| \`executionTime\` | string \\| number | No | Worst-case execution time in **milliseconds**. Used to compute the worst-case path. Must be >= 0. Prefer exact values like \`"5/2"\`. |

### Timed Actors

Timed actors fire at regular intervals. You must provide **either** \`freq\` or \`period\` (not both required, but at least one).

- \`freq: 100\` means the actor fires 100 times per second (100 Hz).
- \`period: 10\` means the actor fires once every 10 milliseconds (equivalent to 100 Hz).
- \`phase: 20\` means the first firing is delayed by 20 ms.
- \`executionTime: "5/2"\` means the actor may take 2.5 ms in the worst case.

**Example using \`freq\`:**

\`\`\`json
{
  "id": "imu",
  "label": "IMU Sensor",
  "timed": true,
  "freq": 200,
  "phase": 0,
  "executionTime": "1"
}
\`\`\`

**Example using \`period\`:**

\`\`\`json
{
  "id": "ebs",
  "label": "Emergency Braking",
  "timed": true,
  "period": 100,
  "phase": 20,
  "executionTime": "5/2"
}
\`\`\`

### Untimed Actors

Untimed actors fire whenever their input channels have enough tokens. They should **not** have \`freq\`, \`period\`, or \`phase\`.

\`\`\`json
{
  "id": "estimator",
  "label": "State Estimator",
  "timed": false,
  "executionTime": "2"
}
\`\`\`

---

## Channels Array

Channels are directed edges connecting a **source** actor to a **destination** actor. They carry tokens: each firing of the source produces tokens, and each firing of the destination consumes tokens.

\`\`\`json
"channels": [
  {
    "id": "c1",
    "src": "imu",
    "dst": "estimator",
    "rateSrc": "1",
    "rateDst": "-1",
    "init": "0"
  }
]
\`\`\`

### Channel Fields

| Field     | Type   | Required | Description                                                                                                                    |
| --------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| \`id\`      | string | **Yes**  | Unique identifier for the channel.                                                                                             |
| \`src\`     | string | **Yes**  | The \`id\` of the source actor (producer).                                                                                       |
| \`dst\`     | string | **Yes**  | The \`id\` of the destination actor (consumer). Self-loops (\`src == dst\`) are allowed for feedback channels.                     |
| \`rateSrc\` | string | **Yes**  | **Production rate** — a positive rational number string. Tokens produced per source firing. E.g. \`"1"\`, \`"1/3"\`, \`"4/5"\`.      |
| \`rateDst\` | string | **Yes**  | **Consumption rate** — a negative rational number string. Tokens consumed per dest firing. E.g. \`"-1"\`, \`"-2/3"\`.              |
| \`init\`    | string | **Yes**  | **Initial tokens** — a non-negative rational number string. Tokens in the channel before any actor fires. E.g. \`"0"\`, \`"3/4"\`. |

### Simple 1:1 Channel

Each firing of \`imu\` produces 1 token, each firing of \`estimator\` consumes 1 token:

\`\`\`json
{
  "id": "c1",
  "src": "imu",
  "dst": "estimator",
  "rateSrc": "1",
  "rateDst": "-1",
  "init": "0"
}
\`\`\`

### Fractional-Rate Channel

The lidar produces 1/4 token per firing; the detector consumes 1 token per firing. Pre-loaded with 3/4 token:

\`\`\`json
{
  "id": "c_ldr_obd",
  "src": "ldr",
  "dst": "obd",
  "rateSrc": "1/4",
  "rateDst": "-1",
  "init": "3/4"
}
\`\`\`

This means the detector needs 4 lidar firings to accumulate enough tokens to fire once, but starts with 3/4 already buffered.

---

## Rational Number Format

All rate and token values (\`rateSrc\`, \`rateDst\`, \`init\`) use **exact rational arithmetic** — never floating point. Values are expressed as **strings** to preserve precision.

### Valid Formats

| Value    | Meaning             |
| -------- | ------------------- |
| \`"1"\`    | Integer one         |
| \`"-1"\`   | Negative one        |
| \`"1/3"\`  | One third           |
| \`"-2/3"\` | Negative two thirds |
| \`"0"\`    | Zero                |
| \`"4/5"\`  | Four fifths         |

### Rules

1. **Denominator must not be zero.**
2. **Sign is always in the numerator** (normalized form). Write \`"-1/3"\`, not \`"1/-3"\`.
3. **\`rateSrc\` must be positive** (> 0) — tokens are produced.
4. **\`rateDst\` must be negative** (< 0) — tokens are consumed.
5. **\`init\` must be non-negative** (>= 0).
6. **\`init\` must be a multiple of \`1/q\`**, where \`q = max(denominator(rateSrc), denominator(rateDst))\`.
   - Example: if rates are \`"1/4"\` and \`"-1"\`, then \`q = 4\`, and valid init values are \`"0"\`, \`"1/4"\`, \`"1/2"\`, \`"3/4"\`, \`"1"\`, etc.
7. **At least one rate per channel must be an integer.** The other rate may be a rational fraction for resampling. Self-loop channels (where \`src == dst\`) are exempt from this rule.

> **Warning:** Do not use decimal numbers like \`"0.5"\` or \`"0.333"\`. Always use fraction notation: \`"1/2"\`, \`"1/3"\`.

---

## Verification Pipeline

When you validate or execute a model, it goes through three levels of verification in order. Each level must pass before the next runs.

### Level 1 — Structural Validation

Checks that the model is well-formed:

- All actor IDs are unique and non-empty.
- All rate/init values parse as valid rationals.
- \`rateSrc\` is positive, \`rateDst\` is negative, \`init\` is non-negative.
- At least one rate per channel must be an integer (the other may be a fraction).
- Channel \`src\` and \`dst\` reference existing actors.
- Timed actors have valid \`freq\` or \`period\` (> 0) and \`phase\` >= 0.
- Actor \`executionTime\` values, when provided, parse as exact non-negative durations.

### Level 2 — Consistency (Bounded Memory)

Verifies that the model has bounded memory by solving the topology equation **Γx = 0**, where Γ is the topology matrix. A consistent model will not accumulate unbounded tokens on any channel.

- Builds the topology matrix Γ from channel rates.
- Solves for a non-zero integer repetition vector x.
- Validates that timing constraints are satisfiable.
- If no valid x exists, the model is **inconsistent** (unbounded memory).

### Level 3 — Liveness (Deadlock Freedom)

Constructs a witness execution using Algorithm 1 ("ticks-go-first, smallest-index-first") to prove the model is deadlock-free:

- Advances the global clock eagerly, then fires the smallest-index enabled actor.
- Verifies that every actor completes its required number of firings.
- Confirms the system returns to its initial state (periodic schedule).
- If no actor can fire but some are still waiting, the model has a **deadlock**.

---

## Diagnostic Codes

The verifier produces diagnostics at three severity levels.

### Errors

Errors block verification from proceeding to the next level.

| Code                  | Description                                                    |
| --------------------- | -------------------------------------------------------------- |
| \`E_PARSE_RATIONAL\`    | A rate or init value is not a valid rational number.           |
| \`E_RATE_SIGN\`         | \`rateSrc\` must be positive, \`rateDst\` must be negative.        |
| \`E_RATE_INTEGER_RULE\` | At least one rate per channel must be an integer.              |
| \`E_INIT_INVALID\`      | Initial tokens are negative or not a valid multiple of \`1/q\`.  |
| \`E_REF_MISSING\`       | A channel references a non-existent actor.                     |
| \`E_TOPOLOGY_INVALID\`  | Structural issues: missing IDs, duplicate IDs, invalid timing. |
| \`E_INCONSISTENT\`      | No valid repetition vector exists (unbounded memory).          |
| \`E_NOT_LIVE\`          | Deadlock detected during witness execution construction.       |

### Warnings

Warnings do not block verification but indicate potential issues.

| Code                   | Description                                     |
| ---------------------- | ----------------------------------------------- |
| \`W_DISCONNECTED_GRAPH\` | The graph has separate disconnected components. |
| \`W_UNUSED_ACTOR\`       | An actor has no channels connected to it.       |

### Info

Informational messages on successful verifications.

| Code            | Description                   |
| --------------- | ----------------------------- |
| \`I_VALID_MODEL\` | Structural validation passed. |
| \`I_CONSISTENT\`  | Consistency check passed.     |
| \`I_LIVE\`        | Liveness check passed.        |

---

## Complete Examples

### Minimal PX4 Control Loop

A simple drone control loop with two timed sensors, an untimed estimator, a timed controller, and a logger:

\`\`\`json
{
  "meta": { "name": "PX4 Control Loop", "version": 1 },
  "layout": {
    "actors": {
      "imu": { "x": 80, "y": 60 },
      "est": { "x": 300, "y": 60 },
      "ctrl": { "x": 520, "y": 60 },
      "log": { "x": 740, "y": 60 }
    }
  },
  "actors": [
    { "id": "imu", "label": "IMU", "timed": true, "freq": 200, "phase": 0, "executionTime": "1" },
    { "id": "est", "label": "Estimator", "timed": false, "executionTime": "2" },
    {
      "id": "ctrl",
      "label": "Controller",
      "timed": true,
      "freq": 100,
      "phase": 0,
      "executionTime": "3/2"
    },
    { "id": "log", "label": "Logger", "timed": false, "executionTime": "1/2" }
  ],
  "channels": [
    {
      "id": "c1",
      "src": "imu",
      "dst": "est",
      "rateSrc": "1",
      "rateDst": "-1",
      "init": "0"
    },
    {
      "id": "c2",
      "src": "est",
      "dst": "ctrl",
      "rateSrc": "1/2",
      "rateDst": "-1",
      "init": "1/2"
    },
    {
      "id": "c3",
      "src": "ctrl",
      "dst": "log",
      "rateSrc": "1/2",
      "rateDst": "-1",
      "init": "1/2"
    }
  ]
}
\`\`\`

**Explanation:**

- The IMU fires at 200 Hz, the controller at 100 Hz.
- The estimator and logger are untimed — they fire when input tokens are available.
- Each actor can optionally declare \`executionTime\` to participate in worst-case path analysis.
- Channel \`c2\` uses fractional rates: the estimator produces 1/2 token per firing, the controller consumes 1 token. This accounts for the 2:1 frequency ratio (200 Hz → 100 Hz). The channel starts with 1/2 token to pre-load the pipeline.
- Channel \`c3\` is similar: the controller produces 1/2 token per firing, the logger consumes 1 full token.

### ADAS System

A more complex Advanced Driver Assistance System with timed sensors, untimed processing actors, and phased output actors:

\`\`\`json
{
  "meta": { "name": "ADAS System Model", "version": 1 },
  "actors": [
    { "id": "ldr", "label": "Lidar (LDR)", "timed": true, "period": 25 },
    { "id": "odm", "label": "Odometer (ODM)", "timed": true, "period": 100 },
    { "id": "lcm", "label": "Left Camera (LCM)", "timed": true, "period": 100 },
    {
      "id": "rcm",
      "label": "Right Camera (RCM)",
      "timed": true,
      "period": 100
    },
    { "id": "obd", "label": "Obstacles Detection (OBD)", "timed": false },
    { "id": "tsd", "label": "Traffic Sign Detection", "timed": false },
    { "id": "tld", "label": "Traffic Lane Detection", "timed": false },
    { "id": "pdd", "label": "Pedestrian Detection", "timed": false },
    { "id": "rmd", "label": "Road Mask Detection", "timed": false },
    { "id": "dmd", "label": "Depth Map Detection", "timed": false },
    { "id": "apd", "label": "Adv. Pedestrian Detection", "timed": false },
    { "id": "spc", "label": "Speed Control", "timed": false },
    {
      "id": "ebs",
      "label": "Emergency Braking (EBS)",
      "timed": true,
      "period": 100,
      "phase": 20
    },
    {
      "id": "ifd",
      "label": "Information Display (IFD)",
      "timed": true,
      "period": 100,
      "phase": 50
    }
  ],
  "channels": [
    {
      "id": "c_ldr_obd",
      "src": "ldr",
      "dst": "obd",
      "rateSrc": "1/4",
      "rateDst": "-1",
      "init": "3/4"
    },
    {
      "id": "c_obd_spc",
      "src": "obd",
      "dst": "spc",
      "rateSrc": "1",
      "rateDst": "-1",
      "init": "0"
    },
    {
      "id": "c_odm_spc",
      "src": "odm",
      "dst": "spc",
      "rateSrc": "1",
      "rateDst": "-1",
      "init": "0"
    },
    {
      "id": "c_lcm_tsd",
      "src": "lcm",
      "dst": "tsd",
      "rateSrc": "1",
      "rateDst": "-1",
      "init": "0"
    },
    {
      "id": "c_tsd_spc",
      "src": "tsd",
      "dst": "spc",
      "rateSrc": "1",
      "rateDst": "-1",
      "init": "0"
    },
    {
      "id": "c_lcm_tld",
      "src": "lcm",
      "dst": "tld",
      "rateSrc": "1",
      "rateDst": "-1",
      "init": "0"
    },
    {
      "id": "c_lcm_rmd",
      "src": "lcm",
      "dst": "rmd",
      "rateSrc": "1",
      "rateDst": "-1",
      "init": "0"
    },
    {
      "id": "c_lcm_pdd",
      "src": "lcm",
      "dst": "pdd",
      "rateSrc": "1",
      "rateDst": "-1",
      "init": "0"
    },
    {
      "id": "c_rcm_rmd",
      "src": "rcm",
      "dst": "rmd",
      "rateSrc": "1",
      "rateDst": "-1",
      "init": "0"
    },
    {
      "id": "c_rcm_dmd",
      "src": "rcm",
      "dst": "dmd",
      "rateSrc": "1",
      "rateDst": "-1",
      "init": "0"
    },
    {
      "id": "c_rmd_apd",
      "src": "rmd",
      "dst": "apd",
      "rateSrc": "1",
      "rateDst": "-1",
      "init": "0"
    },
    {
      "id": "c_dmd_apd",
      "src": "dmd",
      "dst": "apd",
      "rateSrc": "1",
      "rateDst": "-1",
      "init": "0"
    },
    {
      "id": "c_pdd_apd",
      "src": "pdd",
      "dst": "apd",
      "rateSrc": "1",
      "rateDst": "-1",
      "init": "0"
    },
    {
      "id": "c_apd_ifd",
      "src": "apd",
      "dst": "ifd",
      "rateSrc": "1",
      "rateDst": "-1",
      "init": "0"
    },
    {
      "id": "c_spc_ebs",
      "src": "spc",
      "dst": "ebs",
      "rateSrc": "1",
      "rateDst": "-1",
      "init": "0"
    },
    {
      "id": "c_ebs_ifd",
      "src": "ebs",
      "dst": "ifd",
      "rateSrc": "1",
      "rateDst": "-1",
      "init": "0"
    }
  ]
}
\`\`\`

**Key patterns in this example:**

- **Phased timed actors:** \`ebs\` has \`phase: 20\` (fires 20 ms into each period), \`ifd\` has \`phase: 50\`.
- **Fractional rate with initial tokens:** \`c_ldr_obd\` uses \`rateSrc: "1/4"\` — the lidar fires 4× per period, each producing 1/4 token. The channel starts with 3/4 token so the detector can fire after just 1 lidar sample.
- **Fan-in:** \`spc\` (Speed Control) consumes from three channels (\`obd\`, \`odm\`, \`tsd\`) — it waits until all three provide a token.
- **Fan-out:** \`lcm\` (Left Camera) produces to four different processing actors (\`tsd\`, \`tld\`, \`rmd\`, \`pdd\`).

---

## Visual Editor Keyboard Shortcuts

When the visual editor is active and no text input is focused, the following keyboard shortcuts are available.

### General

| Shortcut                   | Action                  |
| -------------------------- | ----------------------- |
| **Ctrl / Cmd + Z**         | Undo last action        |
| **Ctrl / Cmd + Shift + Z** | Redo last undone action |
| **Ctrl / Cmd + Y**         | Redo (alternative)      |

### Actors

| Shortcut               | Action                                                    |
| ---------------------- | --------------------------------------------------------- |
| **A**                  | Add a new actor at the current pointer position           |
| **Ctrl / Cmd + D**     | Duplicate selected actors                                 |
| **Delete / Backspace** | Delete selected or focused actors (and their connections) |

### Channels (Connections)

| Shortcut               | Action                              |
| ---------------------- | ----------------------------------- |
| **Delete / Backspace** | Delete selected or focused channels |
| **Double-click edge**  | Delete that channel                 |

### Navigation & Selection

| Shortcut                     | Action                                             |
| ---------------------------- | -------------------------------------------------- |
| **Scroll wheel**             | Zoom in / out                                      |
| **Left-click drag (canvas)** | Pan the canvas                                     |
| **Click node**               | Select actor                                       |
| **Click edge**               | Select channel                                     |
| **Click canvas**             | Deselect all                                       |
| **Drag selection**           | Multi-select actors and channels (partial overlap) |

### Context Menu (Right-click)

| Target     | Actions                            |
| ---------- | ---------------------------------- |
| **Canvas** | Add actor here                     |
| **Node**   | Delete actor (and its connections) |
| **Edge**   | Delete connection                  |

> **Note:** Keyboard shortcuts are disabled while typing inside text inputs (e.g. the properties sidebar fields).

---

## Tips & Best Practices

1. **Start simple.** Begin with a few actors and 1:1 channels (\`"1"\` / \`"-1"\` rates) before introducing fractional rates.

2. **Use meaningful IDs.** Actor and channel IDs appear in diagnostics and visualizations. Short, descriptive IDs like \`"imu"\`, \`"c_imu_est"\` are best.

3. **Check diagnostics.** Click any diagnostic in the terminal panel to focus the related actor or channel in the editor.

4. **Initial tokens matter.** Pre-loading channels with tokens (\`init > 0\`) can prevent deadlocks when a consumer needs input before the producer has fired.

5. **Self-loops are valid.** A channel where \`src == dst\` represents a feedback buffer within one actor.

6. **Frequency vs Period.** Use whichever is more natural: \`freq: 100\` (100 Hz) is equivalent to \`period: 10\` (10 ms).

7. **Phase offsets.** Use \`phase\` to stagger timed actors. For example, \`phase: 20\` delays the first firing by 20 ms, useful for actors that depend on data from other timed actors.

8. **Naming channels.** A common convention is \`c_<src>_<dst>\`, e.g. \`"c_imu_est"\` for a channel from IMU to Estimator.

9. **Validate often.** Use the Validate button frequently during model construction to catch issues early, before running a full execution.

10. **Fractional rate alignment.** When using fractional rates, make sure \`init\` aligns with the rate granularity. The verifier will tell you the required multiple if it doesn't.

---

## TypeScript Type Reference

For programmatic use, here is the canonical TypeScript type:

\`\`\`typescript
type PolyGraphModel = {
  meta?: { name?: string; version?: number };
  layout?: {
    actors?: Record<string, { x: number; y: number }>;
  };
  actors: Array<{
    id: string;
    label?: string;
    pipelineStage?: "sensing" | "perception" | "planning" | "control-actuators";
    timed: boolean;
    freq?: number; // Hz, required if timed and no period
    period?: number; // ms, required if timed and no freq
    phase?: number; // ms, >= 0, optional
    executionTime?: string | number; // ms, exact duration used for worst-case path analysis
  }>;
  channels: Array<{
    id: string;
    src: string; // actor id
    dst: string; // actor id
    rateSrc: string; // positive rational, e.g. "1", "1/3"
    rateDst: string; // negative rational, e.g. "-1", "-2/3"
    init: string; // non-negative rational, e.g. "0", "3/4"
  }>;
};
\`\`\`
`;
