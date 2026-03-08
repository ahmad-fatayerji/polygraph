import type {
  PolyGraphModel,
  WorstCasePathArtifact,
} from "./types";
import type { Rational } from "./rational";
import {
  add,
  compare,
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

type FiringOccurrence = {
  actorId: string;
  release: Rational;
  start: Rational;
  end: Rational;
  cycleIndex: number;
};

type ScheduleEntry = {
  tick: number;
  fires: string[];
};

const maxRational = (left: Rational, right: Rational) =>
  compare(left, right) >= 0 ? left : right;

const parseExecutionTime = (value: string | number | undefined): Rational => {
  if (value === undefined || value === null || value === "") {
    return rationalZero;
  }

  if (typeof value === "number") {
    return parseNumberToRational(value) ?? rationalZero;
  }

  const parsed = parseRational(String(value));
  return parsed.ok ? parsed.value : rationalZero;
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
      if (path.length > 1) {
        paths.push([...path]);
      }
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

const buildOccurrences = (
  model: PolyGraphModel,
  schedule: ScheduleEntry[],
  baseTick: Rational
) => {
  const executionTimes = new Map(
    model.actors.map((actor) => [actor.id, parseExecutionTime(actor.executionTime)])
  );
  const byActor = new Map<string, FiringOccurrence[]>();
  const totalTicks = schedule.length;
  const cycleDuration = mul(baseTick, fromBigint(BigInt(totalTicks)));

  let cpuAvailable = rationalZero;
  for (let cycleIndex = 0; cycleIndex < 2; cycleIndex += 1) {
    for (const entry of schedule) {
      const absoluteTick = cycleIndex * totalTicks + entry.tick;
      const release = mul(baseTick, fromBigint(BigInt(absoluteTick)));
      for (const actorId of entry.fires) {
        const start = maxRational(release, cpuAvailable);
        const executionTime = executionTimes.get(actorId) ?? rationalZero;
        const end = add(start, executionTime);
        const occurrence: FiringOccurrence = {
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

  return { byActor, cycleDuration };
};

const computePathBound = (
  path: string[],
  byActor: Map<string, FiringOccurrence[]>
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

export const computeWorstCasePath = (
  model: PolyGraphModel,
  schedule: ScheduleEntry[] | undefined,
  baseTick: Rational | undefined
): WorstCasePathArtifact | undefined => {
  if (!schedule || schedule.length === 0 || !baseTick || model.actors.length === 0) {
    return undefined;
  }

  const { paths, truncated: pathEnumerationTruncated } = enumeratePaths(model);
  if (paths.length === 0) return undefined;

  const { byActor } = buildOccurrences(model, schedule, baseTick);
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
