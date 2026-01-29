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
