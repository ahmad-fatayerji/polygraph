import type { PolyGraphModel } from "@/lib/polygraph/types";

export type ActorPosition = { x: number; y: number };

export const defaultPosition = (index: number): ActorPosition => ({
  x: 60 + (index % 4) * 180,
  y: 60 + Math.floor(index / 4) * 160,
});

export const buildDefaultPositions = (
  actors: Array<{ id: string }>
): Record<string, ActorPosition> => {
  const positions: Record<string, ActorPosition> = {};
  actors.forEach((actor, index) => {
    positions[actor.id] = defaultPosition(index);
  });
  return positions;
};

/**
 * Compute a clean top-to-bottom hierarchical layout using topological ranking.
 * - Rank = longest path from any source node (no external deps required).
 * - Within each rank, nodes are spread horizontally centered around x=0.
 * - Self-loops and cycle back-edges are skipped so layout always terminates.
 */
export const computeAutoLayout = (
  model: PolyGraphModel
): Record<string, ActorPosition> => {
  const ids = model.actors.map((a) => a.id);
  const idxOf: Record<string, number> = {};
  ids.forEach((id, i) => { idxOf[id] = i; });
  const n = ids.length;
  if (n === 0) return {};

  // Build forward edges (skip self-loops)
  const outEdges: number[][] = Array.from({ length: n }, () => []);
  const inDegree = new Array<number>(n).fill(0);
  for (const ch of model.channels) {
    if (ch.src === ch.dst) continue;
    const s = idxOf[ch.src];
    const d = idxOf[ch.dst];
    if (s === undefined || d === undefined) continue;
    outEdges[s].push(d);
    inDegree[d]++;
  }

  // Kahn's BFS to assign longest-path rank
  const rank = new Array<number>(n).fill(0);
  const inDeg = [...inDegree];
  const queue: number[] = [];
  for (let i = 0; i < n; i++) {
    if (inDeg[i] === 0) queue.push(i);
  }
  while (queue.length > 0) {
    const node = queue.shift()!;
    for (const next of outEdges[node]) {
      rank[next] = Math.max(rank[next], rank[node] + 1);
      inDeg[next]--;
      if (inDeg[next] === 0) queue.push(next);
    }
  }

  // Group nodes by rank
  const byRank: number[][] = [];
  for (let i = 0; i < n; i++) {
    const r = rank[i];
    if (!byRank[r]) byRank[r] = [];
    byRank[r].push(i);
  }

  const nodeW = 200;
  const nodeH = 80;
  const colGap = 40;
  const rowGap = 60;
  const colStep = nodeW + colGap;
  const rowStep = nodeH + rowGap;

  const result: Record<string, ActorPosition> = {};
  for (let r = 0; r < byRank.length; r++) {
    const nodes = byRank[r];
    if (!nodes) continue;
    const totalW = nodes.length * colStep - colGap;
    const startX = -totalW / 2 + nodeW / 2;
    nodes.forEach((nodeIdx, posInRank) => {
      result[ids[nodeIdx]] = {
        x: startX + posInRank * colStep,
        y: r * rowStep,
      };
    });
  }
  return result;
};
