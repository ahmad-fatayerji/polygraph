import type { Diagnostic, ExecutionResult, PolyGraphModel, VerifyOptions } from "./types";
import {
  compare,
  isInteger,
  maxDenominator,
  mul,
  parseRational,
  rationalZero,
} from "./rational";
import { analyzeGraph, buildTopology } from "./topology";
import type { ParsedChannel } from "./consistency";
import { checkConsistency } from "./consistency";
import { checkLiveness } from "./liveness";

const hasErrors = (diagnostics: Diagnostic[]) =>
  diagnostics.some((diag) => diag.severity === "error");

const parseChannels = (model: PolyGraphModel) => {
  const diagnostics: Diagnostic[] = [];
  const actorIds = new Set(model.actors.map((actor) => actor.id));
  const parseStatus: Array<{ rateSrc: boolean; rateDst: boolean; init: boolean }> = [];

  const parsedChannels: ParsedChannel[] = model.channels.map((channel) => {
    const rateSrcRaw = typeof channel.rateSrc === "string" ? channel.rateSrc : "";
    const rateDstRaw = typeof channel.rateDst === "string" ? channel.rateDst : "";
    const initRaw = typeof channel.init === "string" ? channel.init : "";
    const rateSrcResult = parseRational(rateSrcRaw);
    const rateDstResult = parseRational(rateDstRaw);
    const initResult = parseRational(initRaw);
    parseStatus.push({
      rateSrc: rateSrcResult.ok,
      rateDst: rateDstResult.ok,
      init: initResult.ok,
    });

    if (!rateSrcResult.ok) {
      diagnostics.push({
        id: "E_PARSE_RATIONAL",
        severity: "error",
        message: `The source rate (rateSrc) of channel "${channel.id}" is not a valid number. Received: "${rateSrcRaw || "(empty)"}".`,
        where: { channelId: channel.id, field: "rateSrc" },
        hint: 'Use an integer like "1" or a fraction like "1/3". The value must be a positive rational number.',
      });
    }

    if (!rateDstResult.ok) {
      diagnostics.push({
        id: "E_PARSE_RATIONAL",
        severity: "error",
        message: `The destination rate (rateDst) of channel "${channel.id}" is not a valid number. Received: "${rateDstRaw || "(empty)"}".`,
        where: { channelId: channel.id, field: "rateDst" },
        hint: 'Use an integer like "-1" or a fraction like "-2/3". The value must be a negative rational number.',
      });
    }

    if (!initResult.ok) {
      diagnostics.push({
        id: "E_PARSE_RATIONAL",
        severity: "error",
        message: `The initial token count (init) of channel "${channel.id}" is not a valid number. Received: "${initRaw || "(empty)"}".`,
        where: { channelId: channel.id, field: "init" },
        hint: 'Use a non-negative integer like "0" or "2", or a fraction like "1/2".',
      });
    }

    return {
      id: channel.id,
      src: channel.src,
      dst: channel.dst,
      rateSrc: rateSrcResult.ok ? rateSrcResult.value : rationalZero,
      rateDst: rateDstResult.ok ? rateDstResult.value : rationalZero,
      init: initResult.ok ? initResult.value : rationalZero,
    };
  });

  model.channels.forEach((channel, idx) => {
    if (!actorIds.has(channel.src) || !actorIds.has(channel.dst)) {
      const missing = [!actorIds.has(channel.src) ? channel.src : null, !actorIds.has(channel.dst) ? channel.dst : null].filter(Boolean);
      diagnostics.push({
        id: "E_REF_MISSING",
        severity: "error",
        message: `Channel "${channel.id}" refers to actor(s) that don't exist: ${missing.map(a => `"${a}"`).join(", ")}. Every channel must connect two existing actors.`,
        where: { channelId: channel.id },
        hint: 'Check the "src" and "dst" fields. Make sure each references an actor id defined in the actors list.',
      });
    }

    const parsed = parsedChannels[idx];
    const status = parseStatus[idx];
    if (!parsed || !status) return;

    if (status.rateSrc && status.rateDst) {
      if (compare(parsed.rateSrc, rationalZero) <= 0 || compare(parsed.rateDst, rationalZero) >= 0) {
        diagnostics.push({
          id: "E_RATE_SIGN",
          severity: "error",
          message: `Channel "${channel.id}" has incorrect rate signs. The source rate (rateSrc) must be positive (tokens produced) and the destination rate (rateDst) must be negative (tokens consumed).`,
          where: { channelId: channel.id },
          hint: 'Example: rateSrc = "1" (produces 1 token), rateDst = "-1" (consumes 1 token). Flip the sign if yours are reversed.',
        });
      }

      if (!isInteger(parsed.rateSrc) && !isInteger(parsed.rateDst)) {
        diagnostics.push({
          id: "E_RATE_INTEGER_RULE",
          severity: "error",
          message: `Channel "${channel.id}" has fractional rates on both sides. At least one of the rates (rateSrc or rateDst) must be a whole number.`,
          where: { channelId: channel.id },
          hint: 'Change one of the rates to an integer value. For example, if rateSrc = "1/3", set rateDst to "-1" instead of another fraction.',
        });
      }
    }

    if (status.init) {
      if (compare(parsed.init, rationalZero) < 0) {
        diagnostics.push({
          id: "E_INIT_INVALID",
          severity: "error",
          message: `Channel "${channel.id}" has a negative initial token count, which is not physically meaningful. Tokens represent buffered data between actors.`,
          where: { channelId: channel.id, field: "init" },
          hint: 'Set "init" to "0" or a positive value like "1".',
        });
      }

      if (status.rateSrc && status.rateDst) {
        const maxDen = maxDenominator(parsed.rateSrc, parsed.rateDst);
        const initScaled = mul(parsed.init, { n: maxDen, d: 1n });
        if (!isInteger(initScaled)) {
          diagnostics.push({
            id: "E_INIT_INVALID",
            severity: "error",
            message: `Channel "${channel.id}" initial token count must be a multiple of 1/${maxDen.toString()} to align with the channel's rate granularity.`,
            where: { channelId: channel.id, field: "init" },
            hint: `Valid values include "0", "1/${maxDen.toString()}", "2/${maxDen.toString()}", "1", etc.`,
          });
        }
      }
    }
  });

  return { diagnostics, parsedChannels };
};

const validateActors = (model: PolyGraphModel) => {
  const diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();

  model.actors.forEach((actor) => {
    if (typeof actor.id !== "string" || actor.id.trim().length === 0) {
      diagnostics.push({
        id: "E_TOPOLOGY_INVALID",
        severity: "error",
        message: "An actor is missing its id. Every actor must have a unique, non-empty string identifier.",
        where: { actorId: String(actor.id ?? ""), field: "id" },
        hint: 'Add an "id" field to this actor, e.g. "sensor_1" or "controller".',
      });
    }
    if (typeof actor.id === "string" && seen.has(actor.id)) {
      diagnostics.push({
        id: "E_TOPOLOGY_INVALID",
        severity: "error",
        message: `Multiple actors share the id "${actor.id}". Each actor must have a unique identifier.`,
        where: { actorId: actor.id },
        hint: 'Rename one of the duplicate actors to a distinct id.',
      });
    }
    if (typeof actor.id === "string") {
      seen.add(actor.id);
    }

    if (actor.timed) {
      const hasFreq = actor.freq !== undefined && Number.isFinite(actor.freq) && actor.freq > 0;
      const hasPeriod = actor.period !== undefined && Number.isFinite(actor.period) && actor.period > 0;

      if (!hasFreq && !hasPeriod) {
        diagnostics.push({
          id: "E_TOPOLOGY_INVALID",
          severity: "error",
          message: `Timed actor "${actor.id}" is missing a valid frequency or period. Timed actors fire at regular intervals and need either "freq" (in Hz) or "period" (in ms).`,
          where: { actorId: actor.id, field: "freq" },
          hint: 'Set either "freq" to a positive number (e.g. 100 for 100 Hz) or "period" to a positive number (e.g. 10 for 10 ms).',
        });
      }

      if (actor.freq !== undefined && !Number.isFinite(actor.freq) && actor.freq !== undefined) {
        diagnostics.push({
          id: "E_TOPOLOGY_INVALID",
          severity: "error",
          message: `Timed actor "${actor.id}" has an invalid frequency value. Frequency must be a positive number.`,
          where: { actorId: actor.id, field: "freq" },
          hint: 'Set "freq" to a positive number representing cycles per second, e.g. 100 for 100 Hz.',
        });
      }

      if (actor.period !== undefined && !Number.isFinite(actor.period) && actor.period !== undefined) {
        diagnostics.push({
          id: "E_TOPOLOGY_INVALID",
          severity: "error",
          message: `Timed actor "${actor.id}" has an invalid period value. Period must be a positive number in milliseconds.`,
          where: { actorId: actor.id, field: "period" },
          hint: 'Set "period" to a positive number in milliseconds, e.g. 10 for 10 ms.',
        });
      }

      if (actor.phase !== undefined && actor.phase < 0) {
        diagnostics.push({
          id: "E_TOPOLOGY_INVALID",
          severity: "error",
          message: `Timed actor "${actor.id}" has a negative phase offset (${actor.phase} ms). The phase determines when the actor first fires and cannot be negative.`,
          where: { actorId: actor.id, field: "phase" },
          hint: 'Set "phase" to 0 (fire immediately) or a positive value in milliseconds representing the initial delay, e.g. 20 for 20 ms.',
        });
      }
    }
  });

  return diagnostics;
};

export const verify = (
  model: PolyGraphModel,
  options?: VerifyOptions
): ExecutionResult => {
  const diagnostics: Diagnostic[] = [];

  if (!model || !Array.isArray(model.actors) || !Array.isArray(model.channels)) {
    diagnostics.push({
      id: "E_TOPOLOGY_INVALID",
      severity: "error",
      message: "The model is missing required structure. A valid PolyGraph model must contain both an \"actors\" array and a \"channels\" array.",
      hint: 'Ensure your JSON has the shape: { "actors": [...], "channels": [...] }.',
    });
    return { ok: false, diagnostics };
  }

  diagnostics.push(...validateActors(model));
  const channelParse = parseChannels(model);
  diagnostics.push(...channelParse.diagnostics);

  if (hasErrors(diagnostics)) {
    return { ok: false, diagnostics };
  }

  diagnostics.push({
    id: "I_VALID_MODEL",
    severity: "info",
    message: `Structural validation passed. ${model.actors.length} actor(s) and ${model.channels.length} channel(s) are well-formed.`,
  });

  diagnostics.push(...analyzeGraph(model));

  const topology = buildTopology(
    model,
    channelParse.parsedChannels.map((channel) => ({
      rateSrc: channel.rateSrc,
      rateDst: channel.rateDst,
    }))
  );

  const consistency = checkConsistency(model, topology);
  diagnostics.push(...consistency.diagnostics);

  if (!consistency.ok || !consistency.repetition) {
    return { ok: false, diagnostics };
  }

  diagnostics.push({
    id: "I_CONSISTENT",
    severity: "info",
    message: "Consistency check passed — the model has bounded memory and a valid repetition vector.",
  });

  const liveness = checkLiveness(
    model,
    channelParse.parsedChannels,
    topology,
    consistency.repetition,
    options
  );
  diagnostics.push(...liveness.diagnostics);

  if (!liveness.ok) {
    return { ok: false, diagnostics };
  }

  diagnostics.push({
    id: "I_LIVE",
    severity: "info",
    message: "Liveness check passed — the model is deadlock-free. All actors can complete their required executions.",
  });

  return { ok: true, diagnostics, artifacts: liveness.artifacts };
};

