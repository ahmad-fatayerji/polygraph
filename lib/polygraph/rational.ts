export type Rational = {
  n: bigint;
  d: bigint;
};

const TEN = 10n;

export const rationalZero: Rational = { n: 0n, d: 1n };
export const rationalOne: Rational = { n: 1n, d: 1n };

const abs = (value: bigint) => (value < 0n ? -value : value);

export const gcd = (a: bigint, b: bigint) => {
  let x = abs(a);
  let y = abs(b);
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
};

export const lcm = (a: bigint, b: bigint) => {
  if (a === 0n || b === 0n) return 0n;
  return (abs(a) / gcd(a, b)) * abs(b);
};

export const normalize = (n: bigint, d: bigint): Rational => {
  if (d === 0n) {
    throw new Error("Denominator must be non-zero");
  }
  if (n === 0n) return { n: 0n, d: 1n };
  const sign = d < 0n ? -1n : 1n;
  const g = gcd(n, d);
  return { n: (n / g) * sign, d: abs(d / g) };
};

export const fromBigint = (value: bigint): Rational => ({ n: value, d: 1n });

export const add = (a: Rational, b: Rational): Rational =>
  normalize(a.n * b.d + b.n * a.d, a.d * b.d);

export const sub = (a: Rational, b: Rational): Rational =>
  normalize(a.n * b.d - b.n * a.d, a.d * b.d);

export const mul = (a: Rational, b: Rational): Rational =>
  normalize(a.n * b.n, a.d * b.d);

export const div = (a: Rational, b: Rational): Rational => {
  if (b.n === 0n) throw new Error("Division by zero");
  return normalize(a.n * b.d, a.d * b.n);
};

export const compare = (a: Rational, b: Rational) => {
  const left = a.n * b.d;
  const right = b.n * a.d;
  if (left === right) return 0;
  return left > right ? 1 : -1;
};

export const isZero = (value: Rational) => value.n === 0n;
export const isPositive = (value: Rational) => value.n > 0n;
export const isNegative = (value: Rational) => value.n < 0n;
export const isInteger = (value: Rational) => value.d === 1n;
export const neg = (value: Rational): Rational => ({ n: -value.n, d: value.d });
export const absRational = (value: Rational): Rational => ({ n: abs(value.n), d: value.d });

export const floor = (value: Rational): bigint => {
  if (value.n >= 0n) return value.n / value.d;
  return -((-value.n + value.d - 1n) / value.d);
};

export const toString = (value: Rational): string =>
  value.d === 1n ? value.n.toString() : `${value.n.toString()}/${value.d.toString()}`;

export const parseRational = (raw: string) => {
  const text = raw.trim();
  if (text.length === 0) {
    return { ok: false as const, error: "Empty rational" };
  }

  const parts = text.split("/");
  if (parts.length > 2) {
    return { ok: false as const, error: "Invalid rational format" };
  }

  try {
    if (parts.length === 1) {
      const n = BigInt(parts[0]);
      return { ok: true as const, value: normalize(n, 1n) };
    }

    const n = BigInt(parts[0]);
    const d = BigInt(parts[1]);
    if (d === 0n) {
      return { ok: false as const, error: "Denominator is zero" };
    }
    return { ok: true as const, value: normalize(n, d) };
  } catch {
    return { ok: false as const, error: "Invalid rational format" };
  }
};

const parseDecimal = (text: string): Rational | null => {
  let raw = text.trim();
  if (raw.length === 0) return null;

  let sign = 1n;
  if (raw.startsWith("+")) {
    raw = raw.slice(1);
  } else if (raw.startsWith("-")) {
    sign = -1n;
    raw = raw.slice(1);
  }

  if (raw.length === 0) return null;

  const expIndex = raw.toLowerCase().indexOf("e");
  if (expIndex !== -1) {
    const base = raw.slice(0, expIndex);
    const expPart = raw.slice(expIndex + 1);
    if (expPart.length === 0) return null;
    const exp = Number(expPart);
    if (!Number.isFinite(exp) || !Number.isInteger(exp)) return null;
    const baseRat = parseDecimal(base);
    if (!baseRat) return null;
    const pow = TEN ** BigInt(Math.abs(exp));
    const scaled = exp >= 0 ? mul(baseRat, { n: pow, d: 1n }) : div(baseRat, { n: pow, d: 1n });
    return normalize(scaled.n * sign, scaled.d);
  }

  const dotIndex = raw.indexOf(".");
  if (dotIndex === -1) {
    const n = BigInt(raw);
    return normalize(n * sign, 1n);
  }

  const intPart = raw.slice(0, dotIndex) || "0";
  const fracPart = raw.slice(dotIndex + 1);
  if (!/^\d+$/.test(intPart) || (fracPart.length > 0 && !/^\d+$/.test(fracPart))) {
    return null;
  }
  const digits = `${intPart}${fracPart}`.replace(/^0+(?=\d)/, "");
  const n = digits.length === 0 ? 0n : BigInt(digits);
  const d = TEN ** BigInt(fracPart.length);
  return normalize(n * sign, d);
};

export const parseNumberToRational = (value: number) => {
  if (!Number.isFinite(value)) return null;
  const raw = value.toString();
  return parseDecimal(raw);
};

export const gcdRational = (a: Rational, b: Rational): Rational => {
  if (isZero(a)) return { ...b };
  if (isZero(b)) return { ...a };
  const n = gcd(abs(a.n), abs(b.n));
  const d = lcm(a.d, b.d);
  return normalize(n, d);
};

export const lcmRational = (a: Rational, b: Rational): Rational => {
  if (isZero(a) || isZero(b)) return rationalZero;
  const n = lcm(abs(a.n), abs(b.n));
  const d = gcd(a.d, b.d);
  return normalize(n, d);
};

export const modRational = (value: Rational, modulus: Rational): Rational => {
  if (isZero(modulus)) return value;
  const divRat = div(value, modulus);
  const k = floor(divRat);
  return sub(value, mul(modulus, fromBigint(k)));
};

export const maxDenominator = (a: Rational, b: Rational) =>
  a.d >= b.d ? a.d : b.d;

export const toNumberSafe = (value: bigint) => {
  const num = Number(value);
  if (!Number.isSafeInteger(num)) return null;
  return num;
};

