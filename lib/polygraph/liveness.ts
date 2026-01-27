import type { Diagnostic, ExecutionResult, PolyGraphModel, VerifyOptions } from "./types";
import type { Rational } from "./rational";
import {
  add,
  compare,
  rationalZero,
  toNumberSafe,
  toString as rationalToString,
} from "./rational";
import type { ParsedChannel, RepetitionVector, TimingInfo } from "./consistency";
import type { Topology } from "./topology";

export type LivenessResult = {
  ok: boolean;
  diagnostics: Diagnostic[];
  artifacts?: ExecutionResult["artifacts"];
};

const initTokenTrace = (channels: ParsedChannel[]) =>
  channels.map((channel) => ({
    channelId: channel.id,
    values: [{ tick: 0, tokens: rationalToString(channel.init) }],
  }));

export const checkLiveness = (
  model: PolyGraphModel,
  channels: ParsedChannel[],
  topology: Topology,
  repetition: RepetitionVector,
  options?: VerifyOptions
): LivenessResult => {
  const diagnostics: Diagnostic[] = [];
  const captureArtifacts = options?.computeExecution ?? true;

  const actorCount = model.actors.length;
  const channelStates: Rational[] = channels.map((channel) => ({ ...channel.init }));
  const firingCounts = model.actors.map(() => 0n);
  const targets = repetition.vector;
  const remainingTotal = targets.reduce((sum, value) => sum + value, 0n);

  let totalTicks = 1;
  let ticksPerHyperperiod = 1;
  const timing: TimingInfo | undefined = repetition.timing;

  if (timing) {
    ticksPerHyperperiod = timing.tickCount;
    const cycleCount = toNumberSafe(repetition.r);
    if (cycleCount === null) {
      diagnostics.push({
        id: "E_NOT_LIVE",
        severity: "error",
        message: "Execution window exceeds safe integer limits.",
      });
      return { ok: false, diagnostics };
    }
    totalTicks = ticksPerHyperperiod * cycleCount;
  }

  const schedule: Array<{ tick: number; fires: string[] }> = [];
  const tokenTrace = captureArtifacts ? initTokenTrace(channels) : undefined;

  let firedSoFar = 0n;
  let deadlockTick: number | null = null;

  const allowedTickSets = new Map<string, Set<number>>();
  if (timing) {
    timing.actorTicks.forEach((ticks, actorId) => {
      allowedTickSets.set(actorId, new Set(ticks));
    });
  }

  const enabled = (actorIndex: number) => {
    const incoming = topology.adjacency.incoming[actorIndex] ?? [];
    return incoming.every((channelIdx) => {
      const channel = channels[channelIdx];
      const nextState = add(channelStates[channelIdx], channel.rateDst);
      return compare(nextState, rationalZero) >= 0;
    });
  };

  const fireActor = (actorIndex: number) => {
    const outgoing = topology.adjacency.outgoing[actorIndex] ?? [];
    const incoming = topology.adjacency.incoming[actorIndex] ?? [];

    outgoing.forEach((channelIdx) => {
      const channel = channels[channelIdx];
      channelStates[channelIdx] = add(channelStates[channelIdx], channel.rateSrc);
    });

    incoming.forEach((channelIdx) => {
      const channel = channels[channelIdx];
      channelStates[channelIdx] = add(channelStates[channelIdx], channel.rateDst);
    });
  };

  const recordTokens = (tick: number) => {
    if (!tokenTrace) return;
    channelStates.forEach((state, idx) => {
      tokenTrace[idx].values.push({ tick, tokens: rationalToString(state) });
    });
  };

  for (let tick = 0; tick < totalTicks; tick += 1) {
    const fires: string[] = [];
    let progress = true;
    let safety = 0n;

    while (progress) {
      progress = false;
      for (let actorIdx = 0; actorIdx < actorCount; actorIdx += 1) {
        if (firingCounts[actorIdx] >= targets[actorIdx]) continue;

        const actor = model.actors[actorIdx];
        const allowed = !actor.timed
          ? true
          : allowedTickSets
              .get(actor.id)
              ?.has(tick % ticksPerHyperperiod) ?? false;
        if (!allowed) continue;
        if (!enabled(actorIdx)) continue;

        fireActor(actorIdx);
        firingCounts[actorIdx] += 1n;
        firedSoFar += 1n;
        fires.push(actor.id);
        progress = true;
        safety += 1n;

        const negative = channelStates.some((state) => compare(state, rationalZero) < 0);
        if (negative) {
          diagnostics.push({
            id: "E_NOT_LIVE",
            severity: "error",
            message: `Channel state became negative at tick ${tick}.`,
          });
          return { ok: false, diagnostics };
        }

        if (safety > remainingTotal + 1n) {
          diagnostics.push({
            id: "E_NOT_LIVE",
            severity: "error",
            message: "Liveness iteration exceeded expected firing count.",
          });
          return { ok: false, diagnostics };
        }
      }
    }

    schedule.push({ tick, fires });
    if (captureArtifacts) recordTokens(tick + 1);

    if (fires.length === 0 && firedSoFar !== remainingTotal) {
      deadlockTick = tick;
      break;
    }
  }

  const allFired = firingCounts.every((count, idx) => count === targets[idx]);
  const stateReset = channelStates.every(
    (state, idx) => compare(state, channels[idx].init) === 0
  );

  if (!allFired || !stateReset || deadlockTick !== null) {
    const reason = deadlockTick !== null
      ? `Deadlock detected at tick ${deadlockTick}.`
      : "Execution did not reach repetition target or reset channel states.";
    diagnostics.push({
      id: "E_NOT_LIVE",
      severity: "error",
      message: reason,
    });
    return { ok: false, diagnostics };
  }

  return {
    ok: true,
    diagnostics,
    artifacts: captureArtifacts
      ? {
          hyperperiod: timing
            ? {
                tickCount: timing.tickCount,
                significantTicks: timing.significantTicks,
              }
            : { tickCount: 1, significantTicks: [] },
          schedule,
          tokenTrace,
        }
      : undefined,
  };
};

