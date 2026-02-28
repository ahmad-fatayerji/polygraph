"use client";

import { useState /* useCallback */ } from "react";

/* ─── section data ──────────────────────────────────────────────────── */

type Section = {
  id: string;
  title: string;
  content: React.ReactNode;
};

const code = (text: string) => (
  <code className="rounded bg-[color:var(--accent-muted)] px-1.5 py-0.5 font-mono text-[0.82em] text-[color:var(--foreground)]">
    {text}
  </code>
);

const jsonBlock = (json: string) => (
  <pre className="overflow-x-auto rounded-lg border border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] p-3 font-mono text-xs leading-relaxed text-[color:var(--foreground)]">
    {json}
  </pre>
);

const fieldRow = (
  name: string,
  type: string,
  required: boolean,
  description: React.ReactNode,
) => (
  <tr
    key={name}
    className="border-b border-[color:var(--panel-border)] last:border-b-0"
  >
    <td className="whitespace-nowrap py-2 pr-3 align-top font-mono text-xs font-semibold text-[color:var(--foreground)]">
      {name}
    </td>
    <td className="whitespace-nowrap py-2 pr-3 align-top text-xs text-[color:var(--muted)]">
      {type}
    </td>
    <td className="whitespace-nowrap py-2 pr-3 align-top text-xs">
      {required ? (
        <span className="rounded bg-[color:var(--severity-error-bg)] px-1.5 py-0.5 text-[0.7rem] font-semibold text-[color:var(--severity-error-text)]">
          required
        </span>
      ) : (
        <span className="rounded bg-[color:var(--chip)] px-1.5 py-0.5 text-[0.7rem] text-[color:var(--chip-text)]">
          optional
        </span>
      )}
    </td>
    <td className="py-2 align-top text-xs leading-relaxed text-[color:var(--muted-strong)]">
      {description}
    </td>
  </tr>
);

const sections: Section[] = [
  /* ── Overview ──────────────────────────────────────────────────────── */
  {
    id: "overview",
    title: "Overview",
    content: (
      <div className="space-y-3 text-sm leading-relaxed text-[color:var(--muted-strong)]">
        <p>
          A <strong>PolyGraph model</strong> describes a dataflow network of
          concurrent <em>actors</em> connected by <em>channels</em>. The JSON
          representation is the canonical source of truth used by the verifier.
        </p>
        <p>The top-level JSON object has three optional/required keys:</p>
        {jsonBlock(`{
  "meta": { ... },      // optional metadata
  "actors": [ ... ],    // required — list of actors
  "channels": [ ... ]   // required — list of channels
}`)}
      </div>
    ),
  },

  /* ── Meta ───────────────────────────────────────────────────────────── */
  {
    id: "meta",
    title: "Meta (optional)",
    content: (
      <div className="space-y-3 text-sm text-[color:var(--muted-strong)]">
        <p>Optional metadata about the model. Has no effect on verification.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[color:var(--panel-border)]">
                <th className="pb-1 pr-3 text-xs font-semibold text-[color:var(--foreground)]">
                  Field
                </th>
                <th className="pb-1 pr-3 text-xs font-semibold text-[color:var(--foreground)]">
                  Type
                </th>
                <th className="pb-1 pr-3 text-xs font-semibold text-[color:var(--foreground)]">
                  Req?
                </th>
                <th className="pb-1 text-xs font-semibold text-[color:var(--foreground)]">
                  Description
                </th>
              </tr>
            </thead>
            <tbody>
              {fieldRow("name", "string", false, "Human-readable model name.")}
              {fieldRow("version", "number", false, "Schema version number.")}
            </tbody>
          </table>
        </div>
        {jsonBlock(`"meta": {
  "name": "ADAS System Model",
  "version": 1
}`)}
      </div>
    ),
  },

  /* ── Actors ─────────────────────────────────────────────────────────── */
  {
    id: "actors",
    title: "Actors",
    content: (
      <div className="space-y-3 text-sm text-[color:var(--muted-strong)]">
        <p>
          Actors are the processing nodes in your dataflow graph. Each actor
          fires (executes) and produces/consumes tokens on its connected
          channels. Actors can be <strong>timed</strong> (fire at a fixed
          frequency/period) or <strong>untimed</strong> (fire whenever input
          tokens are available).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[color:var(--panel-border)]">
                <th className="pb-1 pr-3 text-xs font-semibold text-[color:var(--foreground)]">
                  Field
                </th>
                <th className="pb-1 pr-3 text-xs font-semibold text-[color:var(--foreground)]">
                  Type
                </th>
                <th className="pb-1 pr-3 text-xs font-semibold text-[color:var(--foreground)]">
                  Req?
                </th>
                <th className="pb-1 text-xs font-semibold text-[color:var(--foreground)]">
                  Description
                </th>
              </tr>
            </thead>
            <tbody>
              {fieldRow(
                "id",
                "string",
                true,
                <>
                  A unique identifier for the actor. Used by channels to
                  reference endpoints. Must be non-empty and unique across all
                  actors.
                </>,
              )}
              {fieldRow(
                "label",
                "string",
                false,
                "Optional human-readable display label.",
              )}
              {fieldRow(
                "timed",
                "boolean",
                true,
                <>
                  Set to {code("true")} for actors that fire at a fixed rate,{" "}
                  {code("false")} for untimed (data-driven) actors.
                </>,
              )}
              {fieldRow(
                "freq",
                "number",
                false,
                <>
                  Firing frequency in <strong>Hz</strong> (cycles per second).
                  Required for timed actors if {code("period")} is not set. E.g.{" "}
                  {code("100")} = 100 Hz.
                </>,
              )}
              {fieldRow(
                "period",
                "number",
                false,
                <>
                  Firing period in <strong>milliseconds</strong>. Required for
                  timed actors if {code("freq")} is not set. E.g. {code("10")} =
                  10 ms (100 Hz).
                </>,
              )}
              {fieldRow(
                "phase",
                "number",
                false,
                <>
                  Initial phase offset in <strong>milliseconds</strong>.
                  Determines when the actor first fires. Must be &ge; 0.
                  Defaults to 0 if omitted.
                </>,
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-2">
          <p className="font-semibold text-[color:var(--foreground)]">
            Timed actor (using freq):
          </p>
          {jsonBlock(`{
  "id": "imu",
  "label": "IMU Sensor",
  "timed": true,
  "freq": 200,
  "phase": 0
}`)}
        </div>

        <div className="space-y-2">
          <p className="font-semibold text-[color:var(--foreground)]">
            Timed actor (using period):
          </p>
          {jsonBlock(`{
  "id": "ebs",
  "label": "Emergency Braking",
  "timed": true,
  "period": 100,
  "phase": 20
}`)}
        </div>

        <div className="space-y-2">
          <p className="font-semibold text-[color:var(--foreground)]">
            Untimed actor:
          </p>
          {jsonBlock(`{
  "id": "estimator",
  "label": "State Estimator",
  "timed": false
}`)}
        </div>

        <div className="rounded-lg border border-[color:var(--severity-info-bg)] bg-[color:var(--severity-info-bg)] p-3 text-xs text-[color:var(--severity-info-text)]">
          <strong>Note:</strong> Only one of {code("freq")} or {code("period")}{" "}
          is needed for timed actors. If both are provided, {code("freq")} takes
          precedence. Untimed actors should not have {code("freq")},{" "}
          {code("period")}, or {code("phase")}.
        </div>
      </div>
    ),
  },

  /* ── Channels ──────────────────────────────────────────────────────── */
  {
    id: "channels",
    title: "Channels",
    content: (
      <div className="space-y-3 text-sm text-[color:var(--muted-strong)]">
        <p>
          Channels are directed edges connecting a <strong>source</strong> actor
          to a <strong>destination</strong> actor. They carry tokens — each
          firing of the source produces tokens, and each firing of the
          destination consumes tokens.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[color:var(--panel-border)]">
                <th className="pb-1 pr-3 text-xs font-semibold text-[color:var(--foreground)]">
                  Field
                </th>
                <th className="pb-1 pr-3 text-xs font-semibold text-[color:var(--foreground)]">
                  Type
                </th>
                <th className="pb-1 pr-3 text-xs font-semibold text-[color:var(--foreground)]">
                  Req?
                </th>
                <th className="pb-1 text-xs font-semibold text-[color:var(--foreground)]">
                  Description
                </th>
              </tr>
            </thead>
            <tbody>
              {fieldRow(
                "id",
                "string",
                true,
                "A unique identifier for the channel.",
              )}
              {fieldRow(
                "src",
                "string",
                true,
                <>The {code("id")} of the source actor (producer).</>,
              )}
              {fieldRow(
                "dst",
                "string",
                true,
                <>
                  The {code("id")} of the destination actor (consumer).
                  Self-loops ({code("src == dst")}) are allowed for feedback
                  channels.
                </>,
              )}
              {fieldRow(
                "rateSrc",
                "string",
                true,
                <>
                  <strong>Production rate</strong> — a positive rational number
                  as a string. Specifies how many tokens the source actor
                  produces per firing. E.g. {code('"1"')}, {code('"1/3"')},{" "}
                  {code('"4/5"')}.
                </>,
              )}
              {fieldRow(
                "rateDst",
                "string",
                true,
                <>
                  <strong>Consumption rate</strong> — a <em>negative</em>{" "}
                  rational number as a string. Specifies how many tokens the
                  destination actor consumes per firing (with a negative sign).
                  E.g. {code('"-1"')}, {code('"-2/3"')}, {code('"-1/2"')}.
                </>,
              )}
              {fieldRow(
                "init",
                "string",
                true,
                <>
                  <strong>Initial tokens</strong> — a non-negative rational
                  number as a string. The number of tokens initially present in
                  the channel before any actor fires. E.g. {code('"0"')},{" "}
                  {code('"1"')}, {code('"3/4"')}.
                </>,
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-2">
          <p className="font-semibold text-[color:var(--foreground)]">
            Simple 1:1 channel:
          </p>
          {jsonBlock(`{
  "id": "c1",
  "src": "imu",
  "dst": "estimator",
  "rateSrc": "1",
  "rateDst": "-1",
  "init": "0"
}`)}
        </div>

        <div className="space-y-2">
          <p className="font-semibold text-[color:var(--foreground)]">
            Fractional-rate channel with initial tokens:
          </p>
          {jsonBlock(`{
  "id": "c2",
  "src": "lidar",
  "dst": "detector",
  "rateSrc": "1/4",
  "rateDst": "-1",
  "init": "3/4"
}`)}
          <p className="text-xs text-[color:var(--muted)]">
            Here, the lidar produces 1/4 of a token per firing, and the detector
            consumes 1 token per firing. The channel starts with 3/4 token
            pre-loaded.
          </p>
        </div>
      </div>
    ),
  },

  /* ── Rational Numbers ──────────────────────────────────────────────── */
  {
    id: "rationals",
    title: "Rational Numbers",
    content: (
      <div className="space-y-3 text-sm text-[color:var(--muted-strong)]">
        <p>
          All rate and token values ({code("rateSrc")}, {code("rateDst")},{" "}
          {code("init")}) use <strong>exact rational arithmetic</strong> — never
          floating point. Values are expressed as <strong>strings</strong> to
          preserve precision.
        </p>

        <div className="space-y-2">
          <p className="font-semibold text-[color:var(--foreground)]">
            Valid formats:
          </p>
          <ul className="list-inside list-disc space-y-1 text-xs">
            <li>{code('"1"')} — integer one</li>
            <li>{code('"-1"')} — negative one</li>
            <li>{code('"1/3"')} — one third</li>
            <li>{code('"-2/3"')} — negative two thirds</li>
            <li>{code('"0"')} — zero</li>
            <li>{code('"4/5"')} — four fifths</li>
          </ul>
        </div>

        <div className="space-y-2">
          <p className="font-semibold text-[color:var(--foreground)]">Rules:</p>
          <ul className="list-inside list-disc space-y-1 text-xs">
            <li>Denominator must not be zero.</li>
            <li>Sign is always placed in the numerator (normalized form).</li>
            <li>
              {code("rateSrc")} must be <strong>positive</strong> (tokens are
              produced).
            </li>
            <li>
              {code("rateDst")} must be <strong>negative</strong> (tokens are
              consumed).
            </li>
            <li>
              {code("init")} must be <strong>non-negative</strong> (&ge; 0).
            </li>
            <li>
              {code("init")} must be a multiple of {code("1/q")} where{" "}
              {code("q")} is the maximum denominator of the channel{"'"}s rates.
              For example, if rates are {code('"1/4"')} and {code('"-1"')}, then{" "}
              {code("q = 4")} and valid init values include {code('"0"')},{" "}
              {code('"1/4"')}, {code('"1/2"')}, {code('"3/4"')}, {code('"1"')},
              etc.
            </li>{" "}
            <li>
              At least one rate per channel must be an <strong>integer</strong>.
              The other rate may be a rational fraction for resampling.
              Self-loop channels ({code("src == dst")}) are exempt.
            </li>{" "}
          </ul>
        </div>

        <div className="rounded-lg border border-[color:var(--severity-warn-bg)] bg-[color:var(--severity-warn-bg)] p-3 text-xs text-[color:var(--severity-warn-text)]">
          <strong>Warning:</strong> Do not use decimal numbers like{" "}
          {code('"0.5"')} or {code('"0.333"')}. Always use fraction notation:{" "}
          {code('"1/2"')}, {code('"1/3"')}.
        </div>
      </div>
    ),
  },

  /* ── Verification ──────────────────────────────────────────────────── */
  {
    id: "verification",
    title: "Verification Pipeline",
    content: (
      <div className="space-y-3 text-sm text-[color:var(--muted-strong)]">
        <p>
          When you click <strong>Validate</strong> or <strong>Execute</strong>,
          the model goes through three levels of verification:
        </p>
        <ol className="list-inside list-decimal space-y-3 text-xs">
          <li>
            <strong>Structural Validation</strong> — checks that all IDs are
            unique, rates parse correctly, signs are correct, at least one rate
            per channel is an integer, references exist, and timed actors have
            valid timing.
          </li>
          <li>
            <strong>Consistency</strong> — verifies that the model has bounded
            memory by solving the topology equation &Gamma;x = 0. A consistent
            model will not accumulate unbounded tokens.
          </li>
          <li>
            <strong>Liveness</strong> — constructs a witness execution to prove
            the model is deadlock-free. Every actor can complete its required
            number of firings and the system returns to its initial state.
          </li>
        </ol>
        <p>
          <strong>Validate</strong> runs all three checks.{" "}
          <strong>Execute</strong> additionally produces schedule and
          token-trace artifacts for visualization.
        </p>
      </div>
    ),
  },

  /* ── Diagnostic Codes ──────────────────────────────────────────────── */
  {
    id: "diagnostics",
    title: "Diagnostic Codes",
    content: (
      <div className="space-y-3 text-sm text-[color:var(--muted-strong)]">
        <p>The verifier produces diagnostics at three severity levels:</p>

        <div className="space-y-2">
          <p className="font-semibold text-[color:var(--severity-error-text)]">
            Errors (block verification):
          </p>
          <ul className="list-inside list-disc space-y-1 text-xs">
            <li>
              {code("E_PARSE_RATIONAL")} — a rate or init value is not a valid
              rational
            </li>
            <li>
              {code("E_RATE_SIGN")} — rateSrc must be positive, rateDst must be
              negative
            </li>
            <li>
              {code("E_RATE_INTEGER_RULE")} — at least one rate per channel must
              be an integer
            </li>
            <li>
              {code("E_INIT_INVALID")} — initial tokens are negative or not a
              valid multiple
            </li>
            <li>
              {code("E_REF_MISSING")} — channel references a non-existent actor
            </li>
            <li>
              {code("E_TOPOLOGY_INVALID")} — structural issues (missing IDs,
              duplicate IDs, invalid timing)
            </li>
            <li>
              {code("E_INCONSISTENT")} — no valid repetition vector exists
              (unbounded memory)
            </li>
            <li>
              {code("E_NOT_LIVE")} — deadlock detected during witness
              construction
            </li>
          </ul>
        </div>

        <div className="space-y-2">
          <p className="font-semibold text-[color:var(--severity-warn-text)]">
            Warnings:
          </p>
          <ul className="list-inside list-disc space-y-1 text-xs">
            <li>
              {code("W_DISCONNECTED_GRAPH")} — the graph has separate
              disconnected components
            </li>
            <li>
              {code("W_UNUSED_ACTOR")} — an actor has no channels connected to
              it
            </li>
          </ul>
        </div>

        <div className="space-y-2">
          <p className="font-semibold text-[color:var(--severity-info-text)]">
            Info:
          </p>
          <ul className="list-inside list-disc space-y-1 text-xs">
            <li>{code("I_VALID_MODEL")} — structural validation passed</li>
            <li>{code("I_CONSISTENT")} — consistency check passed</li>
            <li>{code("I_LIVE")} — liveness check passed</li>
          </ul>
        </div>
      </div>
    ),
  },

  /* ── Full Example ──────────────────────────────────────────────────── */
  {
    id: "example",
    title: "Complete Example",
    content: (
      <div className="space-y-3 text-sm text-[color:var(--muted-strong)]">
        <p>
          A minimal PX4 drone control loop with two timed sensors, an untimed
          estimator, a timed controller, and a logger:
        </p>
        {jsonBlock(`{
  "meta": { "name": "PX4 Control Loop", "version": 1 },
  "actors": [
    { "id": "imu",  "label": "IMU",        "timed": true,  "freq": 200, "phase": 0 },
    { "id": "est",  "label": "Estimator",   "timed": false },
    { "id": "ctrl", "label": "Controller",  "timed": true,  "freq": 100, "phase": 0 },
    { "id": "log",  "label": "Logger",      "timed": false }
  ],
  "channels": [
    { "id": "c1", "src": "imu",  "dst": "est",  "rateSrc": "1",   "rateDst": "-1", "init": "0"   },
    { "id": "c2", "src": "est",  "dst": "ctrl", "rateSrc": "1/2", "rateDst": "-1", "init": "1/2" },
    { "id": "c3", "src": "ctrl", "dst": "log",  "rateSrc": "1/2", "rateDst": "-1", "init": "1/2" }
  ]
}`)}
        <p className="text-xs text-[color:var(--muted)]">
          The IMU fires at 200 Hz, the controller at 100 Hz. The estimator and
          logger are untimed — they fire whenever their input channels have
          enough tokens. Channels c2 and c3 use fractional rates to account for
          the 2:1 frequency ratio, and start with 1/2 token to pre-load the
          pipeline.
        </p>
      </div>
    ),
  },

  /* ── Tips ───────────────────────────────────────────────────────────── */
  {
    id: "tips",
    title: "Tips & Best Practices",
    content: (
      <div className="space-y-3 text-sm text-[color:var(--muted-strong)]">
        <ul className="list-inside list-disc space-y-2 text-xs leading-relaxed">
          <li>
            <strong>Start simple.</strong> Begin with a few actors and 1:1
            channels ({code('"1"')} / {code('"-1"')} rates) before introducing
            fractional rates.
          </li>
          <li>
            <strong>Use meaningful IDs.</strong> Actor and channel IDs appear in
            diagnostics and visualizations. Short, descriptive IDs like{" "}
            {code('"imu"')}, {code('"c_imu_est"')} are best.
          </li>
          <li>
            <strong>Check diagnostics.</strong> Click any diagnostic in the
            terminal to focus the related actor or channel in the editor.
          </li>
          <li>
            <strong>Initial tokens matter.</strong> Pre-loading channels with
            tokens ({code("init > 0")}) can prevent deadlocks when actors need
            input before the source has fired.
          </li>
          <li>
            <strong>Self-loops are valid.</strong> A channel where{" "}
            {code("src == dst")} represents a feedback buffer within one actor.
          </li>
          <li>
            <strong>Frequency vs Period.</strong> Use whichever is more natural:
            {code("freq: 100")} (100 Hz) is the same as {code("period: 10")} (10
            ms).
          </li>
          <li>
            <strong>Phase offsets.</strong> Use {code("phase")} to stagger timed
            actors. For example, {code("phase: 20")} delays the first firing by
            20 ms.
          </li>
        </ul>
      </div>
    ),
  },
];

/* ─── collapsible section ───────────────────────────────────────────── */

function HelpSection({
  section,
  isOpen,
  onToggle,
}: {
  section: Section;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-[color:var(--panel-border)] last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-5 py-3 text-left text-sm font-semibold text-[color:var(--foreground)] transition hover:bg-[color:var(--accent-muted)]"
      >
        <span>{section.title}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`h-4 w-4 shrink-0 text-[color:var(--muted)] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {isOpen && <div className="px-5 pb-4 pt-1">{section.content}</div>}
    </div>
  );
}

/* ─── main panel ────────────────────────────────────────────────────── */

export default function JsonSyntaxHelp({ onClose }: { onClose: () => void }) {
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(["overview"]),
  );

  const toggle = (id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAll = () => setOpenSections(new Set(sections.map((s) => s.id)));

  const collapseAll = () => setOpenSections(new Set());

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-[color:var(--panel-border)] bg-[color:var(--panel)] shadow-sm">
      {/* header */}
      <div className="flex items-center justify-between border-b border-[color:var(--panel-border)] px-5 py-3">
        <div className="flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4 text-[color:var(--muted)]"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM8.94 6.94a.75.75 0 11-1.061-1.061 3 3 0 112.871 5.026v.345a.75.75 0 01-1.5 0v-.5c0-.72.57-1.172 1.081-1.287A1.5 1.5 0 108.94 6.94zM10 15a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
          <h3 className="text-sm font-semibold text-[color:var(--foreground)]">
            JSON Syntax Reference
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={expandAll}
            className="rounded px-2 py-1 text-[0.7rem] text-[color:var(--muted)] transition hover:bg-[color:var(--accent-muted)] hover:text-[color:var(--foreground)]"
          >
            Expand all
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="rounded px-2 py-1 text-[0.7rem] text-[color:var(--muted)] transition hover:bg-[color:var(--accent-muted)] hover:text-[color:var(--foreground)]"
          >
            Collapse all
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-1 rounded p-1 text-[color:var(--muted)] transition hover:bg-[color:var(--accent-muted)] hover:text-[color:var(--foreground)]"
            aria-label="Close help"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
      </div>

      {/* scrollable body */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sections.map((section) => (
          <HelpSection
            key={section.id}
            section={section}
            isOpen={openSections.has(section.id)}
            onToggle={() => toggle(section.id)}
          />
        ))}
      </div>
    </div>
  );
}
