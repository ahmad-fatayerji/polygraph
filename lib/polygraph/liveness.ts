import type { DetailedTraceStep, Diagnostic, ExecutionResult, PolyGraphModel, VerifyOptions } from "./types";
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

/**
 * Liveness check implementing Algorithm 1 ("ticks-go-first, smallest-index-first")
 * from Dubrulle et al., "PolyGraph: a data-flow model with frequency arithmetic",
 * STTT / FASE 2019, §5 Liveness checking.
 *
 * The algorithm constructs a valid execution σ by interleaving clock ticks and
 * actor firings.  At every opportunity it advances the global clock first (lines
 * 3-5 and 15-17 of Algorithm 1), then fires the smallest-index actor in the
 * intersection Enabled ∩ Allowed ∩ Waiting (line 12).  It terminates when no
 * such actor exists.  The model is live iff y^σ = x ∧ z^σ = z (line 22).
 */
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
  const firingCounts = model.actors.map(() => 0n);            // y^σ
  const targets = repetition.vector;                           // x (minimal repetition vector)
  const totalExpectedFirings = targets.reduce((sum, v) => sum + v, 0n);

  const timing: TimingInfo | undefined = repetition.timing;
  const pi = timing?.tickCount ?? 0;                           // π (ticks per hyperperiod)

  // z = total ticks in a minimal consistent execution = r · π
  let z = 0;
  if (timing) {
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
    z = pi * cycleCount;
  }

  // Pre-compute allowed tick sets for each timed actor (mod π).
  const allowedTickSets = new Map<string, Set<number>>();
  if (timing) {
    timing.actorTicks.forEach((ticks, actorId) => {
      allowedTickSets.set(actorId, new Set(ticks));
    });
  }

  // ----- Algorithm 1 state -----
  let tau = 0;                                                 // current tick (mod π)
  let zSigma = 0;                                              // z^σ (total ticks so far)
  const tracking = model.actors.map(() => 0n);                 // a (tracking vector, resets each tick)
  let totalFirings = 0n;

  // Schedule & token trace artifacts
  const scheduleMap = new Map<number, string[]>();              // absolute tick → fired actor ids
  const tokenTrace = captureArtifacts ? initTokenTrace(channels) : undefined;

  // Detailed trace — captures state at every fire/tick event
  const detailedTrace: DetailedTraceStep[] = [];
  let stateIndex = 1;

  /** Snapshot the current state into the detailed trace. */
  const snapshotState = (label: string) => {
    if (!captureArtifacts) return;
    detailedTrace.push({
      stateIndex,
      label,
      channelStates: channelStates.map(rationalToString),
      tau,
      tracking: tracking.map((v) => v.toString()),
      firingVector: firingCounts.map((v) => v.toString()),
      totalTicks: zSigma,
    });
    stateIndex += 1;
  };

  /** Format a superscript number for state labels. */
  const sup = (n: number): string => {
    const digits = "⁰¹²³⁴⁵⁶⁷⁸⁹";
    return String(n).split("").map((d) => digits[parseInt(d)]).join("");
  };

  /** Format a subscript number for actor labels. */
  const sub = (n: number): string => {
    const digits = "₀₁₂₃₄₅₆₇₈₉";
    return String(n).split("").map((d) => digits[parseInt(d)]).join("");
  };

  // ----- Helper: t^τ_j — is timed actor expected to fire at current tick? -----
  const isExpectedAtTick = (actorIdx: number): boolean => {
    const actor = model.actors[actorIdx];
    if (!actor.timed) return false;
    return allowedTickSets.get(actor.id)?.has(tau) ?? false;
  };

  // ----- canTick: a = t^τ ∧ z^σ < z (Algorithm 1, lines 3 & 15) -----
  const canTick = (): boolean => {
    if (zSigma >= z) return false;
    for (let i = 0; i < actorCount; i += 1) {
      if (!model.actors[i].timed) continue;
      const expected = isExpectedAtTick(i) ? 1n : 0n;
      if (tracking[i] !== expected) return false;
    }
    return true;
  };

  // ----- doTick: τ' = (τ+1) mod π, a' = 0, z^σ += 1 (Def. 8) -----
  const doTick = () => {
    const prevState = stateIndex - 1;
    if (!scheduleMap.has(zSigma)) scheduleMap.set(zSigma, []);
    zSigma += 1;
    tau = pi > 0 ? (tau + 1) % pi : 0;
    for (let i = 0; i < actorCount; i += 1) tracking[i] = 0n;
    if (captureArtifacts) recordTokens(zSigma);
    snapshotState(`tick(s${sup(prevState)})`);
  };

  const recordTokens = (tick: number) => {
    if (!tokenTrace) return;
    channelStates.forEach((state, idx) => {
      tokenTrace[idx].values.push({ tick, tokens: rationalToString(state) });
    });
  };

  // ----- Allowed: (V \ VF) ∪ { vj ∈ VF | t^τ_j = 1 ∧ a_j = 0 } -----
  const isAllowed = (actorIdx: number): boolean => {
    const actor = model.actors[actorIdx];
    if (!actor.timed) return true;
    return isExpectedAtTick(actorIdx) && tracking[actorIdx] === 0n;
  };

  // ----- Enabled: { vj | ∀ ei ∈ in(vj), ci ≥ |γ_ij| } (Def. 11) -----
  const isEnabled = (actorIdx: number): boolean => {
    const incoming = topology.adjacency.incoming[actorIdx] ?? [];
    return incoming.every((chIdx) => {
      const nextState = add(channelStates[chIdx], channels[chIdx].rateDst);
      return compare(nextState, rationalZero) >= 0;
    });
  };

  // ----- fire(vk, s): c' = c + Γ · u_k (Def. 7) -----
  const fireActor = (actorIdx: number) => {
    const outgoing = topology.adjacency.outgoing[actorIdx] ?? [];
    const incoming = topology.adjacency.incoming[actorIdx] ?? [];
    outgoing.forEach((chIdx) => {
      channelStates[chIdx] = add(channelStates[chIdx], channels[chIdx].rateSrc);
    });
    incoming.forEach((chIdx) => {
      channelStates[chIdx] = add(channelStates[chIdx], channels[chIdx].rateDst);
    });
  };

  // ===== Algorithm 1: Liveness test =====

  // Snapshot initial state s¹
  snapshotState(`s${sup(1)}`);

  // Lines 3-5: Extend σ by ticks as long as possible (initial tick advancement)
  while (canTick()) doTick();

  // Lines 10-21: Main loop — fire one actor, then tick as much as possible
  let foundActor = true;
  while (foundActor) {
    foundActor = false;

    for (let actorIdx = 0; actorIdx < actorCount; actorIdx += 1) {
      // Waiting: y^σ_j < x_j
      if (firingCounts[actorIdx] >= targets[actorIdx]) continue;
      // Allowed
      if (!isAllowed(actorIdx)) continue;
      // Enabled
      if (!isEnabled(actorIdx)) continue;

      // Lines 12-13: Fire actor vk
      const prevStateFire = stateIndex - 1;
      fireActor(actorIdx);
      firingCounts[actorIdx] += 1n;
      totalFirings += 1n;
      if (model.actors[actorIdx].timed) tracking[actorIdx] += 1n;

      // Record firing in schedule at current absolute tick
      if (!scheduleMap.has(zSigma)) scheduleMap.set(zSigma, []);
      scheduleMap.get(zSigma)!.push(model.actors[actorIdx].id);

      // Snapshot state after firing
      snapshotState(`fire(v${sub(actorIdx + 1)}, s${sup(prevStateFire)})`);

      // Safety: detect negative channel state (should not happen in a valid execution)
      const negative = channelStates.some((s) => compare(s, rationalZero) < 0);
      if (negative) {
        const negChannels = channels
          .filter((_, ci) => compare(channelStates[ci], rationalZero) < 0)
          .map((c) => `"${c.id}"`);
        diagnostics.push({
          id: "E_NOT_LIVE",
          severity: "error",
          message: `A channel's token count went negative at tick ${zSigma}, which means an actor consumed more tokens than were available. Affected channel(s): ${negChannels.join(", ")}.`,
          hint: 'Increase the initial tokens on the affected channel(s) or review the production/consumption rates.',
        });
        return { ok: false, diagnostics };
      }

      // Safety: runaway firing detection
      if (totalFirings > totalExpectedFirings + 1n) {
        diagnostics.push({
          id: "E_NOT_LIVE",
          severity: "error",
          message: "The simulation fired more times than expected, indicating a possible infinite loop in the execution schedule.",
          hint: 'This is usually caused by inconsistent channel rates. Re-check channel configurations.',
        });
        return { ok: false, diagnostics };
      }

      // Lines 15-17: Do ticks as long as possible
      while (canTick()) doTick();

      // Restart search from smallest index (lines 18-20 recompute sets; line 10 re-checks)
      foundActor = true;
      break;
    }
  }

  // ----- Line 22: return y^σ = x ∧ z^σ = z -----
  const allFired = firingCounts.every((count, idx) => count === targets[idx]);
  const ticksComplete = !timing || zSigma === z;
  const stateReset = channelStates.every(
    (state, idx) => compare(state, channels[idx].init) === 0
  );

  if (!allFired || !ticksComplete || !stateReset) {
    let reason: string;
    let hint: string | undefined;
    if (!allFired) {
      const blocked = model.actors
        .filter((_, idx) => firingCounts[idx] < targets[idx])
        .map((a) => `"${a.id}"`);
      reason = `Deadlock at tick ${zSigma}: no actor can fire, but ${blocked.length} actor(s) still need to execute (${blocked.slice(0, 5).join(", ")}${blocked.length > 5 ? ", ..." : ""}). They are waiting for tokens that will never arrive.`;
      hint = 'Add initial tokens to the channels feeding the blocked actors, or adjust rates so all actors can eventually fire.';
    } else if (!ticksComplete) {
      reason = "All actors fired the correct number of times, but the total number of clock ticks did not reach the expected count. The execution could not complete its synchronous schedule.";
      hint = 'Check that timed actors have correct frequencies and that the timing constraints are satisfiable.';
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

  // ----- Build output artifacts -----
  const scheduleLength = timing ? z : 1;
  const schedule: Array<{ tick: number; fires: string[] }> = [];
  for (let t = 0; t < scheduleLength; t += 1) {
    schedule.push({ tick: t, fires: scheduleMap.get(t) ?? [] });
  }

  // For pure SDF (untimed) graphs, record final token state
  if (captureArtifacts && !timing) {
    recordTokens(1);
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
        detailedTrace,
      }
      : undefined,
  };
};

