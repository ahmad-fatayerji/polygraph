import { checkConsistency } from "./consistency";
import type { Diagnostic, PolyGraphModel } from "./types";
import { buildTopology } from "./topology";
import type { Rational } from "./rational";
import {
  add,
  compare,
  div,
  fromBigint,
  modRational,
  mul,
  parseNumberToRational,
  parseRational,
  rationalZero,
  toString as rationalToString,
} from "./rational";
import { verify } from "./verify";

const PHASE_GRID_LADDER_MS = [
  "10",
  "5",
  "2",
  "1",
  "1/2",
  "1/5",
  "1/10",
  "1/20",
  "1/100",
  "1/1000",
];
const MAX_PHASE_ADJUSTMENTS_PER_GRID = 2000;

type AutoDephaseSuccess = {
  ok: true;
  model: PolyGraphModel;
  diagnostics: Diagnostic[];
  tickCount: number | null;
  baseTick: string | null;
  phaseQuantum: string | null;
};

type AutoDephaseFailure = {
  ok: false;
  model: PolyGraphModel;
  diagnostics: Diagnostic[];
};

export type AutoDephaseResult = AutoDephaseSuccess | AutoDephaseFailure;

const cloneModel = (model: PolyGraphModel): PolyGraphModel =>
  JSON.parse(JSON.stringify(model)) as PolyGraphModel;

const parseDurationField = (value: string | number | undefined): Rational => {
  if (value === undefined || value === null || value === "") {
    return { ...rationalZero };
  }

  if (typeof value === "number") {
    return parseNumberToRational(value) ?? { ...rationalZero };
  }

  const parsed = parseRational(String(value));
  return parsed.ok ? parsed.value : { ...rationalZero };
};

const parsePhaseField = (value: string | number | undefined): Rational => {
  if (value === undefined || value === null || value === "") {
    return { ...rationalZero };
  }

  if (typeof value === "number") {
    return parseNumberToRational(value) ?? { ...rationalZero };
  }

  const parsed = parseRational(String(value));
  return parsed.ok ? parsed.value : { ...rationalZero };
};

const periodMsFromActor = (actor: PolyGraphModel["actors"][number]): Rational | null => {
  if (actor.period !== undefined && Number.isFinite(actor.period) && actor.period > 0) {
    return parseNumberToRational(actor.period) ?? null;
  }

  if (actor.freq !== undefined && Number.isFinite(actor.freq) && actor.freq > 0) {
    const freq = parseNumberToRational(actor.freq);
    if (!freq || compare(freq, rationalZero) <= 0) return null;
    return div({ n: 1000n, d: 1n }, freq);
  }

  return null;
};

const ceilToQuantum = (value: Rational, quantum: Rational): Rational => {
  if (compare(quantum, rationalZero) <= 0) return value;
  const scaledNumerator = value.n * quantum.d;
  const scaledDenominator = value.d * quantum.n;
  const k =
    scaledNumerator <= 0n
      ? 0n
      : (scaledNumerator + scaledDenominator - 1n) / scaledDenominator;
  return mul(fromBigint(k), quantum);
};

const buildActorOrder = (model: PolyGraphModel) => {
  const adjacency = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();
  const incoming = new Map<string, string[]>();

  model.actors.forEach((actor) => {
    adjacency.set(actor.id, new Set<string>());
    indegree.set(actor.id, 0);
    incoming.set(actor.id, []);
  });

  model.channels.forEach((channel) => {
    if (channel.src === channel.dst) return;
    if (!adjacency.has(channel.src) || !adjacency.has(channel.dst)) return;
    if (adjacency.get(channel.src)?.has(channel.dst)) return;
    adjacency.get(channel.src)?.add(channel.dst);
    indegree.set(channel.dst, (indegree.get(channel.dst) ?? 0) + 1);
    incoming.get(channel.dst)?.push(channel.src);
  });

  const queue = model.actors
    .filter((actor) => (indegree.get(actor.id) ?? 0) === 0)
    .map((actor) => actor.id);
  const order: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);
    const nextActors = adjacency.get(current) ?? new Set<string>();
    nextActors.forEach((nextId) => {
      const nextDegree = (indegree.get(nextId) ?? 0) - 1;
      indegree.set(nextId, nextDegree);
      if (nextDegree === 0) queue.push(nextId);
    });
  }

  if (order.length !== model.actors.length) {
    return {
      order: model.actors.map((actor) => actor.id),
      incoming,
    };
  }

  return { order, incoming };
};

const synthesizeSeedModel = (model: PolyGraphModel): PolyGraphModel => {
  const nextModel = cloneModel(model);
  const actorById = new Map(nextModel.actors.map((actor) => [actor.id, actor]));
  const { order, incoming } = buildActorOrder(nextModel);
  const synthesizedPhases = new Map<string, Rational>();

  order.forEach((actorId) => {
    const actor = actorById.get(actorId);
    if (!actor?.timed) return;

    const explicitPhase = parsePhaseField(actor.phase);
    if (compare(explicitPhase, rationalZero) > 0) {
      synthesizedPhases.set(actorId, explicitPhase);
      return;
    }

    let nextPhase = { ...rationalZero };
    for (const predecessorId of incoming.get(actorId) ?? []) {
      const predecessor = actorById.get(predecessorId);
      if (!predecessor) continue;
      const predecessorPhase =
        synthesizedPhases.get(predecessorId) ?? parsePhaseField(predecessor.phase);
      const predecessorBudget = parseDurationField(
        predecessor.executionTime ?? predecessor.bcet
      );
      const candidate = add(predecessorPhase, predecessorBudget);
      if (compare(candidate, nextPhase) > 0) {
        nextPhase = candidate;
      }
    }

    const period = periodMsFromActor(actor);
    if (period && compare(period, rationalZero) > 0) {
      nextPhase = modRational(nextPhase, period);
    }

    synthesizedPhases.set(actorId, nextPhase);
    actor.phase = rationalToString(nextPhase);
  });

  return nextModel;
};

const quantizeModelPhases = (
  model: PolyGraphModel,
  phaseQuantumMs: string
): PolyGraphModel => {
  const quantumParsed = parseRational(phaseQuantumMs);
  if (!quantumParsed.ok) return cloneModel(model);

  const nextModel = cloneModel(model);
  nextModel.actors = nextModel.actors.map((actor) => {
    if (!actor.timed) return actor;

    const period = periodMsFromActor(actor);
    const quantized = ceilToQuantum(parsePhaseField(actor.phase), quantumParsed.value);
    const canonicalPhase =
      period && compare(period, rationalZero) > 0
        ? modRational(quantized, period)
        : quantized;

    return {
      ...actor,
      phase: rationalToString(canonicalPhase),
    };
  });

  return nextModel;
};

const nextAdjustableActorId = (
  model: PolyGraphModel,
  diagnostics: Diagnostic[],
  quantum: Rational
) => {
  const actorById = new Map(model.actors.map((actor) => [actor.id, actor]));

  for (const diagnostic of diagnostics) {
    if (diagnostic.severity !== "error") continue;
    const actorId = diagnostic.where?.actorId;
    if (!actorId) continue;
    const actor = actorById.get(actorId);
    if (!actor?.timed) continue;
    const period = periodMsFromActor(actor);
    if (!period) continue;
    const currentPhase = parsePhaseField(actor.phase);
    if (compare(add(currentPhase, quantum), period) >= 0) continue;
    return actorId;
  }

  return null;
};

const searchFeasibleModelForQuantum = (
  model: PolyGraphModel,
  phaseQuantum: string
): PolyGraphModel | null => {
  const quantumParsed = parseRational(phaseQuantum);
  if (!quantumParsed.ok) return null;

  const candidate = quantizeModelPhases(synthesizeSeedModel(model), phaseQuantum);

  for (let iteration = 0; iteration < MAX_PHASE_ADJUSTMENTS_PER_GRID; iteration += 1) {
    const result = verify(candidate, {
      computeExecution: true,
      captureDetailedTrace: false,
    });
    if (result.ok) return candidate;

    const actorId = nextAdjustableActorId(
      candidate,
      result.diagnostics,
      quantumParsed.value
    );
    if (!actorId) return null;

    candidate.actors = candidate.actors.map((actor) => {
      if (actor.id !== actorId) return actor;
      return {
        ...actor,
        phase: rationalToString(add(parsePhaseField(actor.phase), quantumParsed.value)),
      };
    });
  }

  return null;
};

const extractTimingMetrics = (model: PolyGraphModel) => {
  const parsedChannels = model.channels.map((channel) => {
    const rateSrc = parseRational(channel.rateSrc);
    const rateDst = parseRational(channel.rateDst);
    return {
      rateSrc: rateSrc.ok ? rateSrc.value : { ...rationalZero },
      rateDst: rateDst.ok ? rateDst.value : { ...rationalZero },
    };
  });

  const topology = buildTopology(model, parsedChannels);
  const consistency = checkConsistency(model, topology);
  const timing = consistency.repetition?.timing;
  return {
    tickCount: timing?.tickCount ?? null,
    baseTick: timing ? rationalToString(timing.baseTick) : null,
  };
};

export const autoDephaseMinTicks = (model: PolyGraphModel): AutoDephaseResult => {
  const baselineVerification = verify(model, {
    computeExecution: true,
    captureDetailedTrace: false,
  });
  const baselineMetrics = extractTimingMetrics(model);

  for (const phaseQuantum of PHASE_GRID_LADDER_MS) {
    const candidate = searchFeasibleModelForQuantum(model, phaseQuantum);
    if (!candidate) continue;

    const metrics = extractTimingMetrics(candidate);
    const improvement =
      baselineMetrics.tickCount !== null && metrics.tickCount !== null
        ? metrics.tickCount < baselineMetrics.tickCount
          ? `Tick count reduced from ${baselineMetrics.tickCount} to ${metrics.tickCount}.`
          : `Tick count remains ${metrics.tickCount}.`
        : "Tick count optimization succeeded.";

    return {
      ok: true,
      model: candidate,
      tickCount: metrics.tickCount,
      baseTick: metrics.baseTick,
      phaseQuantum,
      diagnostics: [
        {
          id: "I_CONSISTENT",
          severity: "info",
          message: `Automatic dephasing found a feasible ${phaseQuantum} ms phase grid. ${improvement}`,
          hint: "This is the best result found among the tested phase grids, from coarse to fine.",
        },
      ],
    };
  }

  return {
    ok: false,
    model,
    diagnostics: [
      {
        id: "E_TOPOLOGY_INVALID",
        severity: "warn",
        message:
          "Automatic dephasing could not find a feasible coarser phase grid for this model.",
        hint: "Keep the current phases or refine the model manually. The automatic search only checks a fixed set of phase grids.",
      },
    ],
  };
};
