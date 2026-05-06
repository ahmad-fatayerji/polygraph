import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type GridRow = {
  freqHz: string;
  wcetMs: string;
  feasible: "yes" | "no";
  selectedPhaseMs: string;
  c1RateDst: string;
  c1Init: string;
  c2RateSrc: string;
  c2Init: string;
  selectedCriticalPathThroughCnnMs: string;
  selectedCriticalPathExecutionThroughCnnMs: string;
  firstErrorId: string;
};

type FrontierRow = {
  freqHz: string;
  maxFeasibleWcetMs: string;
  minInfeasibleWcetMs: string;
  feasibleCount: string;
  infeasibleCount: string;
  selectedPhaseMs: string;
  c1RateDst: string;
  c1Init: string;
  c2RateSrc: string;
  c2Init: string;
  selectedCriticalPathThroughCnnMs: string;
  selectedCriticalPathExecutionThroughCnnMs: string;
};

const USAGE = `
Extract a faithful discrete WCET-vs-frequency frontier from an exhaustive grid CSV.

Usage:
  npx tsx scripts/extract-cnn-faithful-frontier.ts [options]

Options:
  --grid PATH   Input grid CSV (default: analysis/cnn-only-grid.csv)
  --out PATH    Output frontier CSV (default: analysis/cnn-only-frontier-faithful.csv)
  --help        Show this help
`;

type Rational = {
  n: bigint;
  d: bigint;
};

const fail = (message: string): never => {
  throw new Error(message);
};

const gcd = (a: bigint, b: bigint): bigint => {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
};

const parseRational = (raw: string): Rational => {
  const text = raw.trim();
  if (text.length === 0) fail("Empty rational value.");

  if (text.includes("/")) {
    const [nText, dText] = text.split("/");
    const n = BigInt(nText);
    const d = BigInt(dText);
    if (d === 0n) fail(`Invalid rational denominator: ${raw}`);
    const sign = d < 0n ? -1n : 1n;
    const g = gcd(n, d);
    return {
      n: (n / g) * sign,
      d: (d / g) * sign,
    };
  }

  if (text.includes(".")) {
    const negative = text.startsWith("-");
    const unsigned = negative ? text.slice(1) : text;
    const [intPart, fracPart] = unsigned.split(".");
    const scale = 10n ** BigInt(fracPart.length);
    const n = BigInt(intPart + fracPart);
    const signed = negative ? -n : n;
    const g = gcd(signed, scale);
    return { n: signed / g, d: scale / g };
  }

  return { n: BigInt(text), d: 1n };
};

const compareRational = (left: Rational, right: Rational): number => {
  const lhs = left.n * right.d;
  const rhs = right.n * left.d;
  if (lhs < rhs) return -1;
  if (lhs > rhs) return 1;
  return 0;
};

const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === "\"") {
        if (text[i + 1] === "\"") {
          cell += "\"";
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === "\"") {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
};

const loadGridRows = (csvPath: string): GridRow[] => {
  const text = readFileSync(csvPath, "utf8");
  const rows = parseCsv(text);
  if (rows.length === 0) return [];

  const header = rows[0];
  const result: GridRow[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const values = rows[i];
    if (values.length === 1 && values[0].trim().length === 0) continue;
    const entry = Object.fromEntries(header.map((key, idx) => [key, values[idx] ?? ""])) as GridRow;
    result.push(entry);
  }
  return result;
};

const csvEscape = (value: string) => {
  if (!value.includes(",") && !value.includes("\n") && !value.includes("\"")) {
    return value;
  }
  return `"${value.replace(/\"/g, "\"\"")}"`;
};

const toCsv = <T extends Record<string, string>>(rows: T[], headers: Array<keyof T>) => {
  const headerLine = headers.join(",");
  const body = rows
    .map((row) => headers.map((header) => csvEscape(row[header])).join(","))
    .join("\n");
  return body.length > 0 ? `${headerLine}\n${body}\n` : `${headerLine}\n`;
};

const extractFrontier = (gridRows: GridRow[]): FrontierRow[] => {
  const skipped = gridRows.filter((row) => row.firstErrorId.includes("skipped: WCET monotonicity"));
  if (skipped.length > 0) {
    fail(
      `Grid CSV is not exhaustive: found ${skipped.length} rows skipped by WCET monotonicity. ` +
        `Rerun the sweep with --monotonic-early-exit false.`
    );
  }

  const byFreq = new Map<string, GridRow[]>();
  for (const row of gridRows) {
    const items = byFreq.get(row.freqHz);
    if (items) items.push(row);
    else byFreq.set(row.freqHz, [row]);
  }

  return [...byFreq.entries()]
    .sort((left, right) => compareRational(parseRational(left[0]), parseRational(right[0])))
    .map(([freqHz, rows]) => {
      const sorted = [...rows].sort((left, right) =>
        compareRational(parseRational(left.wcetMs), parseRational(right.wcetMs))
      );
      const feasible = sorted.filter((row) => row.feasible === "yes");
      const infeasible = sorted.filter((row) => row.feasible === "no");
      const bestFeasible = feasible.at(-1);
      const firstAbove = bestFeasible
        ? sorted.find(
            (row) =>
              compareRational(parseRational(row.wcetMs), parseRational(bestFeasible.wcetMs)) > 0 &&
              row.feasible === "no"
          )
        : infeasible[0];

      return {
        freqHz,
        maxFeasibleWcetMs: bestFeasible?.wcetMs ?? "",
        minInfeasibleWcetMs: firstAbove?.wcetMs ?? "",
        feasibleCount: feasible.length.toString(),
        infeasibleCount: infeasible.length.toString(),
        selectedPhaseMs: bestFeasible?.selectedPhaseMs ?? "",
        c1RateDst: bestFeasible?.c1RateDst ?? "",
        c1Init: bestFeasible?.c1Init ?? "",
        c2RateSrc: bestFeasible?.c2RateSrc ?? "",
        c2Init: bestFeasible?.c2Init ?? "",
        selectedCriticalPathThroughCnnMs:
          bestFeasible?.selectedCriticalPathThroughCnnMs ?? "",
        selectedCriticalPathExecutionThroughCnnMs:
          bestFeasible?.selectedCriticalPathExecutionThroughCnnMs ?? "",
      };
    });
};

const parseArgs = (argv: string[]) => {
  const argMap = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    if (key === "help") {
      console.log(USAGE.trim());
      process.exit(0);
    }
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) fail(`Missing value for --${key}`);
    argMap.set(key, next);
    i += 1;
  }

  return {
    grid: argMap.get("grid") ?? "analysis/cnn-only-grid.csv",
    out: argMap.get("out") ?? "analysis/cnn-only-frontier-faithful.csv",
  };
};

const run = () => {
  const args = parseArgs(process.argv.slice(2));
  const gridPath = path.resolve(process.cwd(), args.grid);
  const outPath = path.resolve(process.cwd(), args.out);
  const rows = loadGridRows(gridPath);
  const frontier = extractFrontier(rows);

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(
    outPath,
    toCsv(frontier, [
      "freqHz",
      "maxFeasibleWcetMs",
      "minInfeasibleWcetMs",
      "feasibleCount",
      "infeasibleCount",
      "selectedPhaseMs",
      "c1RateDst",
      "c1Init",
      "c2RateSrc",
      "c2Init",
      "selectedCriticalPathThroughCnnMs",
      "selectedCriticalPathExecutionThroughCnnMs",
    ]),
    "utf8"
  );

  console.log(`Loaded ${rows.length} grid rows from ${gridPath}`);
  console.log(`Wrote ${frontier.length} faithful frontier rows to ${outPath}`);
};

run();
