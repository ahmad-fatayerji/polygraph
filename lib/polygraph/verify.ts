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
        message: `Unable to parse rateSrc for channel '${channel.id}'.`,
        where: { channelId: channel.id, field: "rateSrc" },
      });
    }

    if (!rateDstResult.ok) {
      diagnostics.push({
        id: "E_PARSE_RATIONAL",
        severity: "error",
        message: `Unable to parse rateDst for channel '${channel.id}'.`,
        where: { channelId: channel.id, field: "rateDst" },
      });
    }

    if (!initResult.ok) {
      diagnostics.push({
        id: "E_PARSE_RATIONAL",
        severity: "error",
        message: `Unable to parse init for channel '${channel.id}'.`,
        where: { channelId: channel.id, field: "init" },
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
      diagnostics.push({
        id: "E_REF_MISSING",
        severity: "error",
        message: `Channel '${channel.id}' references a missing actor.`,
        where: { channelId: channel.id },
      });
    }
    if (channel.src === channel.dst) {
      diagnostics.push({
        id: "E_TOPOLOGY_INVALID",
        severity: "error",
        message: `Channel '${channel.id}' cannot reference the same actor as src and dst.`,
        where: { channelId: channel.id },
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
          message: `Channel '${channel.id}' rates must be positive for src and negative for dst.`,
          where: { channelId: channel.id },
        });
      }

      if (!isInteger(parsed.rateSrc) && !isInteger(parsed.rateDst)) {
        diagnostics.push({
          id: "E_RATE_INTEGER_RULE",
          severity: "error",
          message: `Channel '${channel.id}' must have an integer rate on src or dst.`,
          where: { channelId: channel.id },
        });
      }
    }

    if (status.init) {
      if (compare(parsed.init, rationalZero) < 0) {
        diagnostics.push({
          id: "E_INIT_INVALID",
          severity: "error",
          message: `Channel '${channel.id}' has a negative initial marking.`,
          where: { channelId: channel.id, field: "init" },
        });
      }

      if (status.rateSrc && status.rateDst) {
        const maxDen = maxDenominator(parsed.rateSrc, parsed.rateDst);
        const initScaled = mul(parsed.init, { n: maxDen, d: 1n });
        if (!isInteger(initScaled)) {
          diagnostics.push({
            id: "E_INIT_INVALID",
            severity: "error",
            message: `Channel '${channel.id}' init must be a multiple of 1/${maxDen.toString()}.`,
            where: { channelId: channel.id, field: "init" },
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
        message: "Actor id must be a non-empty string.",
        where: { actorId: String(actor.id ?? ""), field: "id" },
      });
    }
    if (typeof actor.id === "string" && seen.has(actor.id)) {
      diagnostics.push({
        id: "E_TOPOLOGY_INVALID",
        severity: "error",
        message: `Duplicate actor id '${actor.id}'.`,
        where: { actorId: actor.id },
      });
    }
    if (typeof actor.id === "string") {
      seen.add(actor.id);
    }

    if (actor.timed) {
      if (actor.freq === undefined || !Number.isFinite(actor.freq) || actor.freq <= 0) {
        diagnostics.push({
          id: "E_TOPOLOGY_INVALID",
          severity: "error",
          message: `Timed actor '${actor.id}' must define a positive frequency.`,
          where: { actorId: actor.id, field: "freq" },
        });
      }
      if (actor.phase !== undefined && actor.phase < 0) {
        diagnostics.push({
          id: "E_TOPOLOGY_INVALID",
          severity: "error",
          message: `Timed actor '${actor.id}' must have a non-negative phase.`,
          where: { actorId: actor.id, field: "phase" },
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
      message: "Model must include actors and channels arrays.",
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
    message: "Structural validation passed.",
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
    message: "Consistency check passed.",
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
    message: "Liveness check passed.",
  });

  return { ok: true, diagnostics, artifacts: liveness.artifacts };
};

