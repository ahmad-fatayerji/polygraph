import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} from "node:worker_threads";

import {
  absRational,
  add,
  compare,
  div,
  fromBigint,
  lcmRational,
  modRational,
  mul,
  parseNumberToRational,
  parseRational,
  rationalZero,
  sub,
  toString as rationalToString,
  type Rational,
} from "../lib/polygraph/rational";
import type { PolyGraphModel } from "../lib/polygraph/types";
import { verify } from "../lib/polygraph/verify";

type PhaseMode = "first" | "all";
type SchedCriterion = "strict-ok" | "no-error";
type SweepMode = "grid" | "frontier";
type FrontierAxis = "wcet-vs-freq" | "freq-vs-wcet";

type SweepConfig = {
  modelPath: string;
  outDir: string;
  actorId: string;
  inChannelId: string;
  outChannelId: string;
  freqMin: number;
  freqMax: number;
  freqStep: number;
  wcetMin: number;
  wcetMax: number;
  wcetStep: number;
  phaseStepMs: Rational;
  phaseStepMsText: string;
  maxPhaseCandidates: number;
  phaseMode: PhaseMode;
  initSlackQuanta: number;
  maxC2InitExtraQuanta: number;
  criterion: SchedCriterion;
  sweepMode: SweepMode;
  monotonicEarlyExit: boolean;
  frontierAxis: FrontierAxis;
  frontierTolerance: number;
  frontierMaxIters: number;
  workers: number;
};

type FeasibleRow = {
  freqHz: string;
  wcetMs: string;
  phaseMs: string;
  c1RateDst: string;
  c1Init: string;
  c2RateSrc: string;
  c2Init: string;
  tickCount: string;
  worstCasePathMs: string;
  criticalPathThroughCnnMs: string;
};

type GridRow = {
  freqHz: string;
  wcetMs: string;
  feasible: "yes" | "no";
  selectedPhaseMs: string;
  c1RateDst: string;
  c1Init: string;
  c2RateSrc: string;
  c2Init: string;
  selectedCriticalPathThroughCnnMs: string;
  firstErrorId: string;
};

type XyzRow = {
  freqHz: string;
  wcetMs: string;
  criticalPathThroughCnnMs: string;
};

type FrontierRow = {
  anchorAxis: string;
  anchorValue: string;
  maxFeasibleValue: string;
  minInfeasibleValue: string;
  iterations: string;
  selectedPhaseMs: string;
  c1RateDst: string;
  c1Init: string;
  c2RateSrc: string;
  c2Init: string;
  selectedCriticalPathThroughCnnMs: string;
  status: string;
};

type PairEvalContext = {
  baseModel: PolyGraphModel;
  baseActor: PolyGraphModel["actors"][number];
  baseInChannel: PolyGraphModel["channels"][number];
  baseOutChannel: PolyGraphModel["channels"][number];
  basePhaseMs: Rational;
  baseC1Init: Rational;
  baseC2Init: Rational;
  constants: ChannelRetuneConstants;
  actorIndex: Map<string, number>;
};

type PairEvalResult = {
  feasible: boolean;
  freq: number;
  wcet: number;
  wcetRational: Rational;
  selectedPhaseMs: string;
  selectedC1Init: string;
  selectedC2Init: string;
  selectedCriticalPathThroughCnnMs: string;
  c1RateDstText: string;
  c2RateSrcText: string;
  firstErrorId: string;
  feasibleRowsForPair: FeasibleRow[];
};

type ChannelRetuneConstants = {
  inRateSrcBase: Rational;
  outRateDstBase: Rational;
  inSrcActorId: string;
  outDstActorId: string;
};

type PairTuneResult = {
  c1RateDst: Rational;
  c2RateSrc: Rational;
};

type ChannelInitResult = {
  c1Init: Rational;
  c2Init: Rational;
};

const USAGE = `
CNN-only schedulability sweep

Usage:
  npx tsx scripts/sweep-cnn-feasibility.ts [options]

Options:
  --model PATH                Input model JSON (default: public/px4-model-coords-camera-ai-lowfreq.json)
  --out-dir PATH              Output directory (default: analysis)
  --actor-id ID               CNN actor id (default: a2)
  --in-channel-id ID          Incoming channel to CNN (default: c1)
  --out-channel-id ID         Outgoing channel from CNN (default: c2)

  --freq-min N                Min frequency in Hz (default: 200)
  --freq-max N                Max frequency in Hz (default: 320)
  --freq-step N               Frequency step in Hz (default: 10)

  --wcet-min N                Min WCET in ms (default: 0.6)
  --wcet-max N                Max WCET in ms (default: 1.6)
  --wcet-step N               WCET step in ms (default: 0.05)

  --phase-step-ms R           Phase sweep step in ms, decimal or rational (default: 1/4)
  --max-phase-candidates N    Max tested phases per (freq, wcet) pair (default: 64)
  --phase-mode MODE           first | all (default: first)

  --init-slack-quanta N       Extra init quanta added on c1/c2 after min init (default: 0)
  --max-c2-init-extra-quanta N  Extra quanta explored for c2 init above minimum (default: 8)
  --workers N                 Parallel worker threads (default: CPU count - 1)
  --criterion MODE            strict-ok | no-error (default: no-error)

  --sweep-mode MODE           grid | frontier (default: grid)
  --monotonic-early-exit B    In grid mode, stop WCET scan after first infeasible per freq (default: true)
  --frontier-axis AXIS        wcet-vs-freq | freq-vs-wcet (default: wcet-vs-freq)
                              wcet-vs-freq  => for each freq, find max feasible WCET by bisection
                              freq-vs-wcet  => for each wcet, find max feasible freq by bisection
  --frontier-tolerance N      Bisection tolerance on the swept axis (default: 0.01)
  --frontier-max-iters N      Max bisection iterations per anchor point (default: 40)
  --help                      Show this help

Notes:
  - Only these elements are modified during sweep: actor a2, channel c1, channel c2.
  - All other actor frequencies and WCETs remain frozen from the input model.
`;

const cloneModel = (model: PolyGraphModel): PolyGraphModel =>
  JSON.parse(JSON.stringify(model)) as PolyGraphModel;

const fail = (message: string): never => {
  throw new Error(message);
};

const decimalDigits = (value: number): number => {
  const text = value.toString().toLowerCase();
  if (text.includes("e-")) {
    const [base, expText] = text.split("e-");
    const exp = Number(expText);
    const frac = (base.split(".")[1] ?? "").length;
    return exp + frac;
  }
  return (text.split(".")[1] ?? "").length;
};

const buildGrid = (min: number, max: number, step: number) => {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step)) {
    fail("Grid bounds must be finite numbers.");
  }
  if (step <= 0) {
    fail("Grid step must be > 0.");
  }
  if (max < min) {
    fail("Grid max must be >= min.");
  }

  const scale = 10 ** Math.max(decimalDigits(min), decimalDigits(max), decimalDigits(step));
  const start = Math.round(min * scale);
  const end = Math.round(max * scale);
  const delta = Math.round(step * scale);
  const values: number[] = [];

  for (let current = start; current <= end; current += delta) {
    values.push(current / scale);
  }

  return values;
};

const parsePositiveNumber = (raw: string, name: string) => {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    fail(`Invalid ${name}: ${raw}`);
  }
  return value;
};

const parseNonNegativeNumber = (raw: string, name: string) => {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    fail(`Invalid ${name}: ${raw}`);
  }
  return value;
};

const parseIntArg = (raw: string, name: string) => {
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    fail(`Invalid ${name}: ${raw}`);
  }
  return value;
};

const parseRationalInput = (raw: string, name: string): Rational => {
  const rational = parseRational(raw);
  if (rational.ok) {
    const rationalValue = rational.value;
    if (rationalValue === undefined) {
      throw new Error(`${name} could not be parsed as rational.`);
    }
    if (compare(rationalValue, rationalZero) <= 0) {
      fail(`${name} must be > 0.`);
    }
    return rationalValue;
  }

  const asNumber = Number(raw);
  if (!Number.isFinite(asNumber)) {
    fail(`Invalid ${name}: ${raw}`);
  }
  const fromNumber = parseNumberToRational(asNumber);
  if (fromNumber === null) {
    throw new Error(`Invalid ${name}: ${raw}`);
  }
  if (compare(fromNumber, rationalZero) <= 0) {
    fail(`Invalid ${name}: ${raw}`);
  }
  return fromNumber;
};

const parseArgs = (argv: string[]): SweepConfig => {
  const argMap = new Map<string, string>();

  for (let idx = 0; idx < argv.length; idx += 1) {
    const token = argv[idx];
    if (!token.startsWith("--")) continue;

    const noPrefix = token.slice(2);
    const eqIndex = noPrefix.indexOf("=");
    if (eqIndex >= 0) {
      const key = noPrefix.slice(0, eqIndex);
      const value = noPrefix.slice(eqIndex + 1);
      argMap.set(key, value);
      continue;
    }

    const next = argv[idx + 1];
    if (next && !next.startsWith("--")) {
      argMap.set(noPrefix, next);
      idx += 1;
      continue;
    }

    argMap.set(noPrefix, "true");
  }

  if (argMap.has("help")) {
    // eslint-disable-next-line no-console
    console.log(USAGE.trim());
    process.exit(0);
  }

  const phaseModeRaw = (argMap.get("phase-mode") ?? "first") as PhaseMode;
  if (phaseModeRaw !== "first" && phaseModeRaw !== "all") {
    fail(`Invalid --phase-mode: ${phaseModeRaw}. Use first or all.`);
  }

  const criterionRaw = (argMap.get("criterion") ?? "no-error") as SchedCriterion;
  if (criterionRaw !== "strict-ok" && criterionRaw !== "no-error") {
    fail(`Invalid --criterion: ${criterionRaw}. Use strict-ok or no-error.`);
  }

  const sweepModeRaw = (argMap.get("sweep-mode") ?? "grid") as SweepMode;
  if (sweepModeRaw !== "grid" && sweepModeRaw !== "frontier") {
    fail(`Invalid --sweep-mode: ${sweepModeRaw}. Use grid or frontier.`);
  }

  const frontierAxisRaw = (argMap.get("frontier-axis") ?? "wcet-vs-freq") as FrontierAxis;
  if (frontierAxisRaw !== "wcet-vs-freq" && frontierAxisRaw !== "freq-vs-wcet") {
    fail(`Invalid --frontier-axis: ${frontierAxisRaw}. Use wcet-vs-freq or freq-vs-wcet.`);
  }

  const monotonicEarlyExitRaw = (argMap.get("monotonic-early-exit") ?? "true").toLowerCase();
  const monotonicEarlyExit = monotonicEarlyExitRaw !== "false" && monotonicEarlyExitRaw !== "0";

  const phaseStepText = argMap.get("phase-step-ms") ?? "1/4";

  const cpuCount = os.cpus()?.length ?? 4;
  const defaultWorkers = Math.max(1, cpuCount - 1);

  return {
    modelPath: argMap.get("model") ?? "public/px4-model-coords-camera-ai-lowfreq.json",
    outDir: argMap.get("out-dir") ?? "analysis",
    actorId: argMap.get("actor-id") ?? "a2",
    inChannelId: argMap.get("in-channel-id") ?? "c1",
    outChannelId: argMap.get("out-channel-id") ?? "c2",
    freqMin: parseNonNegativeNumber(argMap.get("freq-min") ?? "200", "--freq-min"),
    freqMax: parseNonNegativeNumber(argMap.get("freq-max") ?? "320", "--freq-max"),
    freqStep: parsePositiveNumber(argMap.get("freq-step") ?? "10", "--freq-step"),
    wcetMin: parseNonNegativeNumber(argMap.get("wcet-min") ?? "0.6", "--wcet-min"),
    wcetMax: parseNonNegativeNumber(argMap.get("wcet-max") ?? "1.6", "--wcet-max"),
    wcetStep: parsePositiveNumber(argMap.get("wcet-step") ?? "0.05", "--wcet-step"),
    phaseStepMs: parseRationalInput(phaseStepText, "--phase-step-ms"),
    phaseStepMsText: phaseStepText,
    maxPhaseCandidates: parseIntArg(
      argMap.get("max-phase-candidates") ?? "64",
      "--max-phase-candidates"
    ),
    phaseMode: phaseModeRaw,
    initSlackQuanta: parseIntArg(argMap.get("init-slack-quanta") ?? "0", "--init-slack-quanta"),
    maxC2InitExtraQuanta: parseIntArg(
      argMap.get("max-c2-init-extra-quanta") ?? "8",
      "--max-c2-init-extra-quanta"
    ),
    criterion: criterionRaw,
    sweepMode: sweepModeRaw,
    monotonicEarlyExit,
    frontierAxis: frontierAxisRaw,
    frontierTolerance: parsePositiveNumber(
      argMap.get("frontier-tolerance") ?? "0.01",
      "--frontier-tolerance"
    ),
    frontierMaxIters: parseIntArg(
      argMap.get("frontier-max-iters") ?? "40",
      "--frontier-max-iters"
    ),
    workers: Math.max(
      1,
      parseIntArg(argMap.get("workers") ?? String(defaultWorkers), "--workers")
    ),
  };
};

const parseRationalOrFail = (raw: string, what: string): Rational => {
  const parsed = parseRational(raw);
  if (!parsed.ok) fail(`Cannot parse ${what}: ${raw}`);
  if (parsed.value === undefined) {
    throw new Error(`Cannot parse ${what}: ${raw}`);
  }
  return parsed.value;
};

const parseDurationMs = (value: string | number | undefined): Rational => {
  if (value === undefined || value === null || value === "") return { ...rationalZero };

  if (typeof value === "number") {
    const parsed = parseNumberToRational(value);
    if (parsed === null) {
      throw new Error(`Cannot parse numeric duration: ${value}`);
    }
    return parsed;
  }

  return parseRationalOrFail(String(value), "duration");
};

const getActorHz = (actor: PolyGraphModel["actors"][number]): Rational => {
  if (actor.freq !== undefined && Number.isFinite(actor.freq) && actor.freq > 0) {
    const parsed = parseNumberToRational(actor.freq);
    if (parsed === null) {
      throw new Error(`Invalid freq for actor ${actor.id}`);
    }
    if (compare(parsed, rationalZero) <= 0) {
      fail(`Invalid freq for actor ${actor.id}`);
    }
    return parsed;
  }

  if (actor.period !== undefined && Number.isFinite(actor.period) && actor.period > 0) {
    const periodMs = parseNumberToRational(actor.period);
    if (periodMs === null) {
      throw new Error(`Invalid period for actor ${actor.id}`);
    }
    if (compare(periodMs, rationalZero) <= 0) {
      fail(`Invalid period for actor ${actor.id}`);
    }
    return div({ n: 1000n, d: 1n }, periodMs);
  }

  throw new Error(`Actor ${actor.id} has neither valid freq nor period.`);
};

const getActorPeriodMs = (actor: PolyGraphModel["actors"][number]): Rational => {
  if (actor.period !== undefined && Number.isFinite(actor.period) && actor.period > 0) {
    const parsed = parseNumberToRational(actor.period);
    if (parsed === null) {
      throw new Error(`Invalid period for actor ${actor.id}`);
    }
    if (compare(parsed, rationalZero) <= 0) {
      fail(`Invalid period for actor ${actor.id}`);
    }
    return parsed;
  }

  if (actor.freq !== undefined && Number.isFinite(actor.freq) && actor.freq > 0) {
    const freq = parseNumberToRational(actor.freq);
    if (freq === null) {
      throw new Error(`Invalid freq for actor ${actor.id}`);
    }
    if (compare(freq, rationalZero) <= 0) {
      fail(`Invalid freq for actor ${actor.id}`);
    }
    return div({ n: 1000n, d: 1n }, freq);
  }

  throw new Error(`Actor ${actor.id} has neither valid freq nor period.`);
};

const ceilToQuantum = (value: Rational, quantum: Rational): Rational => {
  if (compare(value, rationalZero) <= 0) return { ...rationalZero };
  const scaled = div(value, quantum);
  const k = (scaled.n + scaled.d - 1n) / scaled.d;
  return mul(fromBigint(k), quantum);
};

const buildPhaseCandidates = (
  periodMs: Rational,
  baselinePhaseMs: Rational,
  phaseStepMs: Rational,
  maxPhaseCandidates: number
) => {
  const candidates: Rational[] = [];
  const pushUnique = (candidate: Rational) => {
    if (candidates.some((existing) => compare(existing, candidate) === 0)) return;
    candidates.push(candidate);
  };

  pushUnique(baselinePhaseMs);
  pushUnique(modRational(baselinePhaseMs, periodMs));

  let k = 0n;
  while (candidates.length < maxPhaseCandidates) {
    const candidate = mul(fromBigint(k), phaseStepMs);
    if (compare(candidate, periodMs) >= 0) break;
    pushUnique(candidate);
    k += 1n;
  }

  return candidates;
};

const toSafeCount = (value: Rational, what: string): number => {
  if (value.d !== 1n || value.n < 0n) {
    fail(`Expected integer count for ${what}.`);
  }
  if (value.n > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail(`Count too large for ${what}.`);
  }
  return Number(value.n);
};

const hasErrorDiagnostics = (diagnostics: Array<{ severity: string }>) =>
  diagnostics.some((diag) => diag.severity === "error");

const isSchedulable = (
  result: { ok: boolean; diagnostics: Array<{ severity: string }> },
  criterion: SchedCriterion
) => {
  if (criterion === "strict-ok") {
    return result.ok;
  }
  return !hasErrorDiagnostics(result.diagnostics);
};

type TimingJob = {
  firingIndex: number;
  es: Rational;
  ef: Rational;
  lf: Rational;
};

const parseRationalSafe = (raw: string): Rational | null => {
  const parsed = parseRational(raw);
  if (!parsed.ok || parsed.value === undefined) return null;
  return parsed.value;
};

const buildActorAdjacency = (model: PolyGraphModel) => {
  const actorIds = model.actors.map((actor) => actor.id);
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  for (const actorId of actorIds) {
    adjacency.set(actorId, []);
    indegree.set(actorId, 0);
  }

  const seenEdges = new Set<string>();
  for (const channel of model.channels) {
    if (channel.src === channel.dst) continue;
    if (!adjacency.has(channel.src) || !adjacency.has(channel.dst)) continue;
    const key = `${channel.src}\0${channel.dst}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    adjacency.get(channel.src)?.push(channel.dst);
    indegree.set(channel.dst, (indegree.get(channel.dst) ?? 0) + 1);
  }

  const starts = actorIds.filter((actorId) => (indegree.get(actorId) ?? 0) === 0);

  return {
    actorIds,
    adjacency,
    startNodes: starts.length > 0 ? starts : actorIds,
  };
};

const enumeratePathsThroughActor = (
  model: PolyGraphModel,
  actorId: string,
  maxPaths = 5000
) => {
  const { actorIds, adjacency, startNodes } = buildActorAdjacency(model);
  const paths: string[][] = [];
  let truncated = false;

  const dfs = (current: string, path: string[], visited: Set<string>) => {
    if (paths.length >= maxPaths) {
      truncated = true;
      return;
    }

    const nextIds = (adjacency.get(current) ?? []).filter(
      (nextId) => !visited.has(nextId)
    );

    if (nextIds.length === 0) {
      if (path.includes(actorId)) {
        paths.push([...path]);
      }
      return;
    }

    for (const nextId of nextIds) {
      visited.add(nextId);
      path.push(nextId);
      dfs(nextId, path, visited);
      path.pop();
      visited.delete(nextId);
      if (truncated) return;
    }
  };

  for (const startId of startNodes) {
    if (truncated) break;
    dfs(startId, [startId], new Set([startId]));
  }

  if (paths.length === 0 && actorIds.includes(actorId)) {
    paths.push([actorId]);
  }

  return { paths, truncated };
};

const computePathDurationFromJobs = (
  actorPath: string[],
  jobsByActor: Map<string, TimingJob[]>
): Rational | null => {
  const sourceJobs = jobsByActor.get(actorPath[0]) ?? [];
  if (sourceJobs.length === 0) return null;

  let worst: Rational | null = null;

  for (const source of sourceJobs) {
    let currentEf = source.ef;
    let sinkLf = source.lf;
    let valid = true;

    for (let idx = 1; idx < actorPath.length; idx += 1) {
      const actorJobs = jobsByActor.get(actorPath[idx]) ?? [];
      const nextJob = actorJobs.find((job) => compare(job.es, currentEf) >= 0);
      if (!nextJob) {
        valid = false;
        break;
      }
      currentEf = nextJob.ef;
      sinkLf = nextJob.lf;
    }

    if (!valid) continue;

    const duration = sub(sinkLf, source.es);
    if (worst === null || compare(duration, worst) > 0) {
      worst = duration;
    }
  }

  return worst;
};

const criticalPathFromWorstCaseArtifact = (
  result: ReturnType<typeof verify>,
  actorId: string
) => {
  const artifact = result.artifacts?.worstCasePath;
  if (!artifact) return "";

  let best: Rational | null = null;

  const consider = (durationText: string, actorPath: string[]) => {
    if (!actorPath.includes(actorId)) return;
    const duration = parseRationalSafe(durationText);
    if (!duration) return;
    if (best === null || compare(duration, best) > 0) {
      best = duration;
    }
  };

  consider(artifact.duration, artifact.path);
  for (const ranked of artifact.rankedPaths) {
    consider(ranked.duration, ranked.path);
  }

  return best ? rationalToString(best) : "";
};

const computeCriticalPathThroughActorMs = (
  model: PolyGraphModel,
  result: ReturnType<typeof verify>,
  actorId: string
) => {
  const timingRows = result.artifacts?.timingAnalysis?.firingTiming;
  if (!timingRows || timingRows.length === 0) {
    return criticalPathFromWorstCaseArtifact(result, actorId);
  }

  const jobsByActor = new Map<string, TimingJob[]>();
  for (const actor of model.actors) {
    jobsByActor.set(actor.id, []);
  }

  for (const row of timingRows) {
    const es = parseRationalSafe(row.es);
    const ef = parseRationalSafe(row.ef);
    const lf = parseRationalSafe(row.lf);
    if (!es || !ef || !lf) continue;

    if (!jobsByActor.has(row.actorId)) {
      jobsByActor.set(row.actorId, []);
    }
    jobsByActor.get(row.actorId)?.push({
      firingIndex: row.firingIndex,
      es,
      ef,
      lf,
    });
  }

  for (const actorJobs of jobsByActor.values()) {
    actorJobs.sort((left, right) => {
      const byEs = compare(left.es, right.es);
      if (byEs !== 0) return byEs;
      return left.firingIndex - right.firingIndex;
    });
  }

  const actorJobs = jobsByActor.get(actorId) ?? [];
  if (actorJobs.length === 0) {
    return criticalPathFromWorstCaseArtifact(result, actorId);
  }

  const { paths } = enumeratePathsThroughActor(model, actorId);
  if (paths.length === 0) {
    return criticalPathFromWorstCaseArtifact(result, actorId);
  }

  let worst: Rational | null = null;
  for (const actorPath of paths) {
    const duration = computePathDurationFromJobs(actorPath, jobsByActor);
    if (!duration) continue;
    if (worst === null || compare(duration, worst) > 0) {
      worst = duration;
    }
  }

  if (!worst) {
    return criticalPathFromWorstCaseArtifact(result, actorId);
  }

  return rationalToString(worst);
};

const appendUniqueRational = (items: Rational[], value: Rational) => {
  if (items.some((existing) => compare(existing, value) === 0)) return;
  items.push(value);
};

const channelInitQuantum = (channel: PolyGraphModel["channels"][number]): Rational => {
  const prod = absRational(parseRationalOrFail(channel.rateSrc, `${channel.id}.rateSrc`));
  const cons = absRational(parseRationalOrFail(channel.rateDst, `${channel.id}.rateDst`));
  const q = prod.d >= cons.d ? prod.d : cons.d;
  return { n: 1n, d: q };
};

const buildInitCandidates = (
  minimumInit: Rational,
  baselineInit: Rational,
  quantum: Rational,
  extraQuanta: number
) => {
  const values: Rational[] = [];
  const baseline = ceilToQuantum(baselineInit, quantum);
  const minimum = ceilToQuantum(minimumInit, quantum);

  appendUniqueRational(values, baseline);
  appendUniqueRational(values, minimum);

  for (let i = 1; i <= extraQuanta; i += 1) {
    appendUniqueRational(
      values,
      add(minimum, mul(fromBigint(BigInt(i)), quantum))
    );
  }

  return values;
};

const computeMinimumInitForChannel = (
  model: PolyGraphModel,
  channelId: string,
  actorIndex: Map<string, number>,
  initSlackQuanta: number
): Rational => {
  const channelMaybe = model.channels.find((entry) => entry.id === channelId);
  if (!channelMaybe) {
    throw new Error(`Channel not found: ${channelId}`);
  }
  const channel = channelMaybe;

  const srcMaybe = model.actors.find((entry) => entry.id === channel.src);
  const dstMaybe = model.actors.find((entry) => entry.id === channel.dst);
  if (!srcMaybe) {
    throw new Error(`Channel ${channelId} references unknown source actor.`);
  }
  if (!dstMaybe) {
    throw new Error(`Channel ${channelId} references unknown destination actor.`);
  }
  const src = srcMaybe;
  const dst = dstMaybe;

  if (!src.timed || !dst.timed) {
    return parseDurationMs(channel.init);
  }

  const srcIdxMaybe = actorIndex.get(src.id);
  const dstIdxMaybe = actorIndex.get(dst.id);
  if (srcIdxMaybe === undefined) {
    throw new Error(`Cannot index source actor for channel ${channelId}.`);
  }
  if (dstIdxMaybe === undefined) {
    throw new Error(`Cannot index destination actor for channel ${channelId}.`);
  }
  const srcIdx = srcIdxMaybe;
  const dstIdx = dstIdxMaybe;

  const prod = absRational(parseRationalOrFail(channel.rateSrc, `${channel.id}.rateSrc`));
  const cons = absRational(parseRationalOrFail(channel.rateDst, `${channel.id}.rateDst`));
  if (compare(prod, rationalZero) <= 0 || compare(cons, rationalZero) <= 0) {
    fail(`Channel ${channelId} must have positive production/consumption magnitudes.`);
  }

  const srcPeriodMs = getActorPeriodMs(src);
  const dstPeriodMs = getActorPeriodMs(dst);
  const srcPhaseMs = modRational(parseDurationMs(src.phase), srcPeriodMs);
  const dstPhaseMs = modRational(parseDurationMs(dst.phase), dstPeriodMs);

  const hyperperiodMs = lcmRational(srcPeriodMs, dstPeriodMs);
  const srcCount = toSafeCount(div(hyperperiodMs, srcPeriodMs), `${channelId} source firings`);
  const dstCount = toSafeCount(div(hyperperiodMs, dstPeriodMs), `${channelId} destination firings`);

  const events: Array<{ timeMs: Rational; actorIdx: number; delta: Rational }> = [];

  for (let i = 0; i < srcCount; i += 1) {
    const fireTime = add(srcPhaseMs, mul(srcPeriodMs, fromBigint(BigInt(i))));
    events.push({ timeMs: fireTime, actorIdx: srcIdx, delta: prod });
  }

  for (let i = 0; i < dstCount; i += 1) {
    const fireTime = add(dstPhaseMs, mul(dstPeriodMs, fromBigint(BigInt(i))));
    events.push({ timeMs: fireTime, actorIdx: dstIdx, delta: mul({ n: -1n, d: 1n }, cons) });
  }

  events.sort((left, right) => {
    const byTime = compare(left.timeMs, right.timeMs);
    if (byTime !== 0) return byTime;
    return left.actorIdx - right.actorIdx;
  });

  let balance = { ...rationalZero };
  let minBalance = { ...rationalZero };

  for (const event of events) {
    balance = add(balance, event.delta);
    if (compare(balance, minBalance) < 0) {
      minBalance = balance;
    }
  }

  const requiredRaw = compare(minBalance, rationalZero) < 0
    ? absRational(minBalance)
    : { ...rationalZero };

  const q = prod.d >= cons.d ? prod.d : cons.d;
  const quantum = { n: 1n, d: q };
  let required = ceilToQuantum(requiredRaw, quantum);

  if (initSlackQuanta > 0) {
    required = add(required, mul(fromBigint(BigInt(initSlackQuanta)), quantum));
  }

  return required;
};

const csvEscape = (value: string) => {
  if (!value.includes(",") && !value.includes("\n") && !value.includes("\"")) {
    return value;
  }
  return `"${value.replace(/\"/g, '""')}"`;
};

const toCsv = <T extends Record<string, string>>(rows: T[], headers: Array<keyof T>) => {
  const headerLine = headers.join(",");
  const body = rows
    .map((row) => headers.map((header) => csvEscape(row[header])).join(","))
    .join("\n");
  return body.length > 0 ? `${headerLine}\n${body}\n` : `${headerLine}\n`;
};

const parsePositiveRateMagnitude = (text: string, label: string): Rational => {
  const parsed = parseRational(text);
  if (!parsed.ok) fail(`Invalid ${label}: ${text}`);
  if (parsed.value === undefined) {
    throw new Error(`Invalid ${label}: ${text}`);
  }
  const magnitude = absRational(parsed.value);
  if (compare(magnitude, rationalZero) <= 0) {
    fail(`${label} must be non-zero.`);
  }
  return magnitude;
};

const retuneRatesForPair = (
  model: PolyGraphModel,
  actorId: string,
  inChannelId: string,
  outChannelId: string,
  constants: ChannelRetuneConstants
): PairTuneResult => {
  const actorMaybe = model.actors.find((entry) => entry.id === actorId);
  const inChannelMaybe = model.channels.find((entry) => entry.id === inChannelId);
  const outChannelMaybe = model.channels.find((entry) => entry.id === outChannelId);
  if (!actorMaybe) {
    throw new Error("Missing actor while retuning rates.");
  }
  if (!inChannelMaybe) {
    throw new Error("Missing incoming channel while retuning rates.");
  }
  if (!outChannelMaybe) {
    throw new Error("Missing outgoing channel while retuning rates.");
  }
  const actor = actorMaybe;
  const inChannel = inChannelMaybe;
  const outChannel = outChannelMaybe;

  const inSrcActorMaybe = model.actors.find((entry) => entry.id === constants.inSrcActorId);
  const outDstActorMaybe = model.actors.find((entry) => entry.id === constants.outDstActorId);
  if (!inSrcActorMaybe) {
    throw new Error("Missing upstream fixed actor while retuning rates.");
  }
  if (!outDstActorMaybe) {
    throw new Error("Missing downstream fixed actor while retuning rates.");
  }
  const inSrcActor = inSrcActorMaybe;
  const outDstActor = outDstActorMaybe;

  const fInSrc = getActorHz(inSrcActor);
  const fA2 = getActorHz(actor);
  const fOutDst = getActorHz(outDstActor);

  const c1RateDstMag = div(mul(constants.inRateSrcBase, fInSrc), fA2);
  const c2RateSrc = div(mul(constants.outRateDstBase, fOutDst), fA2);

  inChannel.rateDst = `-${rationalToString(c1RateDstMag)}`;
  outChannel.rateSrc = rationalToString(c2RateSrc);

  return {
    c1RateDst: c1RateDstMag,
    c2RateSrc,
  };
};

const retuneInitsForCandidate = (
  model: PolyGraphModel,
  inChannelId: string,
  outChannelId: string,
  actorIndex: Map<string, number>,
  initSlackQuanta: number
): ChannelInitResult => {
  const c1Init = computeMinimumInitForChannel(model, inChannelId, actorIndex, initSlackQuanta);
  const c2Init = computeMinimumInitForChannel(model, outChannelId, actorIndex, initSlackQuanta);

  const c1Maybe = model.channels.find((entry) => entry.id === inChannelId);
  const c2Maybe = model.channels.find((entry) => entry.id === outChannelId);
  if (!c1Maybe) {
    throw new Error("Missing incoming channel while retuning inits.");
  }
  if (!c2Maybe) {
    throw new Error("Missing outgoing channel while retuning inits.");
  }
  const c1 = c1Maybe;
  const c2 = c2Maybe;

  c1.init = rationalToString(c1Init);
  c2.init = rationalToString(c2Init);

  return { c1Init, c2Init };
};

const evaluatePair = (
  config: SweepConfig,
  ctx: PairEvalContext,
  freq: number,
  wcet: number
): PairEvalResult => {
  const wcetRational = parseNumberToRational(wcet);
  if (wcetRational === null) {
    throw new Error(`Cannot parse WCET value: ${wcet}`);
  }

  if (freq <= 0) {
    return {
      feasible: false,
      freq,
      wcet,
      wcetRational,
      selectedPhaseMs: "",
      selectedC1Init: "",
      selectedC2Init: "",
      selectedCriticalPathThroughCnnMs: "",
      c1RateDstText: "",
      c2RateSrcText: "",
      firstErrorId: "E_TOPOLOGY_INVALID",
      feasibleRowsForPair: [],
    };
  }

  const pairModel = cloneModel(ctx.baseModel);
  const pairActorMaybe = pairModel.actors.find((entry) => entry.id === config.actorId);
  if (!pairActorMaybe) {
    throw new Error(`Actor not found in candidate model: ${config.actorId}`);
  }
  const pairActor = pairActorMaybe;

  pairActor.freq = freq;
  delete pairActor.period;
  pairActor.executionTime = rationalToString(wcetRational);

  const tunedRates = retuneRatesForPair(
    pairModel,
    config.actorId,
    config.inChannelId,
    config.outChannelId,
    ctx.constants
  );

  const pairPeriodMs = getActorPeriodMs(pairActor);
  const phaseCandidates = buildPhaseCandidates(
    pairPeriodMs,
    ctx.basePhaseMs,
    config.phaseStepMs,
    config.maxPhaseCandidates
  );

  let foundAny = false;
  let firstErrorId = "";
  let selectedPhaseMs = "";
  let selectedC1Init = "";
  let selectedC2Init = "";
  let selectedCriticalPathThroughCnnMs = "";
  const feasibleRowsForPair: FeasibleRow[] = [];

  for (const phaseMs of phaseCandidates) {
    const candidate = cloneModel(pairModel);
    const candidateActorMaybe = candidate.actors.find((entry) => entry.id === config.actorId);
    if (!candidateActorMaybe) {
      throw new Error(`Actor not found in phase candidate: ${config.actorId}`);
    }
    const candidateActor = candidateActorMaybe;

    candidateActor.phase = rationalToString(phaseMs);

    const tunedInits = retuneInitsForCandidate(
      candidate,
      config.inChannelId,
      config.outChannelId,
      ctx.actorIndex,
      config.initSlackQuanta
    );

    const c1ChannelMaybe = candidate.channels.find(
      (entry) => entry.id === config.inChannelId
    );
    const c2ChannelMaybe = candidate.channels.find(
      (entry) => entry.id === config.outChannelId
    );
    if (!c1ChannelMaybe || !c2ChannelMaybe) {
      throw new Error("Candidate channels missing during init-search.");
    }
    const c1Channel = c1ChannelMaybe;
    const c2Channel = c2ChannelMaybe;

    const c1Quantum = channelInitQuantum(c1Channel);
    const c2Quantum = channelInitQuantum(c2Channel);
    const c1InitCandidates = buildInitCandidates(
      tunedInits.c1Init,
      ctx.baseC1Init,
      c1Quantum,
      0
    );
    const c2InitCandidates = buildInitCandidates(
      tunedInits.c2Init,
      ctx.baseC2Init,
      c2Quantum,
      config.maxC2InitExtraQuanta
    );

    let phaseAccepted = false;

    for (const c1Init of c1InitCandidates) {
      for (const c2Init of c2InitCandidates) {
        c1Channel.init = rationalToString(c1Init);
        c2Channel.init = rationalToString(c2Init);

        const result = verify(candidate, {
          computeExecution: true,
          cycles: 1,
          captureDetailedTrace: false,
        });

        if (isSchedulable(result, config.criterion)) {
          foundAny = true;
          phaseAccepted = true;
          const tickCount = result.artifacts?.hyperperiod?.tickCount;
          const worstPath = result.artifacts?.worstCasePath?.duration;
          const criticalPathThroughCnnMs = computeCriticalPathThroughActorMs(
            candidate,
            result,
            config.actorId
          );

          const row: FeasibleRow = {
            freqHz: freq.toString(),
            wcetMs: rationalToString(wcetRational),
            phaseMs: rationalToString(phaseMs),
            c1RateDst: rationalToString(tunedRates.c1RateDst),
            c1Init: rationalToString(c1Init),
            c2RateSrc: rationalToString(tunedRates.c2RateSrc),
            c2Init: rationalToString(c2Init),
            tickCount: tickCount !== undefined ? tickCount.toString() : "",
            worstCasePathMs: worstPath ?? "",
            criticalPathThroughCnnMs,
          };

          feasibleRowsForPair.push(row);

          if (selectedPhaseMs.length === 0) {
            selectedPhaseMs = row.phaseMs;
            selectedC1Init = row.c1Init;
            selectedC2Init = row.c2Init;
            selectedCriticalPathThroughCnnMs = row.criticalPathThroughCnnMs;
          }

          break;
        }

        if (firstErrorId.length === 0) {
          const firstError = result.diagnostics.find(
            (diag) => diag.severity === "error"
          )?.id;
          firstErrorId =
            firstError ??
            (config.criterion === "strict-ok" ? "NOT_STRICT_OK" : "UNKNOWN");
        }
      }

      if (phaseAccepted) break;
    }

    if (phaseAccepted && config.phaseMode === "first") break;
  }

  return {
    feasible: foundAny,
    freq,
    wcet,
    wcetRational,
    selectedPhaseMs,
    selectedC1Init,
    selectedC2Init,
    selectedCriticalPathThroughCnnMs,
    c1RateDstText: rationalToString(tunedRates.c1RateDst),
    c2RateSrcText: rationalToString(tunedRates.c2RateSrc),
    firstErrorId,
    feasibleRowsForPair,
  };
};

const aggregateXyz = (feasibleRows: FeasibleRow[]): XyzRow[] => {
  const best = new Map<string, XyzRow>();
  for (const row of feasibleRows) {
    const key = `${row.freqHz}\0${row.wcetMs}`;
    const existing = best.get(key);
    if (!existing) {
      best.set(key, {
        freqHz: row.freqHz,
        wcetMs: row.wcetMs,
        criticalPathThroughCnnMs: row.criticalPathThroughCnnMs,
      });
      continue;
    }
    const a = parseRationalSafe(existing.criticalPathThroughCnnMs);
    const b = parseRationalSafe(row.criticalPathThroughCnnMs);
    if (a && b && compare(b, a) > 0) {
      existing.criticalPathThroughCnnMs = row.criticalPathThroughCnnMs;
    } else if (!a && b) {
      existing.criticalPathThroughCnnMs = row.criticalPathThroughCnnMs;
    }
  }
  return [...best.values()].sort((l, r) => {
    const fl = Number(l.freqHz);
    const fr = Number(r.freqHz);
    if (fl !== fr) return fl - fr;
    return Number(l.wcetMs) - Number(r.wcetMs);
  });
};

const bisectFrontier = (
  config: SweepConfig,
  ctx: PairEvalContext,
  isFeasibleAt: (value: number) => PairEvalResult,
  loInclusive: number,
  hiExclusive: number
): { iters: number; lastFeasible: PairEvalResult | null; firstInfeasible: PairEvalResult | null } => {
  let lo = loInclusive;
  let hi = hiExclusive;
  let lastFeasible: PairEvalResult | null = null;
  let firstInfeasible: PairEvalResult | null = null;
  let iters = 0;

  const loEval = isFeasibleAt(lo);
  if (!loEval.feasible) {
    return { iters: 1, lastFeasible: null, firstInfeasible: loEval };
  }
  lastFeasible = loEval;

  const hiEval = isFeasibleAt(hi);
  iters = 2;
  if (hiEval.feasible) {
    return { iters, lastFeasible: hiEval, firstInfeasible: null };
  }
  firstInfeasible = hiEval;

  while (hi - lo > config.frontierTolerance && iters < config.frontierMaxIters) {
    const mid = (lo + hi) / 2;
    const midEval = isFeasibleAt(mid);
    iters += 1;
    if (midEval.feasible) {
      lo = mid;
      lastFeasible = midEval;
    } else {
      hi = mid;
      firstInfeasible = midEval;
    }
  }

  // suppress unused parameter warning when ctx is not directly needed in this scope
  void ctx;
  return { iters, lastFeasible, firstInfeasible };
};

type WorkerInit = {
  config: SweepConfig;
  baseModelJson: string;
};

type WorkerTask =
  | { kind: "grid-row"; taskId: number; freq: number; wcetGrid: number[] }
  | {
      kind: "frontier-anchor";
      taskId: number;
      anchor: number;
      sweptLo: number;
      sweptHi: number;
    };

type WorkerReply =
  | {
      kind: "grid-row-result";
      taskId: number;
      freq: number;
      gridRows: GridRow[];
      feasibleRows: FeasibleRow[];
      skipped: number;
    }
  | {
      kind: "frontier-anchor-result";
      taskId: number;
      anchor: number;
      frontierRow: FrontierRow;
      feasibleRows: FeasibleRow[];
    };

const buildCtxFromBaseModel = (
  config: SweepConfig,
  baseModel: PolyGraphModel
): PairEvalContext => {
  const baseActor = baseModel.actors.find((entry) => entry.id === config.actorId);
  const baseInChannel = baseModel.channels.find((entry) => entry.id === config.inChannelId);
  const baseOutChannel = baseModel.channels.find((entry) => entry.id === config.outChannelId);
  if (!baseActor) throw new Error(`Actor not found: ${config.actorId}`);
  if (!baseInChannel) throw new Error(`Incoming channel not found: ${config.inChannelId}`);
  if (!baseOutChannel) throw new Error(`Outgoing channel not found: ${config.outChannelId}`);

  const constants: ChannelRetuneConstants = {
    inRateSrcBase: parsePositiveRateMagnitude(baseInChannel.rateSrc, `${baseInChannel.id}.rateSrc`),
    outRateDstBase: parsePositiveRateMagnitude(baseOutChannel.rateDst, `${baseOutChannel.id}.rateDst`),
    inSrcActorId: baseInChannel.src,
    outDstActorId: baseOutChannel.dst,
  };
  const actorIndex = new Map(baseModel.actors.map((actor, idx) => [actor.id, idx]));
  return {
    baseModel,
    baseActor,
    baseInChannel,
    baseOutChannel,
    basePhaseMs: parseDurationMs(baseActor.phase),
    baseC1Init: parseDurationMs(baseInChannel.init),
    baseC2Init: parseDurationMs(baseOutChannel.init),
    constants,
    actorIndex,
  };
};

const processGridRow = (
  config: SweepConfig,
  ctx: PairEvalContext,
  freq: number,
  sortedWcet: number[]
): { gridRows: GridRow[]; feasibleRows: FeasibleRow[]; skipped: number } => {
  const gridRows: GridRow[] = [];
  const feasibleRows: FeasibleRow[] = [];
  let skipped = 0;
  let lockedInfeasible = false;
  let infeasibleCarry: { firstErrorId: string; c1RateDstText: string; c2RateSrcText: string } | null = null;

  for (const wcet of sortedWcet) {
    if (lockedInfeasible && config.monotonicEarlyExit) {
      const wcetRational = parseNumberToRational(wcet);
      if (wcetRational === null) throw new Error(`Cannot parse WCET value: ${wcet}`);
      gridRows.push({
        freqHz: freq.toString(),
        wcetMs: rationalToString(wcetRational),
        feasible: "no",
        selectedPhaseMs: "",
        c1RateDst: infeasibleCarry?.c1RateDstText ?? "",
        c1Init: "",
        c2RateSrc: infeasibleCarry?.c2RateSrcText ?? "",
        c2Init: "",
        selectedCriticalPathThroughCnnMs: "",
        firstErrorId: infeasibleCarry?.firstErrorId
          ? `${infeasibleCarry.firstErrorId} (skipped: WCET monotonicity)`
          : "SKIPPED_MONOTONIC",
      });
      skipped += 1;
      continue;
    }

    const result = evaluatePair(config, ctx, freq, wcet);
    if (result.feasible) {
      for (const row of result.feasibleRowsForPair) feasibleRows.push(row);
    } else if (config.monotonicEarlyExit) {
      lockedInfeasible = true;
      infeasibleCarry = {
        firstErrorId: result.firstErrorId,
        c1RateDstText: result.c1RateDstText,
        c2RateSrcText: result.c2RateSrcText,
      };
    }

    gridRows.push({
      freqHz: freq.toString(),
      wcetMs: rationalToString(result.wcetRational),
      feasible: result.feasible ? "yes" : "no",
      selectedPhaseMs: result.selectedPhaseMs,
      c1RateDst: result.c1RateDstText,
      c1Init: result.selectedC1Init,
      c2RateSrc: result.c2RateSrcText,
      c2Init: result.selectedC2Init,
      selectedCriticalPathThroughCnnMs: result.selectedCriticalPathThroughCnnMs,
      firstErrorId: result.feasible ? "" : result.firstErrorId,
    });
  }

  return { gridRows, feasibleRows, skipped };
};

const processFrontierAnchor = (
  config: SweepConfig,
  ctx: PairEvalContext,
  anchor: number,
  sweptLo: number,
  sweptHi: number
): { frontierRow: FrontierRow; feasibleRows: FeasibleRow[] } => {
  const feasibleRows: FeasibleRow[] = [];
  const anchorIsFreq = config.frontierAxis === "wcet-vs-freq";
  const anchorAxisLabel = anchorIsFreq ? "freqHz" : "wcetMs";

  const isFeasibleAt = (value: number): PairEvalResult => {
    const freq = anchorIsFreq ? anchor : value;
    const wcet = anchorIsFreq ? value : anchor;
    const result = evaluatePair(config, ctx, freq, wcet);
    if (result.feasible) {
      for (const row of result.feasibleRowsForPair) feasibleRows.push(row);
    }
    return result;
  };

  const { iters, lastFeasible, firstInfeasible } = bisectFrontier(
    config,
    ctx,
    isFeasibleAt,
    sweptLo,
    sweptHi
  );

  const anchorValue = anchorIsFreq
    ? anchor.toString()
    : (() => {
        const r = parseNumberToRational(anchor);
        if (r === null) throw new Error(`Bad anchor value ${anchor}`);
        return rationalToString(r);
      })();

  const status = lastFeasible
    ? firstInfeasible
      ? "frontier-found"
      : "all-feasible-up-to-hi"
    : "all-infeasible";

  const frontierRow: FrontierRow = {
    anchorAxis: anchorAxisLabel,
    anchorValue,
    maxFeasibleValue: lastFeasible
      ? anchorIsFreq
        ? rationalToString(lastFeasible.wcetRational)
        : lastFeasible.freq.toString()
      : "",
    minInfeasibleValue: firstInfeasible
      ? anchorIsFreq
        ? rationalToString(firstInfeasible.wcetRational)
        : firstInfeasible.freq.toString()
      : "",
    iterations: iters.toString(),
    selectedPhaseMs: lastFeasible?.selectedPhaseMs ?? "",
    c1RateDst: lastFeasible?.c1RateDstText ?? "",
    c1Init: lastFeasible?.selectedC1Init ?? "",
    c2RateSrc: lastFeasible?.c2RateSrcText ?? "",
    c2Init: lastFeasible?.selectedC2Init ?? "",
    selectedCriticalPathThroughCnnMs:
      lastFeasible?.selectedCriticalPathThroughCnnMs ?? "",
    status,
  };

  return { frontierRow, feasibleRows };
};

const runWorker = () => {
  const init = workerData as WorkerInit;
  const baseModel = JSON.parse(init.baseModelJson) as PolyGraphModel;
  const ctx = buildCtxFromBaseModel(init.config, baseModel);

  if (!parentPort) throw new Error("Worker has no parent port.");

  parentPort.on("message", (task: WorkerTask | { kind: "shutdown" }) => {
    if (task.kind === "shutdown") {
      process.exit(0);
    }

    if (task.kind === "grid-row") {
      const sortedWcet = [...task.wcetGrid].sort((a, b) => a - b);
      const out = processGridRow(init.config, ctx, task.freq, sortedWcet);
      const reply: WorkerReply = {
        kind: "grid-row-result",
        taskId: task.taskId,
        freq: task.freq,
        gridRows: out.gridRows,
        feasibleRows: out.feasibleRows,
        skipped: out.skipped,
      };
      parentPort!.postMessage(reply);
      return;
    }

    if (task.kind === "frontier-anchor") {
      const out = processFrontierAnchor(
        init.config,
        ctx,
        task.anchor,
        task.sweptLo,
        task.sweptHi
      );
      const reply: WorkerReply = {
        kind: "frontier-anchor-result",
        taskId: task.taskId,
        anchor: task.anchor,
        frontierRow: out.frontierRow,
        feasibleRows: out.feasibleRows,
      };
      parentPort!.postMessage(reply);
    }
  });
};

const dispatchPool = async <T extends WorkerTask, R extends WorkerReply>(
  config: SweepConfig,
  baseModelJson: string,
  tasks: T[],
  onReply: (reply: R) => void
): Promise<void> => {
  const workerCount = Math.min(config.workers, Math.max(1, tasks.length));
  if (workerCount <= 1) {
    // Inline fallback (no worker overhead).
    const baseModel = JSON.parse(baseModelJson) as PolyGraphModel;
    const ctx = buildCtxFromBaseModel(config, baseModel);
    let done = 0;
    for (const task of tasks) {
      if (task.kind === "grid-row") {
        const sorted = [...task.wcetGrid].sort((a, b) => a - b);
        const out = processGridRow(config, ctx, task.freq, sorted);
        onReply({
          kind: "grid-row-result",
          taskId: task.taskId,
          freq: task.freq,
          gridRows: out.gridRows,
          feasibleRows: out.feasibleRows,
          skipped: out.skipped,
        } as R);
      } else {
        const out = processFrontierAnchor(
          config,
          ctx,
          task.anchor,
          task.sweptLo,
          task.sweptHi
        );
        onReply({
          kind: "frontier-anchor-result",
          taskId: task.taskId,
          anchor: task.anchor,
          frontierRow: out.frontierRow,
          feasibleRows: out.feasibleRows,
        } as R);
      }
      done += 1;
      if (done % 5 === 0 || done === tasks.length) {
        // eslint-disable-next-line no-console
        console.log(`Progress: ${done}/${tasks.length} tasks (single-thread).`);
      }
    }
    return;
  }

  const init: WorkerInit = { config, baseModelJson };
  const queue = [...tasks];
  let inflight = 0;
  let completed = 0;

  return new Promise<void>((resolve, reject) => {
    const workers: Worker[] = [];
    let settled = false;

    const finishOne = () => {
      completed += 1;
      if (completed % 5 === 0 || completed === tasks.length) {
        // eslint-disable-next-line no-console
        console.log(
          `Progress: ${completed}/${tasks.length} tasks (${workerCount} workers).`
        );
      }
    };

    const teardown = (err?: unknown) => {
      if (settled) return;
      settled = true;
      for (const w of workers) {
        try {
          w.postMessage({ kind: "shutdown" });
        } catch {
          // ignore
        }
        w.terminate().catch(() => undefined);
      }
      if (err) reject(err);
      else resolve();
    };

    const assignNext = (worker: Worker) => {
      const next = queue.shift();
      if (!next) {
        if (inflight === 0) teardown();
        return;
      }
      inflight += 1;
      worker.postMessage(next);
    };

    for (let i = 0; i < workerCount; i += 1) {
      const bootstrapPath = path.resolve(
        __dirname,
        "sweep-cnn-worker-bootstrap.mjs"
      );
      const w = new Worker(bootstrapPath, { workerData: init });
      workers.push(w);
      w.on("message", (reply: WorkerReply) => {
        inflight -= 1;
        try {
          onReply(reply as R);
        } catch (err) {
          teardown(err);
          return;
        }
        finishOne();
        assignNext(w);
      });
      w.on("error", (err) => teardown(err));
      w.on("exit", (code) => {
        if (code !== 0 && !settled) {
          teardown(new Error(`Worker exited with code ${code}`));
        }
      });
      assignNext(w);
    }
  });
};

const runGridSweepParallel = async (
  config: SweepConfig,
  baseModelJson: string,
  freqGrid: number[],
  wcetGrid: number[]
) => {
  const tasks: WorkerTask[] = freqGrid.map((freq, idx) => ({
    kind: "grid-row" as const,
    taskId: idx,
    freq,
    wcetGrid,
  }));
  const totalPairs = freqGrid.length * wcetGrid.length;
  const gridRowsByTask = new Map<number, GridRow[]>();
  const feasibleRows: FeasibleRow[] = [];
  let skipped = 0;

  // eslint-disable-next-line no-console
  console.log(
    `Grid sweep: ${freqGrid.length} freqs x ${wcetGrid.length} WCETs = ${totalPairs} pairs, ` +
      `${config.workers} workers, monotonic-early-exit=${config.monotonicEarlyExit}.`
  );

  await dispatchPool(config, baseModelJson, tasks, (reply) => {
    if (reply.kind !== "grid-row-result") return;
    gridRowsByTask.set(reply.taskId, reply.gridRows);
    for (const row of reply.feasibleRows) feasibleRows.push(row);
    skipped += reply.skipped;
  });

  const gridRows: GridRow[] = [];
  for (let i = 0; i < tasks.length; i += 1) {
    const rows = gridRowsByTask.get(i) ?? [];
    for (const row of rows) gridRows.push(row);
  }
  return { feasibleRows, gridRows, totalPairs, skipped };
};

const runFrontierSweepParallel = async (
  config: SweepConfig,
  baseModelJson: string,
  freqGrid: number[],
  wcetGrid: number[]
) => {
  const anchors = config.frontierAxis === "wcet-vs-freq" ? freqGrid : wcetGrid;
  const sweptLo =
    config.frontierAxis === "wcet-vs-freq" ? config.wcetMin : config.freqMin;
  const sweptHi =
    config.frontierAxis === "wcet-vs-freq" ? config.wcetMax : config.freqMax;

  const tasks: WorkerTask[] = anchors.map((anchor, idx) => ({
    kind: "frontier-anchor" as const,
    taskId: idx,
    anchor,
    sweptLo,
    sweptHi,
  }));

  // eslint-disable-next-line no-console
  console.log(
    `Frontier sweep (${config.frontierAxis}): ${anchors.length} anchors, ` +
      `swept axis [${sweptLo}, ${sweptHi}], tolerance=${config.frontierTolerance}, ` +
      `${config.workers} workers.`
  );

  const frontierByTask = new Map<number, FrontierRow>();
  const feasibleRows: FeasibleRow[] = [];

  await dispatchPool(config, baseModelJson, tasks, (reply) => {
    if (reply.kind !== "frontier-anchor-result") return;
    frontierByTask.set(reply.taskId, reply.frontierRow);
    for (const row of reply.feasibleRows) feasibleRows.push(row);
  });

  const frontierRows: FrontierRow[] = [];
  for (let i = 0; i < tasks.length; i += 1) {
    const row = frontierByTask.get(i);
    if (row) frontierRows.push(row);
  }

  return { feasibleRows, frontierRows };
};

const run = async () => {
  const config = parseArgs(process.argv.slice(2));

  if (config.maxPhaseCandidates <= 0) {
    fail("--max-phase-candidates must be > 0.");
  }
  if (config.initSlackQuanta < 0) {
    fail("--init-slack-quanta must be >= 0.");
  }
  if (config.maxC2InitExtraQuanta < 0) {
    fail("--max-c2-init-extra-quanta must be >= 0.");
  }

  const freqGrid = buildGrid(config.freqMin, config.freqMax, config.freqStep);
  const wcetGrid = buildGrid(config.wcetMin, config.wcetMax, config.wcetStep);

  const modelPath = path.resolve(process.cwd(), config.modelPath);
  const outDir = path.resolve(process.cwd(), config.outDir);

  const baseModel = JSON.parse(readFileSync(modelPath, "utf8")) as PolyGraphModel;
  const baseActorMaybe = baseModel.actors.find((entry) => entry.id === config.actorId);
  const baseInChannelMaybe = baseModel.channels.find((entry) => entry.id === config.inChannelId);
  const baseOutChannelMaybe = baseModel.channels.find((entry) => entry.id === config.outChannelId);

  if (!baseActorMaybe) {
    throw new Error(`Actor not found: ${config.actorId}`);
  }
  if (!baseInChannelMaybe) {
    throw new Error(`Incoming channel not found: ${config.inChannelId}`);
  }
  if (!baseOutChannelMaybe) {
    throw new Error(`Outgoing channel not found: ${config.outChannelId}`);
  }

  const baseActor = baseActorMaybe;
  const baseInChannel = baseInChannelMaybe;
  const baseOutChannel = baseOutChannelMaybe;

  if (baseInChannel.dst !== config.actorId) {
    fail(`Incoming channel ${config.inChannelId} must target ${config.actorId}.`);
  }
  if (baseOutChannel.src !== config.actorId) {
    fail(`Outgoing channel ${config.outChannelId} must originate from ${config.actorId}.`);
  }

  const constants: ChannelRetuneConstants = {
    inRateSrcBase: parsePositiveRateMagnitude(baseInChannel.rateSrc, `${baseInChannel.id}.rateSrc`),
    outRateDstBase: parsePositiveRateMagnitude(baseOutChannel.rateDst, `${baseOutChannel.id}.rateDst`),
    inSrcActorId: baseInChannel.src,
    outDstActorId: baseOutChannel.dst,
  };

  const actorIndex = new Map(baseModel.actors.map((actor, idx) => [actor.id, idx]));
  const ctx: PairEvalContext = {
    baseModel,
    baseActor,
    baseInChannel,
    baseOutChannel,
    basePhaseMs: parseDurationMs(baseActor.phase),
    baseC1Init: parseDurationMs(baseInChannel.init),
    baseC2Init: parseDurationMs(baseOutChannel.init),
    constants,
    actorIndex,
  };

  let feasibleRows: FeasibleRow[] = [];
  let gridRows: GridRow[] = [];
  let frontierRows: FrontierRow[] = [];
  let totalPairs = 0;
  let skipped = 0;

  void ctx;
  const baseModelJson = JSON.stringify(baseModel);

  if (config.sweepMode === "grid") {
    const out = await runGridSweepParallel(config, baseModelJson, freqGrid, wcetGrid);
    feasibleRows = out.feasibleRows;
    gridRows = out.gridRows;
    totalPairs = out.totalPairs;
    skipped = out.skipped;
  } else {
    const out = await runFrontierSweepParallel(
      config,
      baseModelJson,
      freqGrid,
      wcetGrid
    );
    feasibleRows = out.feasibleRows;
    frontierRows = out.frontierRows;
  }

  const xyzRows = aggregateXyz(feasibleRows);

  mkdirSync(outDir, { recursive: true });

  const feasibleCsv = toCsv(feasibleRows, [
    "freqHz",
    "wcetMs",
    "phaseMs",
    "c1RateDst",
    "c1Init",
    "c2RateSrc",
    "c2Init",
    "tickCount",
    "worstCasePathMs",
    "criticalPathThroughCnnMs",
  ]);

  const gridCsv = toCsv(gridRows, [
    "freqHz",
    "wcetMs",
    "feasible",
    "selectedPhaseMs",
    "c1RateDst",
    "c1Init",
    "c2RateSrc",
    "c2Init",
    "selectedCriticalPathThroughCnnMs",
    "firstErrorId",
  ]);

  const xyzCsv = toCsv(xyzRows, [
    "freqHz",
    "wcetMs",
    "criticalPathThroughCnnMs",
  ]);

  const frontierCsv = toCsv(frontierRows, [
    "anchorAxis",
    "anchorValue",
    "maxFeasibleValue",
    "minInfeasibleValue",
    "iterations",
    "selectedPhaseMs",
    "c1RateDst",
    "c1Init",
    "c2RateSrc",
    "c2Init",
    "selectedCriticalPathThroughCnnMs",
    "status",
  ]);

  const feasiblePairs = gridRows.filter((row) => row.feasible === "yes").length;

  const summary = {
    inputModel: path.relative(process.cwd(), modelPath),
    actorId: config.actorId,
    inChannelId: config.inChannelId,
    outChannelId: config.outChannelId,
    frozenActorCount: baseModel.actors.length - 1,
    sweepMode: config.sweepMode,
    search: {
      freqMin: config.freqMin,
      freqMax: config.freqMax,
      freqStep: config.freqStep,
      wcetMin: config.wcetMin,
      wcetMax: config.wcetMax,
      wcetStep: config.wcetStep,
      phaseStepMs: config.phaseStepMsText,
      maxPhaseCandidates: config.maxPhaseCandidates,
      phaseMode: config.phaseMode,
      initSlackQuanta: config.initSlackQuanta,
      maxC2InitExtraQuanta: config.maxC2InitExtraQuanta,
      criterion: config.criterion,
      monotonicEarlyExit: config.monotonicEarlyExit,
      frontierAxis: config.frontierAxis,
      frontierTolerance: config.frontierTolerance,
      frontierMaxIters: config.frontierMaxIters,
    },
    totals:
      config.sweepMode === "grid"
        ? {
            testedPairs: totalPairs,
            feasiblePairs,
            infeasiblePairs: totalPairs - feasiblePairs,
            skippedByMonotonicity: skipped,
            feasiblePhaseRows: feasibleRows.length,
            xyzPoints: xyzRows.length,
          }
        : {
            anchors: frontierRows.length,
            anchorsWithFrontier: frontierRows.filter(
              (row) => row.status === "frontier-found"
            ).length,
            anchorsAllFeasible: frontierRows.filter(
              (row) => row.status === "all-feasible-up-to-hi"
            ).length,
            anchorsAllInfeasible: frontierRows.filter(
              (row) => row.status === "all-infeasible"
            ).length,
            feasiblePhaseRows: feasibleRows.length,
            xyzPoints: xyzRows.length,
          },
    outputs: {
      feasibleCsv: path.join(config.outDir, "cnn-only-feasible.csv"),
      gridCsv: path.join(config.outDir, "cnn-only-grid.csv"),
      xyzCsv: path.join(config.outDir, "cnn-only-xyz-critical-path-cnn.csv"),
      frontierCsv: path.join(config.outDir, "cnn-only-frontier.csv"),
      summaryJson: path.join(config.outDir, "cnn-only-summary.json"),
    },
  };

  writeFileSync(path.join(outDir, "cnn-only-feasible.csv"), feasibleCsv, "utf8");
  writeFileSync(path.join(outDir, "cnn-only-grid.csv"), gridCsv, "utf8");
  writeFileSync(
    path.join(outDir, "cnn-only-xyz-critical-path-cnn.csv"),
    xyzCsv,
    "utf8"
  );
  writeFileSync(path.join(outDir, "cnn-only-frontier.csv"), frontierCsv, "utf8");
  writeFileSync(
    path.join(outDir, "cnn-only-summary.json"),
    JSON.stringify(summary, null, 2),
    "utf8"
  );

  // eslint-disable-next-line no-console
  console.log("Sweep completed.");
  if (config.sweepMode === "grid") {
    // eslint-disable-next-line no-console
    console.log(
      `Feasible pairs: ${feasiblePairs}/${totalPairs} (skipped by monotonicity: ${skipped}).`
    );
  } else {
    // eslint-disable-next-line no-console
    console.log(
      `Frontier anchors: ${frontierRows.length} (with frontier: ` +
        `${frontierRows.filter((r) => r.status === "frontier-found").length}).`
    );
  }
  // eslint-disable-next-line no-console
  console.log(`Output: ${summary.outputs.feasibleCsv}`);
  // eslint-disable-next-line no-console
  console.log(`Output: ${summary.outputs.gridCsv}`);
  // eslint-disable-next-line no-console
  console.log(`Output: ${summary.outputs.xyzCsv}`);
  // eslint-disable-next-line no-console
  console.log(`Output: ${summary.outputs.frontierCsv}`);
  // eslint-disable-next-line no-console
  console.log(`Output: ${summary.outputs.summaryJson}`);
};

if (isMainThread) {
  run().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
} else {
  runWorker();
}
