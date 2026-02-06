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
        message: "The execution window is astronomically large and exceeds safe computation limits. The model's repetition vector requires too many cycles to simulate.",
        hint: 'Simplify the model by reducing the number of actors or using smaller frequency ratios.',
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
          const negChannels = channels
            .filter((_, ci) => compare(channelStates[ci], rationalZero) < 0)
            .map((c) => `"${c.id}"`);
          diagnostics.push({
            id: "E_NOT_LIVE",
            severity: "error",
            message: `A channel's token count went negative at tick ${tick}, which means an actor consumed more tokens than were available. Affected channel(s): ${negChannels.join(", ")}.`,
            hint: 'Increase the initial tokens on the affected channel(s) or review the production/consumption rates.',
          });
          return { ok: false, diagnostics };
        }

        if (safety > remainingTotal + 1n) {
          diagnostics.push({
            id: "E_NOT_LIVE",
            severity: "error",
            message: "The simulation fired more times than expected, indicating a possible infinite loop in the execution schedule.",
            hint: 'This is usually caused by inconsistent channel rates. Re-check channel configurations.',
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
    let reason: string;
    let hint: string | undefined;
    if (deadlockTick !== null) {
      const blocked = model.actors
        .filter((_, idx) => firingCounts[idx] < targets[idx])
        .map((a) => `"${a.id}"`);
      reason = `Deadlock at tick ${deadlockTick}: no actor can fire, but ${blocked.length} actor(s) still need to execute (${blocked.slice(0, 5).join(", ")}${blocked.length > 5 ? ", ..." : ""}). They are waiting for tokens that will never arrive.`;
      hint = 'Add initial tokens to the channels feeding the blocked actors, or adjust rates so all actors can eventually fire.';
    } else if (!allFired) {
      reason = "The simulation completed all ticks but some actors did not reach their required number of firings. The schedule is incomplete.";
      hint = 'Check that timed actors have correct frequencies and that enough ticks are available within the hyperperiod.';
    } else {
      reason = "All actors fired the correct number of times, but the channel token counts did not return to their initial values. The system would not be repeatable.";
      hint = 'Adjust the channel rates or initial tokens so that one full cycle returns all channels to their starting state.';
    }
    diagnostics.push({
      id: "E_NOT_LIVE",
      severity: "error",
      message: reason,
      hint,
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

