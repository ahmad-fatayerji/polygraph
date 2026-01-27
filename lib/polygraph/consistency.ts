import type { Diagnostic, PolyGraphModel } from "./types";
import type { Rational } from "./rational";
import {
  add,
  compare,
  div,
  fromBigint,
  gcdRational,
  isInteger,
  isZero,
  lcm,
  lcmRational,
  modRational,
  mul,
  parseNumberToRational,
  rationalOne,
  rationalZero,
  sub,
  toNumberSafe,
} from "./rational";
import type { Topology } from "./topology";

export type TimingInfo = {
  baseTick: Rational;
  hyperperiod: Rational;
  tickCount: number;
  significantTicks: number[];
  actorTicks: Map<string, number[]>;
  tVector: bigint[];
};

export type RepetitionVector = {
  vector: bigint[];
  r: bigint;
  timing?: TimingInfo;
};

export type ParsedChannel = {
  id: string;
  src: string;
  dst: string;
  rateSrc: Rational;
  rateDst: Rational;
  init: Rational;
};

const cloneMatrix = (matrix: Rational[][]) =>
  matrix.map((row) => row.map((cell) => ({ ...cell })));

const rref = (matrix: Rational[][]) => {
  const rows = matrix.length;
  const cols = rows > 0 ? matrix[0].length : 0;
  const data = cloneMatrix(matrix);
  const pivotCols: number[] = [];

  let r = 0;
  for (let c = 0; c < cols && r < rows; c += 1) {
    let pivot = r;
    while (pivot < rows && isZero(data[pivot][c])) {
      pivot += 1;
    }
    if (pivot === rows) continue;

    if (pivot !== r) {
      const temp = data[r];
      data[r] = data[pivot];
      data[pivot] = temp;
    }

    const pivotVal = data[r][c];
    data[r] = data[r].map((cell) => div(cell, pivotVal));

    for (let rr = 0; rr < rows; rr += 1) {
      if (rr === r) continue;
      if (isZero(data[rr][c])) continue;
      const factor = data[rr][c];
      data[rr] = data[rr].map((cell, idx) => sub(cell, mul(factor, data[r][idx])));
    }

    pivotCols.push(c);
    r += 1;
  }

  return { data, pivotCols };
};

const nullspaceBasis = (matrix: Rational[][], cols: number) => {
  const rows = matrix.length;
  if (cols === 0) return [];
  if (rows === 0) {
    return Array.from({ length: cols }, (_, idx) => {
      const vec = Array.from({ length: cols }, () => ({ ...rationalZero }));
      vec[idx] = { ...rationalOne };
      return vec;
    });
  }

  const { data, pivotCols } = rref(matrix);
  const pivots = new Set(pivotCols);
  const freeCols: number[] = [];

  for (let c = 0; c < cols; c += 1) {
    if (!pivots.has(c)) freeCols.push(c);
  }

  if (freeCols.length === 0) return [];

  const basis: Rational[][] = [];

  freeCols.forEach((freeCol) => {
    const vec: Rational[] = Array.from({ length: cols }, () => ({ ...rationalZero }));
    vec[freeCol] = { ...rationalOne };
    for (let r = 0; r < rows; r += 1) {
      const pivotCol = pivotCols[r];
      if (pivotCol === undefined) continue;
      vec[pivotCol] = mul({ n: -1n, d: 1n }, data[r][freeCol]);
    }
    basis.push(vec);
  });

  return basis;
};

const combineBasis = (basis: Rational[][], coeffs: bigint[]) => {
  const length = basis[0]?.length ?? 0;
  let vector = Array.from({ length }, () => ({ ...rationalZero }));
  basis.forEach((basisVec, idx) => {
    const coeff = coeffs[idx] ?? 0n;
    if (coeff === 0n) return;
    const scaled = basisVec.map((value) => mul(value, fromBigint(coeff)));
    vector = vector.map((value, i) => add(value, scaled[i]));
  });
  return vector;
};

const scaleToInteger = (vector: Rational[]) => {
  let denom = 1n;
  vector.forEach((value) => {
    denom = lcm(denom, value.d);
  });
  return vector.map((value) => value.n * (denom / value.d));
};

const allZero = (vector: bigint[]) => vector.every((value) => value === 0n);
const allNonNegative = (vector: bigint[]) => vector.every((value) => value >= 0n);
const allNonPositive = (vector: bigint[]) => vector.every((value) => value <= 0n);

const checkTimedRatio = (vector: bigint[], tVector: bigint[]) => {
  let r: bigint | null = null;
  for (let i = 0; i < tVector.length; i += 1) {
    const t = tVector[i];
    if (t === 0n) continue;
    const x = vector[i];
    if (x <= 0n || x % t !== 0n) return null;
    const ratio = x / t;
    if (ratio <= 0n) return null;
    if (r === null) {
      r = ratio;
    } else if (r !== ratio) {
      return null;
    }
  }
  return r;
};

const findRepetitionVector = (
  basis: Rational[][],
  tVector?: bigint[]
): { vector: bigint[]; r: bigint } | null => {
  if (basis.length === 0) return null;

  const maxCoeff = 4n;
  const maxComb = 4000;
  let combos = 0;
  const dimension = basis.length;

  const tryVector = (coeffs: bigint[]) => {
    const candidate = combineBasis(basis, coeffs);
    const scaled = scaleToInteger(candidate);
    if (allZero(scaled)) return null;

    let normalized = scaled;
    if (!allNonNegative(scaled) && allNonPositive(scaled)) {
      normalized = scaled.map((value) => -value);
    }
    if (!allNonNegative(normalized)) return null;

    const r = tVector ? checkTimedRatio(normalized, tVector) : 1n;
    if (tVector && r === null) return null;

    return { vector: normalized, r: tVector ? r! : 1n };
  };

  if (dimension === 1) {
    const direct = tryVector([1n]);
    if (direct) return direct;
    const flipped = tryVector([-1n]);
    if (flipped) return flipped;
  }

  const coeffRange: bigint[] = [];
  for (let i = -maxCoeff; i <= maxCoeff; i += 1n) {
    coeffRange.push(i);
  }

  const recurse = (depth: number, current: bigint[]): { vector: bigint[]; r: bigint } | null => {
    if (combos > maxComb) return null;
    if (depth === dimension) {
      if (current.every((value) => value === 0n)) return null;
      combos += 1;
      return tryVector(current);
    }

    for (const value of coeffRange) {
      current[depth] = value;
      const result = recurse(depth + 1, current);
      if (result) return result;
    }

    return null;
  };

  return recurse(0, new Array(dimension).fill(0n));
};

export const computeTimingInfo = (
  model: PolyGraphModel,
  diagnostics: Diagnostic[]
): TimingInfo | undefined => {
  const timedActors = model.actors.filter((actor) => actor.timed);
  if (timedActors.length === 0) return undefined;

  const periods: Rational[] = [];
  const phases: Rational[] = [];
  const actorPeriods = new Map<string, Rational>();
  const actorPhases = new Map<string, Rational>();

  timedActors.forEach((actor) => {
    if (actor.freq === undefined) {
      diagnostics.push({
        id: "E_TOPOLOGY_INVALID",
        severity: "error",
        message: `Timed actor '${actor.id}' is missing a frequency.`,
        where: { actorId: actor.id, field: "freq" },
      });
      return;
    }
    const freq = parseNumberToRational(actor.freq);
    if (!freq || compare(freq, rationalZero) <= 0) {
      diagnostics.push({
        id: "E_TOPOLOGY_INVALID",
        severity: "error",
        message: `Timed actor '${actor.id}' has an invalid frequency.`,
      });
      return;
    }
    const period = div(rationalOne, freq);
    const phaseValue = actor.phase ?? 0;
    const phaseRat = parseNumberToRational(phaseValue);
    if (!phaseRat || compare(phaseRat, rationalZero) < 0) {
      diagnostics.push({
        id: "E_TOPOLOGY_INVALID",
        severity: "error",
        message: `Timed actor '${actor.id}' has an invalid phase.`,
        where: { actorId: actor.id, field: "phase" },
      });
      return;
    }

    const normalizedPhase = modRational(phaseRat, period);
    periods.push(period);
    if (!isZero(normalizedPhase)) phases.push(normalizedPhase);
    actorPeriods.set(actor.id, period);
    actorPhases.set(actor.id, normalizedPhase);
  });

  if (diagnostics.some((diag) => diag.severity === "error")) return undefined;

  let baseTick = periods[0] ?? rationalOne;
  for (let i = 1; i < periods.length; i += 1) {
    baseTick = gcdRational(baseTick, periods[i]);
  }
  phases.forEach((phase) => {
    baseTick = gcdRational(baseTick, phase);
  });

  let hyperperiod = periods[0] ?? rationalOne;
  for (let i = 1; i < periods.length; i += 1) {
    hyperperiod = lcmRational(hyperperiod, periods[i]);
  }

  const tickCountRat = div(hyperperiod, baseTick);
  if (!isInteger(tickCountRat)) {
    diagnostics.push({
      id: "E_TOPOLOGY_INVALID",
      severity: "error",
      message: "Timing tick grid is not integral.",
    });
    return undefined;
  }

  const tickCount = toNumberSafe(tickCountRat.n);
  if (tickCount === null) {
    diagnostics.push({
      id: "E_TOPOLOGY_INVALID",
      severity: "error",
      message: "Hyperperiod tick count exceeds safe integer limits.",
    });
    return undefined;
  }

  const tVector = model.actors.map(() => 0n);
  const actorTicks = new Map<string, number[]>();
  const significantTicks = new Set<number>();

  timedActors.forEach((actor) => {
    const period = actorPeriods.get(actor.id);
    const phase = actorPhases.get(actor.id);
    if (!period || !phase) return;

    const fireCountRat = div(hyperperiod, period);
    if (!isInteger(fireCountRat) || fireCountRat.n <= 0n) {
      diagnostics.push({
        id: "E_TOPOLOGY_INVALID",
        severity: "error",
        message: `Timed actor '${actor.id}' does not align with hyperperiod.`,
      });
      return;
    }

    const count = fireCountRat.n;
    const ticks: number[] = [];
    for (let i = 0n; i < count; i += 1n) {
      const time = add(phase, mul(period, fromBigint(i)));
      const tickRat = div(time, baseTick);
      if (!isInteger(tickRat)) {
        diagnostics.push({
          id: "E_TOPOLOGY_INVALID",
          severity: "error",
          message: `Timed actor '${actor.id}' does not align to integer ticks.`,
        });
        return;
      }
      const tickNumber = toNumberSafe(tickRat.n);
      if (tickNumber === null) {
        diagnostics.push({
          id: "E_TOPOLOGY_INVALID",
          severity: "error",
          message: `Timed actor '${actor.id}' tick exceeds safe integer limits.`,
        });
        return;
      }
      const normalizedTick = tickNumber % tickCount;
      ticks.push(normalizedTick);
      significantTicks.add(normalizedTick);
    }

    const actorIdx = model.actors.findIndex((item) => item.id === actor.id);
    if (actorIdx >= 0) tVector[actorIdx] = count;
    actorTicks.set(actor.id, Array.from(new Set(ticks)).sort((a, b) => a - b));
  });

  if (diagnostics.some((diag) => diag.severity === "error")) return undefined;

  return {
    baseTick,
    hyperperiod,
    tickCount,
    significantTicks: Array.from(significantTicks).sort((a, b) => a - b),
    actorTicks,
    tVector,
  };
};

export const checkConsistency = (
  model: PolyGraphModel,
  topology: Topology
) => {
  const diagnostics: Diagnostic[] = [];
  const timing = computeTimingInfo(model, diagnostics);
  if (diagnostics.some((diag) => diag.severity === "error")) {
    return { ok: false, diagnostics };
  }

  const tVector = timing?.tVector;

  if (topology.matrix.length === 0) {
    if (model.actors.length === 0) {
      diagnostics.push({
        id: "E_INCONSISTENT",
        severity: "error",
        message: "Model has no actors to form a repetition vector.",
      });
      return { ok: false, diagnostics };
    }
    const baseVector =
      tVector && tVector.some((value) => value > 0n)
        ? tVector.map((value) => value)
        : model.actors.map(() => 1n);
    const r = tVector ? checkTimedRatio(baseVector, tVector) : 1n;
    if (tVector && r === null) {
      diagnostics.push({
        id: "E_INCONSISTENT",
        severity: "error",
        message: "Timed repetition constraints cannot be satisfied without channels.",
      });
      return { ok: false, diagnostics };
    }
    return {
      ok: true,
      diagnostics,
      repetition: {
        vector: baseVector,
        r: tVector ? r! : 1n,
        timing,
      } as RepetitionVector,
    };
  }

  const basis = nullspaceBasis(topology.matrix, model.actors.length);
  const solution = findRepetitionVector(basis, tVector);

  if (!solution) {
    diagnostics.push({
      id: "E_INCONSISTENT",
      severity: "error",
      message: "No non-zero repetition vector satisfies Gamma * x = 0 and timing constraints.",
    });
    return { ok: false, diagnostics };
  }

  return {
    ok: true,
    diagnostics,
    repetition: {
      vector: solution.vector,
      r: solution.r,
      timing,
    } as RepetitionVector,
  };
};
