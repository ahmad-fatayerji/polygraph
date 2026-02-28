"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";

/* ─── markdown content (imported at build time via raw-loader would be ideal,
      but for simplicity we keep it co-located) ──────────────────────────── */

import { DOC_MARKDOWN } from "./content";

/* ─── table of contents ─────────────────────────────────────────────── */

type TocEntry = { id: string; title: string; level: number };

function buildToc(md: string): TocEntry[] {
  const entries: TocEntry[] = [];
  const re = /^(#{1,3})\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(md)) !== null) {
    const level = match[1].length;
    const title = match[2].replace(/\*\*/g, "").trim();
    const id = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    entries.push({ id, title, level });
  }
  return entries;
}

/* ─── section components ────────────────────────────────────────────── */

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [code]);

  return (
    <div className="group relative">
      {label && (
        <div className="rounded-t-lg border border-b-0 border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] px-3 py-1 font-mono text-[0.7rem] text-[color:var(--muted)]">
          {label}
        </div>
      )}
      <pre
        className={`overflow-x-auto border border-[color:var(--panel-border)] bg-[color:var(--panel-muted)] p-4 font-mono text-[0.82rem] leading-relaxed text-[color:var(--foreground)] ${label ? "rounded-b-lg" : "rounded-lg"}`}
      >
        {code}
      </pre>
      <button
        type="button"
        onClick={copy}
        className="absolute right-2 top-2 rounded px-2 py-1 text-[0.65rem] font-semibold text-[color:var(--muted)] opacity-0 transition hover:bg-[color:var(--accent-muted)] hover:text-[color:var(--foreground)] group-hover:opacity-100"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

function FieldTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[color:var(--panel-border)]">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[color:var(--panel-border)] bg-[color:var(--panel-muted)]">
            {headers.map((h) => (
              <th
                key={h}
                className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-[color:var(--muted)]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-[color:var(--panel-border)] last:border-b-0"
            >
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`px-4 py-2.5 text-sm ${
                    j === 0
                      ? "font-mono font-semibold text-[color:var(--foreground)]"
                      : "text-[color:var(--muted-strong)]"
                  }`}
                >
                  {cell === "**Yes**" ? (
                    <span className="rounded bg-[color:var(--severity-error-bg)] px-1.5 py-0.5 text-[0.7rem] font-semibold text-[color:var(--severity-error-text)]">
                      required
                    </span>
                  ) : cell === "Cond." ? (
                    <span className="rounded bg-[color:var(--severity-warn-bg)] px-1.5 py-0.5 text-[0.7rem] font-semibold text-[color:var(--severity-warn-text)]">
                      conditional
                    </span>
                  ) : cell === "No" && j === 2 ? (
                    <span className="rounded bg-[color:var(--chip)] px-1.5 py-0.5 text-[0.7rem] text-[color:var(--chip-text)]">
                      optional
                    </span>
                  ) : (
                    <span
                      dangerouslySetInnerHTML={{
                        __html: cell.replace(
                          /`([^`]+)`/g,
                          '<code class="rounded bg-[color:var(--accent-muted)] px-1 py-0.5 font-mono text-[0.82em]">$1</code>',
                        ),
                      }}
                    />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Callout({
  type,
  children,
}: {
  type: "info" | "warn" | "tip";
  children: React.ReactNode;
}) {
  const styles = {
    info: "border-[color:var(--severity-info-bg)] bg-[color:var(--severity-info-bg)] text-[color:var(--severity-info-text)]",
    warn: "border-[color:var(--severity-warn-bg)] bg-[color:var(--severity-warn-bg)] text-[color:var(--severity-warn-text)]",
    tip: "border-[color:var(--severity-info-bg)] bg-[color:var(--severity-info-bg)] text-[color:var(--severity-info-text)]",
  }[type];
  const labels = { info: "Note", warn: "Warning", tip: "Tip" };

  return (
    <div className={`rounded-lg border p-4 text-sm ${styles}`}>
      <strong>{labels[type]}:</strong> {children}
    </div>
  );
}

/* ─── section heading ───────────────────────────────────────────────── */

function SectionHeading({
  id,
  level,
  children,
}: {
  id: string;
  level: 1 | 2 | 3;
  children: React.ReactNode;
}) {
  const Tag = `h${level}` as const;
  const sizes = {
    1: "text-3xl font-bold",
    2: "text-2xl font-bold",
    3: "text-lg font-semibold",
  }[level];

  return (
    <Tag
      id={id}
      className={`scroll-mt-24 text-[color:var(--foreground)] ${sizes}`}
    >
      <a href={`#${id}`} className="hover:underline">
        {children}
      </a>
    </Tag>
  );
}

/* ─── main page ─────────────────────────────────────────────────────── */

export default function DocsPage() {
  const toc = buildToc(DOC_MARKDOWN);
  const [copied, setCopied] = useState(false);
  const [activeId, setActiveId] = useState<string>("");

  const copyMarkdown = useCallback(() => {
    navigator.clipboard.writeText(DOC_MARKDOWN).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  /* intersection observer for active TOC highlight */
  useEffect(() => {
    const headings = toc
      .map((t) => document.getElementById(t.id))
      .filter(Boolean) as HTMLElement[];
    if (!headings.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 },
    );

    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [toc]);

  return (
    <div className="min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)]">
      {/* top bar */}
      <header className="sticky top-0 z-50 border-b border-[color:var(--panel-border)] bg-[color:var(--panel)]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm font-semibold text-[color:var(--muted)] transition hover:text-[color:var(--foreground)]"
            >
              &larr; Back to Editor
            </Link>
            <span className="text-sm text-[color:var(--panel-border)]">/</span>
            <h1 className="text-sm font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
              PolyGraph Docs
            </h1>
          </div>
          <button
            type="button"
            onClick={copyMarkdown}
            className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--panel-border)] px-3 py-1.5 text-xs font-semibold text-[color:var(--muted-strong)] transition hover:bg-[color:var(--accent-muted)]"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-3.5 w-3.5"
            >
              <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
              <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
            </svg>
            {copied ? "Copied Markdown!" : "Copy as Markdown"}
          </button>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-8 px-6 py-10">
        {/* sidebar TOC – desktop */}
        <nav
          className="hidden w-56 shrink-0 lg:block"
          aria-label="Table of contents"
        >
          <div className="sticky top-20">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
              Contents
            </p>
            <ul className="space-y-1 text-sm">
              {toc.map((entry) => (
                <li
                  key={entry.id}
                  style={{ paddingLeft: `${(entry.level - 1) * 12}px` }}
                >
                  <a
                    href={`#${entry.id}`}
                    className={`block rounded px-2 py-1 transition ${
                      activeId === entry.id
                        ? "bg-[color:var(--accent-muted)] font-semibold text-[color:var(--foreground)]"
                        : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
                    }`}
                  >
                    {entry.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        {/* main content */}
        <main className="min-w-0 flex-1">
          <article className="space-y-16">
            {/* ── Title ────────────────────────────────────────────── */}
            <header className="space-y-4">
              <h1 className="text-4xl font-bold tracking-tight text-[color:var(--foreground)]">
                PolyGraph JSON Specification
              </h1>
              <p className="max-w-2xl text-lg leading-relaxed text-[color:var(--muted-strong)]">
                A complete reference for the JSON format used to define
                PolyGraph models — concurrent dataflow networks for CPS
                workloads.
              </p>
              <div className="flex items-center gap-3 text-xs text-[color:var(--muted)]">
                <span className="rounded bg-[color:var(--chip)] px-2 py-0.5 text-[color:var(--chip-text)]">
                  v1.0
                </span>
                <span>Last updated: February 2026</span>
              </div>
            </header>

            {/* ── Top-Level Structure ──────────────────────────────── */}
            <section className="space-y-6">
              <SectionHeading id="top-level-structure" level={2}>
                Top-Level Structure
              </SectionHeading>
              <p className="text-[color:var(--muted-strong)]">
                A PolyGraph model is a JSON object with three keys:
              </p>
              <CodeBlock
                label="json"
                code={`{
  "meta": { ... },      // optional metadata
  "actors": [ ... ],    // required — list of actors
  "channels": [ ... ]   // required — list of channels
}`}
              />
              <FieldTable
                headers={["Key", "Type", "Required", "Description"]}
                rows={[
                  [
                    "meta",
                    "object",
                    "No",
                    "Optional metadata (name, version).",
                  ],
                  ["actors", "array", "**Yes**", "List of actor definitions."],
                  [
                    "channels",
                    "array",
                    "**Yes**",
                    "List of channel (edge) definitions.",
                  ],
                ]}
              />
            </section>

            {/* ── Meta ─────────────────────────────────────────────── */}
            <section className="space-y-6">
              <SectionHeading id="meta-object" level={2}>
                Meta Object
              </SectionHeading>
              <p className="text-[color:var(--muted-strong)]">
                Optional metadata about the model. Has no effect on
                verification.
              </p>
              <CodeBlock
                label="json"
                code={`"meta": {
  "name": "ADAS System Model",
  "version": 1
}`}
              />
              <FieldTable
                headers={["Field", "Type", "Required", "Description"]}
                rows={[
                  ["name", "string", "No", "Human-readable model name."],
                  ["version", "number", "No", "Schema version number."],
                ]}
              />
            </section>

            {/* ── Actors ───────────────────────────────────────────── */}
            <section className="space-y-6">
              <SectionHeading id="actors-array" level={2}>
                Actors
              </SectionHeading>
              <p className="text-[color:var(--muted-strong)]">
                Actors are the processing nodes in your dataflow graph. Each
                actor fires (executes) and produces/consumes tokens on its
                connected channels. Actors can be <strong>timed</strong> (fire
                at a fixed frequency/period) or <strong>untimed</strong> (fire
                whenever input tokens are available).
              </p>
              <FieldTable
                headers={["Field", "Type", "Required", "Description"]}
                rows={[
                  [
                    "id",
                    "string",
                    "**Yes**",
                    "Unique identifier. Referenced by channels. Must be non-empty and unique across all actors.",
                  ],
                  ["label", "string", "No", "Human-readable display name."],
                  [
                    "timed",
                    "boolean",
                    "**Yes**",
                    "`true` for fixed-rate actors; `false` for data-driven actors.",
                  ],
                  [
                    "freq",
                    "number",
                    "Cond.",
                    "Firing frequency in Hz. Required for timed actors if `period` is not set. Must be > 0.",
                  ],
                  [
                    "period",
                    "number",
                    "Cond.",
                    "Firing period in milliseconds. Required for timed actors if `freq` is not set. Must be > 0.",
                  ],
                  [
                    "phase",
                    "number",
                    "No",
                    "Initial phase offset in milliseconds. Must be >= 0. Defaults to 0. Only meaningful for timed actors.",
                  ],
                ]}
              />

              <SectionHeading id="timed-actors" level={3}>
                Timed Actors
              </SectionHeading>
              <p className="text-[color:var(--muted-strong)]">
                Timed actors fire at regular intervals. Provide{" "}
                <strong>either</strong>{" "}
                <code className="rounded bg-[color:var(--accent-muted)] px-1 py-0.5 font-mono text-[0.85em]">
                  freq
                </code>{" "}
                or{" "}
                <code className="rounded bg-[color:var(--accent-muted)] px-1 py-0.5 font-mono text-[0.85em]">
                  period
                </code>{" "}
                (at least one is required).
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[color:var(--muted)]">
                    Using freq (Hz)
                  </p>
                  <CodeBlock
                    code={`{
  "id": "imu",
  "label": "IMU Sensor",
  "timed": true,
  "freq": 200,
  "phase": 0
}`}
                  />
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[color:var(--muted)]">
                    Using period (ms)
                  </p>
                  <CodeBlock
                    code={`{
  "id": "ebs",
  "label": "Emergency Braking",
  "timed": true,
  "period": 100,
  "phase": 20
}`}
                  />
                </div>
              </div>

              <SectionHeading id="untimed-actors" level={3}>
                Untimed Actors
              </SectionHeading>
              <p className="text-[color:var(--muted-strong)]">
                Untimed actors fire whenever their input channels have enough
                tokens. They should <strong>not</strong> have{" "}
                <code className="rounded bg-[color:var(--accent-muted)] px-1 py-0.5 font-mono text-[0.85em]">
                  freq
                </code>
                ,{" "}
                <code className="rounded bg-[color:var(--accent-muted)] px-1 py-0.5 font-mono text-[0.85em]">
                  period
                </code>
                , or{" "}
                <code className="rounded bg-[color:var(--accent-muted)] px-1 py-0.5 font-mono text-[0.85em]">
                  phase
                </code>
                .
              </p>
              <CodeBlock
                code={`{
  "id": "estimator",
  "label": "State Estimator",
  "timed": false
}`}
              />
              <Callout type="info">
                Only one of <code className="font-mono">freq</code> or{" "}
                <code className="font-mono">period</code> is needed for timed
                actors. If both are provided,{" "}
                <code className="font-mono">freq</code> takes precedence.
              </Callout>
            </section>

            {/* ── Channels ─────────────────────────────────────────── */}
            <section className="space-y-6">
              <SectionHeading id="channels-array" level={2}>
                Channels
              </SectionHeading>
              <p className="text-[color:var(--muted-strong)]">
                Channels are directed edges connecting a <strong>source</strong>{" "}
                actor to a <strong>destination</strong> actor. They carry tokens
                — each firing of the source produces tokens, and each firing of
                the destination consumes tokens.
              </p>
              <FieldTable
                headers={["Field", "Type", "Required", "Description"]}
                rows={[
                  [
                    "id",
                    "string",
                    "**Yes**",
                    "Unique identifier for the channel.",
                  ],
                  [
                    "src",
                    "string",
                    "**Yes**",
                    "The `id` of the source actor (producer).",
                  ],
                  [
                    "dst",
                    "string",
                    "**Yes**",
                    "The `id` of the destination actor. Self-loops (`src == dst`) are allowed.",
                  ],
                  [
                    "rateSrc",
                    "string",
                    "**Yes**",
                    'Production rate — a positive rational. E.g. `"1"`, `"1/3"`, `"4/5"`.',
                  ],
                  [
                    "rateDst",
                    "string",
                    "**Yes**",
                    'Consumption rate — a negative rational. E.g. `"-1"`, `"-2/3"`.',
                  ],
                  [
                    "init",
                    "string",
                    "**Yes**",
                    'Initial tokens — a non-negative rational. E.g. `"0"`, `"3/4"`.',
                  ],
                ]}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[color:var(--muted)]">
                    Simple 1:1 channel
                  </p>
                  <CodeBlock
                    code={`{
  "id": "c1",
  "src": "imu",
  "dst": "estimator",
  "rateSrc": "1",
  "rateDst": "-1",
  "init": "0"
}`}
                  />
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[color:var(--muted)]">
                    Fractional-rate + initial tokens
                  </p>
                  <CodeBlock
                    code={`{
  "id": "c_ldr_obd",
  "src": "ldr",
  "dst": "obd",
  "rateSrc": "1/4",
  "rateDst": "-1",
  "init": "3/4"
}`}
                  />
                </div>
              </div>
              <p className="text-sm text-[color:var(--muted)]">
                In the fractional example, the lidar produces 1/4 token per
                firing and the obstacle detector consumes 1 token. The channel
                starts with 3/4 token, so it needs just 1 more lidar firing to
                fire the detector.
              </p>
            </section>

            {/* ── Rational Numbers ─────────────────────────────────── */}
            <section className="space-y-6">
              <SectionHeading id="rational-number-format" level={2}>
                Rational Numbers
              </SectionHeading>
              <p className="text-[color:var(--muted-strong)]">
                All rate and token values use{" "}
                <strong>exact rational arithmetic</strong> — never floating
                point. Values are written as <strong>strings</strong> to
                preserve precision.
              </p>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[color:var(--muted)]">
                    Valid Formats
                  </p>
                  <FieldTable
                    headers={["Value", "Meaning"]}
                    rows={[
                      ['"1"', "Integer one"],
                      ['"-1"', "Negative one"],
                      ['"1/3"', "One third"],
                      ['"-2/3"', "Negative two thirds"],
                      ['"0"', "Zero"],
                      ['"4/5"', "Four fifths"],
                    ]}
                  />
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[color:var(--muted)]">
                    Rules
                  </p>
                  <ul className="space-y-2 text-sm text-[color:var(--muted-strong)]">
                    <li className="flex gap-2">
                      <span className="shrink-0 text-[color:var(--muted)]">
                        1.
                      </span>
                      Denominator must not be zero.
                    </li>
                    <li className="flex gap-2">
                      <span className="shrink-0 text-[color:var(--muted)]">
                        2.
                      </span>
                      Sign is always in the numerator. Write{" "}
                      <code className="rounded bg-[color:var(--accent-muted)] px-1 py-0.5 font-mono text-[0.85em]">
                        &quot;-1/3&quot;
                      </code>
                      , not{" "}
                      <code className="rounded bg-[color:var(--accent-muted)] px-1 py-0.5 font-mono text-[0.85em]">
                        &quot;1/-3&quot;
                      </code>
                      .
                    </li>
                    <li className="flex gap-2">
                      <span className="shrink-0 text-[color:var(--muted)]">
                        3.
                      </span>
                      <code className="font-mono">rateSrc</code> must be{" "}
                      <strong>positive</strong> (&gt; 0).
                    </li>
                    <li className="flex gap-2">
                      <span className="shrink-0 text-[color:var(--muted)]">
                        4.
                      </span>
                      <code className="font-mono">rateDst</code> must be{" "}
                      <strong>negative</strong> (&lt; 0).
                    </li>
                    <li className="flex gap-2">
                      <span className="shrink-0 text-[color:var(--muted)]">
                        5.
                      </span>
                      <code className="font-mono">init</code> must be{" "}
                      <strong>non-negative</strong> (&ge; 0).
                    </li>
                    <li className="flex gap-2">
                      <span className="shrink-0 text-[color:var(--muted)]">
                        6.
                      </span>
                      <code className="font-mono">init</code> must be a multiple
                      of <code className="font-mono">1/q</code> where q ={" "}
                      max(denominator(rateSrc), denominator(rateDst)).
                    </li>
                  </ul>
                </div>
              </div>
              <Callout type="warn">
                Do not use decimal numbers like{" "}
                <code className="font-mono">&quot;0.5&quot;</code> or{" "}
                <code className="font-mono">&quot;0.333&quot;</code>. Always use
                fraction notation:{" "}
                <code className="font-mono">&quot;1/2&quot;</code>,{" "}
                <code className="font-mono">&quot;1/3&quot;</code>.
              </Callout>
            </section>

            {/* ── Verification Pipeline ────────────────────────────── */}
            <section className="space-y-6">
              <SectionHeading id="verification-pipeline" level={2}>
                Verification Pipeline
              </SectionHeading>
              <p className="text-[color:var(--muted-strong)]">
                When you validate or execute a model, it goes through three
                levels. Each level must pass before the next runs.
              </p>
              <div className="grid gap-4 md:grid-cols-3">
                {[
                  {
                    n: "1",
                    title: "Structural Validation",
                    desc: "Checks that all IDs are unique, rates parse correctly, signs are correct, references exist, and timed actors have valid timing.",
                  },
                  {
                    n: "2",
                    title: "Consistency",
                    desc: "Verifies bounded memory by solving Γx = 0. A consistent model doesn't accumulate unbounded tokens.",
                  },
                  {
                    n: "3",
                    title: "Liveness",
                    desc: "Constructs a witness execution to prove deadlock freedom. Every actor completes its required firings.",
                  },
                ].map((step) => (
                  <div
                    key={step.n}
                    className="rounded-lg border border-[color:var(--panel-border)] bg-[color:var(--panel)] p-5"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[color:var(--accent)] text-xs font-bold text-[color:var(--accent-contrast)]">
                        {step.n}
                      </span>
                      <h4 className="font-semibold text-[color:var(--foreground)]">
                        {step.title}
                      </h4>
                    </div>
                    <p className="text-sm text-[color:var(--muted-strong)]">
                      {step.desc}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-sm text-[color:var(--muted)]">
                <strong>Validate</strong> runs all three checks.{" "}
                <strong>Execute</strong> additionally produces schedule and
                token-trace artifacts for visualization.
              </p>
            </section>

            {/* ── Diagnostic Codes ─────────────────────────────────── */}
            <section className="space-y-6">
              <SectionHeading id="diagnostic-codes" level={2}>
                Diagnostic Codes
              </SectionHeading>

              <SectionHeading id="errors" level={3}>
                Errors
              </SectionHeading>
              <p className="text-sm text-[color:var(--muted-strong)]">
                Errors block verification from proceeding to the next level.
              </p>
              <FieldTable
                headers={["Code", "Description"]}
                rows={[
                  [
                    "E_PARSE_RATIONAL",
                    "A rate or init value is not a valid rational number.",
                  ],
                  [
                    "E_RATE_SIGN",
                    "`rateSrc` must be positive, `rateDst` must be negative.",
                  ],
                  [
                    "E_INIT_INVALID",
                    "Initial tokens are negative or not a valid multiple of `1/q`.",
                  ],
                  [
                    "E_REF_MISSING",
                    "A channel references a non-existent actor.",
                  ],
                  [
                    "E_TOPOLOGY_INVALID",
                    "Structural issues: missing IDs, duplicate IDs, invalid timing.",
                  ],
                  [
                    "E_INCONSISTENT",
                    "No valid repetition vector exists (unbounded memory).",
                  ],
                  ["E_NOT_LIVE", "Deadlock detected during witness execution."],
                ]}
              />

              <SectionHeading id="warnings" level={3}>
                Warnings
              </SectionHeading>
              <FieldTable
                headers={["Code", "Description"]}
                rows={[
                  [
                    "W_DISCONNECTED_GRAPH",
                    "The graph has separate disconnected components.",
                  ],
                  [
                    "W_UNUSED_ACTOR",
                    "An actor has no channels connected to it.",
                  ],
                ]}
              />

              <SectionHeading id="info" level={3}>
                Info
              </SectionHeading>
              <FieldTable
                headers={["Code", "Description"]}
                rows={[
                  ["I_VALID_MODEL", "Structural validation passed."],
                  ["I_CONSISTENT", "Consistency check passed."],
                  ["I_LIVE", "Liveness check passed."],
                ]}
              />
            </section>

            {/* ── Examples ─────────────────────────────────────────── */}
            <section className="space-y-6">
              <SectionHeading id="complete-examples" level={2}>
                Complete Examples
              </SectionHeading>

              <SectionHeading id="minimal-px4-control-loop" level={3}>
                Minimal PX4 Control Loop
              </SectionHeading>
              <p className="text-[color:var(--muted-strong)]">
                A simple drone control loop with two timed sensors, an untimed
                estimator, a timed controller, and a logger:
              </p>
              <CodeBlock
                label="json"
                code={`{
  "meta": { "name": "PX4 Control Loop", "version": 1 },
  "actors": [
    { "id": "imu",  "label": "IMU",        "timed": true,  "freq": 200, "phase": 0 },
    { "id": "est",  "label": "Estimator",   "timed": false },
    { "id": "ctrl", "label": "Controller",  "timed": true,  "freq": 100, "phase": 0 },
    { "id": "log",  "label": "Logger",      "timed": false }
  ],
  "channels": [
    { "id": "c1", "src": "imu",  "dst": "est",  "rateSrc": "1",   "rateDst": "-1", "init": "0"   },
    { "id": "c2", "src": "est",  "dst": "ctrl", "rateSrc": "1",   "rateDst": "-1", "init": "0"   },
    { "id": "c3", "src": "ctrl", "dst": "log",  "rateSrc": "1/2", "rateDst": "-1", "init": "1/2" }
  ]
}`}
              />
              <Callout type="tip">
                The IMU fires at 200 Hz, the controller at 100 Hz. Channel c3
                uses fractional rates: the controller produces 1/2 token per
                firing, the logger consumes 1 full token.
              </Callout>

              <SectionHeading id="adas-system" level={3}>
                ADAS System
              </SectionHeading>
              <p className="text-[color:var(--muted-strong)]">
                A complex ADAS with timed sensors, untimed processing, and
                phased outputs:
              </p>
              <CodeBlock
                label="json"
                code={`{
  "meta": { "name": "ADAS System Model", "version": 1 },
  "actors": [
    { "id": "ldr", "label": "Lidar",              "timed": true,  "period": 25 },
    { "id": "odm", "label": "Odometer",            "timed": true,  "period": 100 },
    { "id": "lcm", "label": "Left Camera",         "timed": true,  "period": 100 },
    { "id": "rcm", "label": "Right Camera",        "timed": true,  "period": 100 },
    { "id": "obd", "label": "Obstacle Detection",  "timed": false },
    { "id": "tsd", "label": "Traffic Signs",       "timed": false },
    { "id": "tld", "label": "Traffic Lanes",       "timed": false },
    { "id": "pdd", "label": "Pedestrian Det.",      "timed": false },
    { "id": "rmd", "label": "Road Mask",           "timed": false },
    { "id": "dmd", "label": "Depth Map",           "timed": false },
    { "id": "apd", "label": "Adv. Pedestrian",     "timed": false },
    { "id": "spc", "label": "Speed Control",       "timed": false },
    { "id": "ebs", "label": "Emergency Brake",     "timed": true,  "period": 100, "phase": 20 },
    { "id": "ifd", "label": "Info Display",        "timed": true,  "period": 100, "phase": 50 }
  ],
  "channels": [
    { "id": "c_ldr_obd", "src": "ldr", "dst": "obd", "rateSrc": "1/4", "rateDst": "-1",   "init": "3/4" },
    { "id": "c_obd_spc", "src": "obd", "dst": "spc", "rateSrc": "1",   "rateDst": "-1",   "init": "0" },
    { "id": "c_odm_spc", "src": "odm", "dst": "spc", "rateSrc": "1",   "rateDst": "-1",   "init": "0" },
    { "id": "c_lcm_tsd", "src": "lcm", "dst": "tsd", "rateSrc": "1",   "rateDst": "-1",   "init": "0" },
    { "id": "c_tsd_spc", "src": "tsd", "dst": "spc", "rateSrc": "1",   "rateDst": "-1",   "init": "0" },
    { "id": "c_lcm_tld", "src": "lcm", "dst": "tld", "rateSrc": "1/5", "rateDst": "-1/2", "init": "0" },
    { "id": "c_lcm_rmd", "src": "lcm", "dst": "rmd", "rateSrc": "1/2", "rateDst": "-1/2", "init": "0" },
    { "id": "c_lcm_pdd", "src": "lcm", "dst": "pdd", "rateSrc": "1",   "rateDst": "-1",   "init": "0" },
    { "id": "c_rcm_rmd", "src": "rcm", "dst": "rmd", "rateSrc": "1/5", "rateDst": "-4/5", "init": "0" },
    { "id": "c_rcm_dmd", "src": "rcm", "dst": "dmd", "rateSrc": "4/5", "rateDst": "-2/5", "init": "0" },
    { "id": "c_rmd_apd", "src": "rmd", "dst": "apd", "rateSrc": "1/2", "rateDst": "-1/5", "init": "0" },
    { "id": "c_dmd_apd", "src": "dmd", "dst": "apd", "rateSrc": "2/5", "rateDst": "-1/5", "init": "0" },
    { "id": "c_pdd_apd", "src": "pdd", "dst": "apd", "rateSrc": "1",   "rateDst": "-3/5", "init": "0" },
    { "id": "c_apd_ifd", "src": "apd", "dst": "ifd", "rateSrc": "1",   "rateDst": "-1",   "init": "0" },
    { "id": "c_spc_ebs", "src": "spc", "dst": "ebs", "rateSrc": "1",   "rateDst": "-1",   "init": "0" },
    { "id": "c_ebs_ifd", "src": "ebs", "dst": "ifd", "rateSrc": "1",   "rateDst": "-1",   "init": "0" }
  ]
}`}
              />
            </section>

            {/* ── Visual Editor Keyboard Shortcuts ──────────────── */}
            <section className="space-y-6">
              <SectionHeading id="visual-editor-shortcuts" level={2}>
                Visual Editor Keyboard Shortcuts
              </SectionHeading>
              <p className="text-[color:var(--muted-strong)]">
                When the visual editor is active and no text input is focused,
                the following keyboard shortcuts are available.
              </p>

              <div className="space-y-6">
                <div>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
                    General
                  </h3>
                  <div className="overflow-hidden rounded-lg border border-[color:var(--panel-border)]">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[color:var(--panel-border)] bg-[color:var(--panel)]">
                          <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
                            Shortcut
                          </th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[color:var(--panel-border)]">
                        {[
                          { key: "Ctrl / Cmd + Z", action: "Undo last action" },
                          {
                            key: "Ctrl / Cmd + Shift + Z",
                            action: "Redo last undone action",
                          },
                          {
                            key: "Ctrl / Cmd + Y",
                            action: "Redo (alternative)",
                          },
                        ].map((row) => (
                          <tr key={row.key}>
                            <td className="px-4 py-2.5">
                              <kbd className="rounded bg-[color:var(--accent-muted)] px-1.5 py-0.5 font-mono text-xs text-[color:var(--foreground)]">
                                {row.key}
                              </kbd>
                            </td>
                            <td className="px-4 py-2.5 text-[color:var(--muted-strong)]">
                              {row.action}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
                    Actors
                  </h3>
                  <div className="overflow-hidden rounded-lg border border-[color:var(--panel-border)]">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[color:var(--panel-border)] bg-[color:var(--panel)]">
                          <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
                            Shortcut
                          </th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[color:var(--panel-border)]">
                        {[
                          {
                            key: "A",
                            action:
                              "Add a new actor at the current pointer position",
                          },
                          {
                            key: "Ctrl / Cmd + D",
                            action: "Duplicate selected actors",
                          },
                          {
                            key: "Delete / Backspace",
                            action:
                              "Delete selected or focused actors (and their connections)",
                          },
                        ].map((row) => (
                          <tr key={row.key}>
                            <td className="px-4 py-2.5">
                              <kbd className="rounded bg-[color:var(--accent-muted)] px-1.5 py-0.5 font-mono text-xs text-[color:var(--foreground)]">
                                {row.key}
                              </kbd>
                            </td>
                            <td className="px-4 py-2.5 text-[color:var(--muted-strong)]">
                              {row.action}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
                    Channels (Connections)
                  </h3>
                  <div className="overflow-hidden rounded-lg border border-[color:var(--panel-border)]">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[color:var(--panel-border)] bg-[color:var(--panel)]">
                          <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
                            Shortcut
                          </th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[color:var(--panel-border)]">
                        {[
                          {
                            key: "Delete / Backspace",
                            action: "Delete selected or focused channels",
                          },
                          {
                            key: "Double-click edge",
                            action: "Delete that channel",
                          },
                        ].map((row) => (
                          <tr key={row.key}>
                            <td className="px-4 py-2.5">
                              <kbd className="rounded bg-[color:var(--accent-muted)] px-1.5 py-0.5 font-mono text-xs text-[color:var(--foreground)]">
                                {row.key}
                              </kbd>
                            </td>
                            <td className="px-4 py-2.5 text-[color:var(--muted-strong)]">
                              {row.action}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
                    Navigation &amp; Selection
                  </h3>
                  <div className="overflow-hidden rounded-lg border border-[color:var(--panel-border)]">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[color:var(--panel-border)] bg-[color:var(--panel)]">
                          <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
                            Shortcut
                          </th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[color:var(--panel-border)]">
                        {[
                          {
                            key: "Scroll wheel",
                            action: "Zoom in / out",
                          },
                          {
                            key: "Left-click drag (canvas)",
                            action: "Pan the canvas",
                          },
                          {
                            key: "Click node",
                            action: "Select actor",
                          },
                          {
                            key: "Click edge",
                            action: "Select channel",
                          },
                          {
                            key: "Click canvas",
                            action: "Deselect all",
                          },
                          {
                            key: "Drag selection",
                            action:
                              "Multi-select actors and channels (partial overlap)",
                          },
                        ].map((row) => (
                          <tr key={row.key}>
                            <td className="px-4 py-2.5">
                              <kbd className="rounded bg-[color:var(--accent-muted)] px-1.5 py-0.5 font-mono text-xs text-[color:var(--foreground)]">
                                {row.key}
                              </kbd>
                            </td>
                            <td className="px-4 py-2.5 text-[color:var(--muted-strong)]">
                              {row.action}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
                    Context Menu (Right-click)
                  </h3>
                  <div className="overflow-hidden rounded-lg border border-[color:var(--panel-border)]">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[color:var(--panel-border)] bg-[color:var(--panel)]">
                          <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
                            Target
                          </th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--muted)]">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[color:var(--panel-border)]">
                        {[
                          {
                            key: "Canvas",
                            action: "Add actor here",
                          },
                          {
                            key: "Node",
                            action: "Delete actor (and its connections)",
                          },
                          {
                            key: "Edge",
                            action: "Delete connection",
                          },
                        ].map((row) => (
                          <tr key={row.key}>
                            <td className="px-4 py-2.5 font-medium text-[color:var(--foreground)]">
                              {row.key}
                            </td>
                            <td className="px-4 py-2.5 text-[color:var(--muted-strong)]">
                              {row.action}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              <Callout type="info">
                Keyboard shortcuts are disabled while typing inside text inputs
                (e.g. the properties sidebar fields).
              </Callout>
            </section>

            {/* ── Tips ─────────────────────────────────────────────── */}
            <section className="space-y-6">
              <SectionHeading id="tips--best-practices" level={2}>
                Tips &amp; Best Practices
              </SectionHeading>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  {
                    title: "Start simple",
                    desc: 'Begin with a few actors and 1:1 channels ("1" / "-1" rates) before introducing fractional rates.',
                  },
                  {
                    title: "Use meaningful IDs",
                    desc: 'Short, descriptive IDs like "imu", "c_imu_est" make diagnostics and visualizations clearer.',
                  },
                  {
                    title: "Check diagnostics",
                    desc: "Click any diagnostic in the terminal to focus the related actor or channel in the editor.",
                  },
                  {
                    title: "Initial tokens matter",
                    desc: "Pre-loading channels with tokens (init > 0) can prevent deadlocks when consumers need input early.",
                  },
                  {
                    title: "Self-loops are valid",
                    desc: "A channel where src == dst represents a feedback buffer within one actor.",
                  },
                  {
                    title: "freq vs period",
                    desc: "Use whichever is more natural: freq: 100 (100 Hz) is equivalent to period: 10 (10 ms).",
                  },
                  {
                    title: "Phase offsets",
                    desc: "Use phase to stagger timed actors. E.g. phase: 20 delays the first firing by 20 ms.",
                  },
                  {
                    title: "Naming channels",
                    desc: 'Convention: c_<src>_<dst>, e.g. "c_imu_est" for a channel from IMU to Estimator.',
                  },
                  {
                    title: "Validate often",
                    desc: "Use the Validate button frequently during model construction to catch issues early.",
                  },
                  {
                    title: "Rate alignment",
                    desc: "When using fractional rates, make sure init aligns with the rate granularity.",
                  },
                ].map((tip) => (
                  <div
                    key={tip.title}
                    className="rounded-lg border border-[color:var(--panel-border)] bg-[color:var(--panel)] p-4"
                  >
                    <h4 className="mb-1 text-sm font-semibold text-[color:var(--foreground)]">
                      {tip.title}
                    </h4>
                    <p className="text-xs leading-relaxed text-[color:var(--muted-strong)]">
                      {tip.desc}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* ── TypeScript type ──────────────────────────────────── */}
            <section className="space-y-6">
              <SectionHeading id="typescript-type-reference" level={2}>
                TypeScript Type Reference
              </SectionHeading>
              <p className="text-[color:var(--muted-strong)]">
                For programmatic use, here is the canonical TypeScript type:
              </p>
              <CodeBlock
                label="typescript"
                code={`type PolyGraphModel = {
  meta?: { name?: string; version?: number };
  actors: Array<{
    id: string;
    label?: string;
    timed: boolean;
    freq?: number;    // Hz, required if timed and no period
    period?: number;  // ms, required if timed and no freq
    phase?: number;   // ms, >= 0, optional
  }>;
  channels: Array<{
    id: string;
    src: string;      // actor id
    dst: string;      // actor id
    rateSrc: string;  // positive rational, e.g. "1", "1/3"
    rateDst: string;  // negative rational, e.g. "-1", "-2/3"
    init: string;     // non-negative rational, e.g. "0", "3/4"
  }>;
};`}
              />
            </section>
          </article>

          {/* footer */}
          <footer className="mt-20 border-t border-[color:var(--panel-border)] py-8 text-center text-xs text-[color:var(--muted)]">
            PolyGraph Docs &middot; v1.0 &middot; February 2026
          </footer>
        </main>
      </div>
    </div>
  );
}
