import type { TimingInfo } from "./consistency";
import type {
  Diagnostic,
  ExecutionResult,
  PolyGraphModel,
  TimingAnalysisArtifact,
  WorstCasePathArtifact,
} from "./types";
import type { Rational } from "./rational";
import {
  add,
  compare,
  div,
  fromBigint,
  mul,
  parseNumberToRational,
  parseRational,
  rationalZero,
  sub,
  toString as rationalToString,
} from "./rational";

const MAX_PATHS = 2000;
const TOP_PATHS = 5;
const MAX_RELAX_ITERS = 10000;

type TimingComputationResult = {
  diagnostics: Diagnostic[];
  timingAnalysis?: TimingAnalysisArtifact;
  worstCasePath?: WorstCasePathArtifact;
};

type FiringNode = {
  key: string;
  actorId: string;
  firingIndex: number;
  al: Rational;
  au: Rational;
  pl: Rational;
  pu: Rational;
  rl: Rational;
  ru: Rational;
  es: Rational;
  ls: Rational;
  ef: Rational;
  lf: Rational;
  bcif: Rational;
  wcif: Rational;
  bcet: Rational;
  wcet: Rational;
  priority: number;
  processor: number;
};

type EdgeMap = Map<string, Set<string>>;

type ScheduleEntry = {
  tick: number;
  fires: string[];
};

type LegacyFiringOccurrence = {
  actorId: string;
  release: Rational;
  start: Rational;
  end: Rational;
  cycleIndex: number;
};

const zero = () => ({ ...rationalZero });

const maxRational = (left: Rational, right: Rational) =>
  compare(left, right) >= 0 ? left : right;

const parseDuration = (value: string | number | undefined, fallback: Rational): Rational => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "number") return parseNumberToRational(value) ?? fallback;
  const parsed = parseRational(String(value));
  return parsed.ok ? parsed.value : fallback;
};

const parseOptionalDuration = (value: string | number | undefined): Rational =>
  parseDuration(value, rationalZero);

const parseExecutionTimeLegacy = (value: string | number | undefined): Rational => {
  if (value === undefined || value === null || value === "") return rationalZero;
  if (typeof value === "number") return parseNumberToRational(value) ?? rationalZero;
  const parsed = parseRational(String(value));
  return parsed.ok ? parsed.value : rationalZero;
};

const msFromSeconds = (seconds: Rational): Rational =>
  mul(seconds, { n: 1000n, d: 1n });

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

const findProducerFiringIndex = (produced: Rational[], needed: Rational): number | null => {
  if (compare(needed, rationalZero) <= 0) return 0;
  let left = 1;
  let right = produced.length - 1;
  let found: number | null = null;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (compare(produced[mid], needed) >= 0) {
      found = mid;
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }

  return found;
};

const buildAdjacency = (model: PolyGraphModel) => {
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  model.actors.forEach((actor) => {
    adjacency.set(actor.id, []);
    inDegree.set(actor.id, 0);
  });

  const seenEdges = new Set<string>();
  model.channels.forEach((channel) => {
    if (channel.src === channel.dst) return;
    if (!adjacency.has(channel.src) || !adjacency.has(channel.dst)) return;
    const key = `${channel.src}\0${channel.dst}`;
    if (seenEdges.has(key)) return;
    seenEdges.add(key);
    adjacency.get(channel.src)?.push(channel.dst);
    inDegree.set(channel.dst, (inDegree.get(channel.dst) ?? 0) + 1);
  });

  return { adjacency, inDegree };
};

const enumeratePaths = (
  model: PolyGraphModel
): { paths: string[][]; truncated: boolean } => {
  const { adjacency, inDegree } = buildAdjacency(model);
  const actorIds = model.actors.map((actor) => actor.id);
  const starts = actorIds.filter((actorId) => (inDegree.get(actorId) ?? 0) === 0);
  const startNodes = starts.length > 0 ? starts : actorIds;
  const sinkSet = new Set(
    actorIds.filter((actorId) => (adjacency.get(actorId) ?? []).length === 0)
  );

  const paths: string[][] = [];
  let truncated = false;

  const dfs = (path: string[], visited: Set<string>) => {
    if (paths.length >= MAX_PATHS) {
      truncated = true;
      return;
    }

    const current = path[path.length - 1];
    const nextIds = (adjacency.get(current) ?? []).filter(
      (nextId) => !visited.has(nextId)
    );

    if (nextIds.length === 0 || sinkSet.has(current)) {
      if (path.length > 1) paths.push([...path]);
      return;
    }

    for (const nextId of nextIds) {
      visited.add(nextId);
      path.push(nextId);
      dfs(path, visited);
      path.pop();
      visited.delete(nextId);
      if (truncated) return;
    }
  };

  startNodes.forEach((startId) => {
    if (truncated) return;
    dfs([startId], new Set([startId]));
  });

  return { paths, truncated };
};

const parseCumulativeTrace = (values: string[] | undefined): Rational[] => {
  if (!values || values.length === 0) return [zero()];
  const parsed: Rational[] = [];
  for (const text of values) {
    const rat = parseRational(String(text));
    parsed.push(rat.ok ? rat.value : zero());
  }
  return parsed;
};

const buildLegacyOccurrences = (
  model: PolyGraphModel,
  schedule: ScheduleEntry[],
  baseTick: Rational
) => {
  const executionTimes = new Map(
    model.actors.map((actor) => [actor.id, parseExecutionTimeLegacy(actor.executionTime)])
  );
  const byActor = new Map<string, LegacyFiringOccurrence[]>();
  const totalTicks = schedule.length;

  let cpuAvailable = rationalZero;
  for (let cycleIndex = 0; cycleIndex < 2; cycleIndex += 1) {
    for (const entry of schedule) {
      const absoluteTick = cycleIndex * totalTicks + entry.tick;
      const release = mul(baseTick, fromBigint(BigInt(absoluteTick)));
      for (const actorId of entry.fires) {
        const start = maxRational(release, cpuAvailable);
        const executionTime = executionTimes.get(actorId) ?? rationalZero;
        const end = add(start, executionTime);
        const occurrence: LegacyFiringOccurrence = {
          actorId,
          release,
          start,
          end,
          cycleIndex,
        };
        if (!byActor.has(actorId)) byActor.set(actorId, []);
        byActor.get(actorId)!.push(occurrence);
        cpuAvailable = end;
      }
    }
  }

  return byActor;
};

const computeLegacyPathBound = (
  path: string[],
  byActor: Map<string, LegacyFiringOccurrence[]>
):
  | {
      duration: Rational;
      executionCost: Rational;
      structuralCost: Rational;
    }
  | null => {
  const firstActorOccurrences = byActor.get(path[0]) ?? [];
  const firstCycleOccurrences = firstActorOccurrences.filter(
    (occurrence) => occurrence.cycleIndex === 0
  );
  if (firstCycleOccurrences.length === 0) return null;

  let worst:
    | {
        duration: Rational;
        executionCost: Rational;
        structuralCost: Rational;
      }
    | null = null;

  for (const first of firstCycleOccurrences) {
    let currentReady = first.end;
    let last = first;
    let valid = true;
    let executionCost = sub(first.end, first.start);

    for (let index = 1; index < path.length; index += 1) {
      const occurrences = byActor.get(path[index]) ?? [];
      const next = occurrences.find(
        (occurrence) => compare(occurrence.start, currentReady) >= 0
      );
      if (!next) {
        valid = false;
        break;
      }
      currentReady = next.end;
      last = next;
      executionCost = add(executionCost, sub(next.end, next.start));
    }

    if (!valid) continue;

    const duration = sub(last.end, first.release);
    const structuralCost = sub(duration, executionCost);
    if (worst === null || compare(duration, worst.duration) > 0) {
      worst = {
        duration,
        executionCost,
        structuralCost,
      };
    }
  }

  return worst;
};

const buildLegacyWorstPathArtifact = (
  model: PolyGraphModel,
  schedule: ScheduleEntry[] | undefined,
  baseTick: Rational | undefined
): WorstCasePathArtifact | undefined => {
  if (!schedule || schedule.length === 0 || !baseTick || model.actors.length === 0) {
    return undefined;
  }

  const { paths, truncated: pathEnumerationTruncated } = enumeratePaths(model);
  if (paths.length === 0) return undefined;

  const byActor = buildLegacyOccurrences(model, schedule, baseTick);
  const ranked = paths
    .map((path) => {
      const bound = computeLegacyPathBound(path, byActor);
      return bound ? { path, ...bound } : null;
    })
    .filter(
      (
        entry
      ): entry is {
        path: string[];
        duration: Rational;
        executionCost: Rational;
        structuralCost: Rational;
      } => entry !== null
    )
    .sort((left, right) => {
      const durationCmp = compare(right.duration, left.duration);
      if (durationCmp !== 0) return durationCmp;
      return right.path.length - left.path.length;
    });

  if (ranked.length === 0) return undefined;

  const best = ranked[0];
  return {
    duration: rationalToString(best.duration),
    structuralCost: rationalToString(best.structuralCost),
    executionCost: rationalToString(best.executionCost),
    path: best.path,
    pathsAnalyzed: ranked.length,
    truncated: pathEnumerationTruncated,
    rankedPaths: ranked.slice(0, TOP_PATHS).map((entry) => ({
      path: entry.path,
      duration: rationalToString(entry.duration),
      structuralCost: rationalToString(entry.structuralCost),
      executionCost: rationalToString(entry.executionCost),
    })),
  };
};

const topologicalOrder = (nodes: FiringNode[], outgoing: EdgeMap): string[] => {
  const indegree = new Map<string, number>();
  nodes.forEach((node) => indegree.set(node.key, 0));
  outgoing.forEach((targets) => {
    targets.forEach((target) => indegree.set(target, (indegree.get(target) ?? 0) + 1));
  });

  const queue: string[] = [];
  indegree.forEach((deg, key) => {
    if (deg === 0) queue.push(key);
  });

  const order: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);
    const targets = outgoing.get(current);
    if (!targets) continue;
    targets.forEach((target) => {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) queue.push(target);
    });
  }

  if (order.length === nodes.length) return order;
  return nodes.map((node) => node.key);
};

const buildReachability = (outgoing: EdgeMap) => {
  const reachability = new Map<string, Set<string>>();
  const predecessorsByNode = new Map<string, Set<string>>();

  outgoing.forEach((_, node) => {
    predecessorsByNode.set(node, new Set<string>());
  });

  outgoing.forEach((_, start) => {
    const visited = new Set<string>();
    const queue: string[] = [start];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const targets = outgoing.get(current) ?? new Set<string>();
      targets.forEach((target) => {
        if (target === start || visited.has(target)) return;
        visited.add(target);
        queue.push(target);
      });
    }

    reachability.set(start, visited);
    visited.forEach((target) => {
      if (!predecessorsByNode.has(target)) {
        predecessorsByNode.set(target, new Set<string>());
      }
      predecessorsByNode.get(target)!.add(start);
    });
  });

  return {
    isReachable: (from: string, to: string) =>
      reachability.get(from)?.has(to) ?? false,
    predecessorsOf: (key: string) =>
      Array.from(predecessorsByNode.get(key) ?? new Set<string>()),
  };
};

const buildTimingModel = (
  model: PolyGraphModel,
  artifacts: NonNullable<ExecutionResult["artifacts"]>,
  timing: TimingInfo | undefined
) => {
  const actorById = new Map(model.actors.map((actor) => [actor.id, actor]));
  const jobByKey = new Map<string, FiringNode>();
  const nodes: FiringNode[] = [];

  const fallbackHyperperiodMs = timing ? msFromSeconds(timing.hyperperiod) : { n: 1n, d: 1n };

  const firingSequence = artifacts.firingSequence ?? [];
  for (const entry of firingSequence) {
    const actor = actorById.get(entry.actorId);
    if (!actor) continue;

    const wcet = parseDuration(actor.executionTime, rationalZero);
    const bcet = parseDuration(actor.bcet, wcet);
    const jitter = parseOptionalDuration(actor.jitter);
    const periodMs = actor.timed ? periodMsFromActor(actor) : null;

    let al: Rational;
    let au: Rational;
    let rl: Rational;
    let ru: Rational;

    if (actor.timed && periodMs) {
      const phase = parseOptionalDuration(actor.phase);
      const nMinusOne = fromBigint(BigInt(Math.max(0, entry.firingIndex - 1)));
      const tau = add(mul(periodMs, nMinusOne), phase);
      al = tau;
      au = add(tau, periodMs);
      ru = au;
      rl = sub(au, jitter);
    } else {
      al = zero();
      au = fallbackHyperperiodMs;
      rl = zero();
      ru = fallbackHyperperiodMs;
    }

    const key = `${entry.actorId}#${entry.firingIndex}`;
    const node: FiringNode = {
      key,
      actorId: entry.actorId,
      firingIndex: entry.firingIndex,
      al,
      au,
      pl: { ...al },
      pu: { ...au },
      rl,
      ru,
      es: { ...al },
      ls: { ...al },
      ef: add(al, bcet),
      lf: add(al, wcet),
      bcif: zero(),
      wcif: zero(),
      bcet,
      wcet,
      priority: Number.isFinite(actor.priority) ? actor.priority! : 0,
      processor: Number.isFinite(actor.processor) ? actor.processor! : 0,
    };

    jobByKey.set(key, node);
    nodes.push(node);
  }

  const outgoing: EdgeMap = new Map();
  const incoming: EdgeMap = new Map();
  nodes.forEach((node) => {
    outgoing.set(node.key, new Set<string>());
    incoming.set(node.key, new Set<string>());
  });

  const cumulativeByChannel = new Map(
    (artifacts.cumulativeTokenTrace ?? []).map((entry) => [entry.channelId, entry])
  );

  model.channels.forEach((channel) => {
    const cumulative = cumulativeByChannel.get(channel.id);
    if (!cumulative) return;
    const produced = parseCumulativeTrace(cumulative.produced);
    const consumed = parseCumulativeTrace(cumulative.consumed);

    for (let p = 1; p < consumed.length; p += 1) {
      const tokensNeeded = consumed[p];
      const n = findProducerFiringIndex(produced, tokensNeeded);
      if (n === null || n <= 0) continue;

      const predKey = `${channel.src}#${n}`;
      const succKey = `${channel.dst}#${p}`;
      if (!jobByKey.has(predKey) || !jobByKey.has(succKey)) continue;
      outgoing.get(predKey)?.add(succKey);
      incoming.get(succKey)?.add(predKey);
    }
  });

  return { nodes, jobByKey, outgoing, incoming };
};

const propagateFrames = (
  nodes: FiringNode[],
  outgoing: EdgeMap,
  incoming: EdgeMap
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const order = topologicalOrder(nodes, outgoing);
  const byKey = new Map(nodes.map((node) => [node.key, node]));

  let iterations = 0;
  let changed = true;

  while (changed) {
    changed = false;
    iterations += 1;
    if (iterations > MAX_RELAX_ITERS) {
      diagnostics.push({
        id: "E_TOPOLOGY_INVALID",
        severity: "warn",
        message: "Timing frame propagation reached the safety iteration bound; continuing with conservative intermediate bounds.",
        hint: "This often happens with cyclic firing-level precedence. Validation/liveness remain valid; timing bounds may be less precise.",
      });
      break;
    }

    for (const key of order) {
      const node = byKey.get(key);
      if (!node) continue;
      const predecessors = incoming.get(key) ?? new Set<string>();

      let nextAl = node.al;
      let nextPl = node.pl;
      let nextAu = node.au;
      let nextPu = node.pu;

      predecessors.forEach((predKey) => {
        const pred = byKey.get(predKey);
        if (!pred) return;
        nextAl = maxRational(nextAl, pred.rl);
        nextPl = maxRational(nextPl, maxRational(pred.rl, add(pred.pl, pred.wcet)));
        nextAu = maxRational(nextAu, pred.ru);
        nextPu = maxRational(nextPu, add(pred.pu, node.wcet));
      });

      if (compare(nextAl, node.al) !== 0) {
        node.al = nextAl;
        changed = true;
      }
      if (compare(nextPl, node.pl) !== 0) {
        node.pl = nextPl;
        changed = true;
      }
      if (compare(nextAu, node.au) !== 0) {
        node.au = nextAu;
        changed = true;
      }
      if (compare(nextPu, node.pu) !== 0) {
        node.pu = nextPu;
        changed = true;
      }

      if (compare(node.pu, node.pl) < 0) {
        diagnostics.push({
          id: "E_TOPOLOGY_INVALID",
          severity: "error",
          message: `Infeasible pessimistic frame for firing ${node.actorId}#${node.firingIndex}: pu < pl.`,
          where: { actorId: node.actorId },
        });
      }

      if (compare(add(node.pl, node.wcet), node.pu) > 0) {
        diagnostics.push({
          id: "E_TOPOLOGY_INVALID",
          severity: "error",
          message: `Infeasible pessimistic frame for firing ${node.actorId}#${node.firingIndex}: pl + WCET > pu.`,
          where: { actorId: node.actorId },
        });
      }
    }

    if (diagnostics.some((diag) => diag.severity === "error")) break;
  }

  return diagnostics;
};

const checkAbsoluteWindows = (nodes: FiringNode[]): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const violations = new Map<string, { count: number; firstFiring: number }>();

  nodes.forEach((node) => {
    if (compare(add(node.al, node.wcet), node.au) <= 0) return;
    const current = violations.get(node.actorId);
    if (!current) {
      violations.set(node.actorId, { count: 1, firstFiring: node.firingIndex });
      return;
    }
    current.count += 1;
    if (node.firingIndex < current.firstFiring) current.firstFiring = node.firingIndex;
  });

  violations.forEach((value, actorId) => {
    diagnostics.push({
      id: "E_TOPOLOGY_INVALID",
      severity: "warn",
      message:
        value.count === 1
          ? `Absolute timing window may be too small for actor ${actorId} at firing #${value.firstFiring} (al + WCET > au).`
          : `Absolute timing window may be too small for actor ${actorId} on ${value.count} firings (first at #${value.firstFiring}).`,
      where: { actorId },
      hint: "This timing analysis is conservative. Add BCET/jitter/priority/processor metadata to refine bounds.",
    });
  });

  return diagnostics;
};

const runIntervalRta = (
  nodes: FiringNode[],
  outgoing: EdgeMap,
  incoming: EdgeMap
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const byKey = new Map(nodes.map((node) => [node.key, node]));
  const order = topologicalOrder(nodes, outgoing);
  const reachability = buildReachability(outgoing);
  const warnedPossibleByActor = new Map<string, Set<number>>();
  const warnedCertainByActor = new Map<string, Set<number>>();

  let changed = true;
  let iterations = 0;

  while (changed) {
    changed = false;
    iterations += 1;
    if (iterations > MAX_RELAX_ITERS) {
      diagnostics.push({
        id: "E_TOPOLOGY_INVALID",
        severity: "warn",
        message: "Interval RTA reached the safety iteration bound; continuing with conservative intermediate bounds.",
        hint: "This can occur with cyclic precedence and dense interference sets. Reported timing may be pessimistic.",
      });
      break;
    }

    const wcifContributors = new Map<string, Set<string>>();

    for (const key of order) {
      const node = byKey.get(key);
      if (!node) continue;
      const predecessors = incoming.get(key) ?? new Set<string>();

      let nextEs = node.es;
      let nextLs = node.ls;
      predecessors.forEach((predKey) => {
        const pred = byKey.get(predKey);
        if (!pred) return;
        nextEs = maxRational(nextEs, pred.ef);
        nextLs = maxRational(nextLs, pred.lf);
      });

      let bcif = zero();
      let wcif = zero();
      const accountedWcif = new Set<string>();

      for (const interferer of nodes) {
        if (interferer.key === node.key) continue;
        if (interferer.processor !== node.processor) continue;
        if (interferer.priority <= node.priority) continue;

        const sameChain =
          reachability.isReachable(node.key, interferer.key) ||
          reachability.isReachable(interferer.key, node.key);
        if (sameChain) continue;

        if (
          compare(interferer.es, nextLs) >= 0 &&
          compare(interferer.ls, add(nextEs, node.bcet)) <= 0
        ) {
          bcif = add(bcif, interferer.bcet);
        }

        const noOverlap =
          compare(interferer.lf, nextEs) < 0 ||
          compare(interferer.ef, add(nextLs, node.wcet)) > 0;

        if (!noOverlap && !accountedWcif.has(interferer.key)) {
          const predecessorKeys = reachability.predecessorsOf(node.key);
          const alreadyCountedOnPred = predecessorKeys.some((predKey) =>
            wcifContributors.get(predKey)?.has(interferer.key)
          );

          if (!alreadyCountedOnPred) {
            wcif = add(wcif, interferer.wcet);
            accountedWcif.add(interferer.key);
          }
        }
      }

      wcifContributors.set(node.key, accountedWcif);

      const nextEf = add(add(nextEs, node.bcet), bcif);
      const nextLf = add(add(nextLs, node.wcet), wcif);

      if (compare(nextEs, node.es) !== 0) {
        node.es = nextEs;
        changed = true;
      }
      if (compare(nextLs, node.ls) !== 0) {
        node.ls = nextLs;
        changed = true;
      }
      if (compare(nextEf, node.ef) !== 0) {
        node.ef = nextEf;
        changed = true;
      }
      if (compare(nextLf, node.lf) !== 0) {
        node.lf = nextLf;
        changed = true;
      }
      node.bcif = bcif;
      node.wcif = wcif;

      if (compare(node.lf, node.au) > 0) {
        if (!warnedPossibleByActor.has(node.actorId)) {
          warnedPossibleByActor.set(node.actorId, new Set<number>());
        }
        warnedPossibleByActor.get(node.actorId)!.add(node.firingIndex);
      }

      if (compare(node.ef, node.au) > 0) {
        if (!warnedCertainByActor.has(node.actorId)) {
          warnedCertainByActor.set(node.actorId, new Set<number>());
        }
        warnedCertainByActor.get(node.actorId)!.add(node.firingIndex);
      }
    }
  }

  warnedPossibleByActor.forEach((firings, actorId) => {
    const firingList = Array.from(firings).sort((a, b) => a - b);
    diagnostics.push({
      id: "E_NOT_LIVE",
      severity: "warn",
      message:
        firingList.length === 1
          ? `Deadline miss possible for actor ${actorId} at firing #${firingList[0]} (lf > au).`
          : `Deadline miss possible for actor ${actorId} on ${firingList.length} firings (first at #${firingList[0]}).`,
      where: { actorId },
    });
  });

  warnedCertainByActor.forEach((firings, actorId) => {
    const firingList = Array.from(firings).sort((a, b) => a - b);
    diagnostics.push({
      id: "E_NOT_LIVE",
      severity: "warn",
      message:
        firingList.length === 1
          ? `Deadline miss appears certain for actor ${actorId} at firing #${firingList[0]} (ef > au) under current conservative assumptions.`
          : `Deadline miss appears certain for actor ${actorId} on ${firingList.length} firings (first at #${firingList[0]}) under current conservative assumptions.`,
      where: { actorId },
      hint: "Provide BCET/priority/processor/jitter for tighter analysis, or treat this as a strict failure in a future strict mode.",
    });
  });

  return diagnostics;
};

const computePathBound = (
  path: string[],
  byActor: Map<string, FiringNode[]>
):
  | {
      duration: Rational;
      bestCaseDuration: Rational;
      executionCost: Rational;
      structuralCost: Rational;
      dataDependencyCost: Rational;
      contentionCost: Rational;
    }
  | null => {
  const sourceJobs = byActor.get(path[0]) ?? [];
  if (sourceJobs.length === 0) return null;

  let worst:
    | {
        duration: Rational;
        bestCaseDuration: Rational;
        executionCost: Rational;
        structuralCost: Rational;
        dataDependencyCost: Rational;
        contentionCost: Rational;
      }
    | null = null;

  for (const source of sourceJobs) {
    const chain: FiringNode[] = [source];
    let valid = true;

    for (let idx = 1; idx < path.length; idx += 1) {
      const actorJobs = byActor.get(path[idx]) ?? [];
      const previous = chain[chain.length - 1];
      const next = actorJobs.find((job) => compare(job.al, previous.ef) >= 0);
      if (!next) {
        valid = false;
        break;
      }
      chain.push(next);
    }

    if (!valid) continue;

    const sink = chain[chain.length - 1];
    const executionCost = chain.reduce((acc, job) => add(acc, job.wcet), zero());
    const contentionCost = chain.reduce((acc, job) => add(acc, job.wcif), zero());
    const duration = sub(sink.lf, source.al);
    const bestCaseDuration = sub(sink.ef, source.al);
    const dataDependencyCost = sub(sub(sink.ls, source.al), executionCost);
    const structuralCost = add(dataDependencyCost, contentionCost);

    if (worst === null || compare(duration, worst.duration) > 0) {
      worst = {
        duration,
        bestCaseDuration,
        executionCost,
        structuralCost,
        dataDependencyCost,
        contentionCost,
      };
    }
  }

  return worst;
};

const buildWorstPathArtifact = (
  model: PolyGraphModel,
  nodes: FiringNode[]
): WorstCasePathArtifact | undefined => {
  const { paths, truncated: pathEnumerationTruncated } = enumeratePaths(model);
  if (paths.length === 0) return undefined;

  const byActor = new Map<string, FiringNode[]>();
  model.actors.forEach((actor) => byActor.set(actor.id, []));
  nodes.forEach((node) => {
    const list = byActor.get(node.actorId);
    if (!list) return;
    list.push(node);
  });
  byActor.forEach((list) => {
    list.sort((a, b) => {
      const byAl = compare(a.al, b.al);
      if (byAl !== 0) return byAl;
      return a.firingIndex - b.firingIndex;
    });
  });

  const ranked = paths
    .map((path) => {
      const bound = computePathBound(path, byActor);
      return bound ? { path, ...bound } : null;
    })
    .filter(
      (
        entry
      ): entry is {
        path: string[];
        duration: Rational;
        bestCaseDuration: Rational;
        executionCost: Rational;
        structuralCost: Rational;
        dataDependencyCost: Rational;
        contentionCost: Rational;
      } => entry !== null
    )
    .sort((left, right) => {
      const durationCmp = compare(right.duration, left.duration);
      if (durationCmp !== 0) return durationCmp;
      return right.path.length - left.path.length;
    });

  if (ranked.length === 0) return undefined;

  const best = ranked[0];
  return {
    duration: rationalToString(best.duration),
    bestCaseDuration: rationalToString(best.bestCaseDuration),
    structuralCost: rationalToString(best.structuralCost),
    executionCost: rationalToString(best.executionCost),
    dataDependencyCost: rationalToString(best.dataDependencyCost),
    contentionCost: rationalToString(best.contentionCost),
    path: best.path,
    pathsAnalyzed: ranked.length,
    truncated: pathEnumerationTruncated,
    rankedPaths: ranked.slice(0, TOP_PATHS).map((entry) => ({
      path: entry.path,
      duration: rationalToString(entry.duration),
      bestCaseDuration: rationalToString(entry.bestCaseDuration),
      structuralCost: rationalToString(entry.structuralCost),
      executionCost: rationalToString(entry.executionCost),
      dataDependencyCost: rationalToString(entry.dataDependencyCost),
      contentionCost: rationalToString(entry.contentionCost),
    })),
  };
};

const buildTimingArtifact = (nodes: FiringNode[]): TimingAnalysisArtifact => ({
  feasible: true,
  firingTiming: nodes.map((node) => ({
    actorId: node.actorId,
    firingIndex: node.firingIndex,
    al: rationalToString(node.al),
    au: rationalToString(node.au),
    pl: rationalToString(node.pl),
    pu: rationalToString(node.pu),
    rl: rationalToString(node.rl),
    ru: rationalToString(node.ru),
    es: rationalToString(node.es),
    ls: rationalToString(node.ls),
    ef: rationalToString(node.ef),
    lf: rationalToString(node.lf),
    bcif: rationalToString(node.bcif),
    wcif: rationalToString(node.wcif),
  })),
});

export const computeTimingAndWorstCasePath = (
  model: PolyGraphModel,
  artifacts: NonNullable<ExecutionResult["artifacts"]> | undefined,
  timing: TimingInfo | undefined
): TimingComputationResult => {
  if (!artifacts || !artifacts.firingSequence || !artifacts.cumulativeTokenTrace) {
    return { diagnostics: [] };
  }

  const { nodes, outgoing, incoming } = buildTimingModel(model, artifacts, timing);
  if (nodes.length === 0) return { diagnostics: [] };

  const propagationDiagnostics = propagateFrames(nodes, outgoing, incoming);
  if (propagationDiagnostics.some((diag) => diag.severity === "error")) {
    return {
      diagnostics: propagationDiagnostics,
      timingAnalysis: { feasible: false, firingTiming: [] },
    };
  }

  const absoluteDiagnostics = checkAbsoluteWindows(nodes);

  const rtaDiagnostics = runIntervalRta(nodes, outgoing, incoming);
  const hasRtaError = rtaDiagnostics.some((diag) => diag.severity === "error");
  const hasAbsoluteWarning = absoluteDiagnostics.length > 0;

  return {
    diagnostics: [...absoluteDiagnostics, ...rtaDiagnostics],
    timingAnalysis: {
      ...buildTimingArtifact(nodes),
      feasible: !hasRtaError && !hasAbsoluteWarning,
    },
    worstCasePath: hasRtaError
      ? buildLegacyWorstPathArtifact(model, artifacts.schedule, timing?.baseTick)
      :
          buildWorstPathArtifact(model, nodes) ??
          buildLegacyWorstPathArtifact(model, artifacts.schedule, timing?.baseTick),
  };
};
