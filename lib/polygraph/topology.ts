import type { Diagnostic, PolyGraphModel } from "./types";
import type { Rational } from "./rational";
import { fromBigint } from "./rational";

export type Topology = {
  actorIndex: Map<string, number>;
  indexActor: string[];
  adjacency: {
    outgoing: number[][];
    incoming: number[][];
  };
  matrix: Rational[][];
};

export const buildTopology = (
  model: PolyGraphModel,
  rates: Array<{ rateSrc: Rational; rateDst: Rational }>
): Topology => {
  const actorIndex = new Map<string, number>();
  const indexActor: string[] = [];
  model.actors.forEach((actor, idx) => {
    actorIndex.set(actor.id, idx);
    indexActor.push(actor.id);
  });

  const outgoing: number[][] = model.actors.map(() => []);
  const incoming: number[][] = model.actors.map(() => []);

  const matrix: Rational[][] = model.channels.map(() =>
    model.actors.map(() => fromBigint(0n))
  );

  model.channels.forEach((channel, chIdx) => {
    const srcIdx = actorIndex.get(channel.src);
    const dstIdx = actorIndex.get(channel.dst);
    if (srcIdx === undefined || dstIdx === undefined) return;
    outgoing[srcIdx].push(chIdx);
    incoming[dstIdx].push(chIdx);
    matrix[chIdx][srcIdx] = rates[chIdx].rateSrc;
    matrix[chIdx][dstIdx] = rates[chIdx].rateDst;
  });

  return {
    actorIndex,
    indexActor,
    adjacency: { outgoing, incoming },
    matrix,
  };
};

export const analyzeGraph = (model: PolyGraphModel): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  if (model.actors.length === 0) return diagnostics;

  const actorIndex = new Map<string, number>();
  model.actors.forEach((actor, idx) => actorIndex.set(actor.id, idx));

  const undirected: number[][] = model.actors.map(() => []);
  const degrees = model.actors.map(() => 0);

  model.channels.forEach((channel) => {
    const srcIdx = actorIndex.get(channel.src);
    const dstIdx = actorIndex.get(channel.dst);
    if (srcIdx === undefined || dstIdx === undefined) return;
    undirected[srcIdx].push(dstIdx);
    undirected[dstIdx].push(srcIdx);
    degrees[srcIdx] += 1;
    degrees[dstIdx] += 1;
  });

  const visited = new Set<number>();
  let components = 0;

  for (let i = 0; i < model.actors.length; i += 1) {
    if (visited.has(i)) continue;
    components += 1;
    const stack = [i];
    visited.add(i);
    while (stack.length > 0) {
      const node = stack.pop();
      if (node === undefined) continue;
      for (const neighbor of undirected[node]) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          stack.push(neighbor);
        }
      }
    }
  }

  if (components > 1) {
    diagnostics.push({
      id: "W_DISCONNECTED_GRAPH",
      severity: "warn",
      message: `The graph has ${components} disconnected groups of actors. Actors within different groups cannot communicate, which may indicate missing channels.`,
      hint: 'If this is intentional, you can ignore this warning. Otherwise, add channels to connect the separate groups.',
    });
  }

  model.actors.forEach((actor, idx) => {
    if (degrees[idx] === 0) {
      diagnostics.push({
        id: "W_UNUSED_ACTOR",
        severity: "warn",
        message: `Actor "${actor.id}" has no channels connected to it. It is isolated and will not participate in any data flow.`,
        where: { actorId: actor.id },
        hint: 'Connect this actor to at least one channel, or remove it if it is not needed.',
      });
    }
  });

  return diagnostics;
};

