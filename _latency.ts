import { verify } from './lib/polygraph/verify';
import { readFileSync } from 'fs';

const model = JSON.parse(readFileSync('public/px4-image-model.json', 'utf8'));
const result = verify(model, { computeExecution: true, cycles: 1 });

if (!result.ok || !result.artifacts?.schedule) {
  console.log('Model not live, cannot compute latency.');
  process.exit(1);
}

const schedule = result.artifacts.schedule;
const tickCount = result.artifacts.hyperperiod!.tickCount; // 40
const baseTick_ms = 2.5; // GCD of all periods

// Build: for each actor, the list of ticks where it fires
const actorTicks = new Map<string, number[]>();
for (const step of schedule) {
  for (const actorId of step.fires) {
    if (!actorTicks.has(actorId)) actorTicks.set(actorId, []);
    actorTicks.get(actorId)!.push(step.tick);
  }
}

// Define critical paths to analyze
const paths = [
  {
    name: "Rate control (fast loop)",
    chain: ["imu", "vehicle_angular_velocity", "mc_rate_control", "control_allocator", "pwm_pca9685", "esc_motors"],
  },
  {
    name: "Full pipeline (sensor → actuator via EKF2)",
    chain: ["imu", "sensors", "ekf2", "mc_pos_control", "mc_att_control", "mc_rate_control", "control_allocator", "pwm_pca9685", "esc_motors"],
  },
  {
    name: "Navigation path",
    chain: ["imu", "sensors", "ekf2", "navigator", "flight_mode_manager", "mc_pos_control", "mc_att_control", "mc_rate_control", "control_allocator", "pwm_pca9685"],
  },
];

/**
 * For a chain [A, B, C, ...], compute worst-case end-to-end latency:
 * For each firing of A, find the earliest firing of B at tick >= tick_A,
 * then earliest firing of C at tick >= tick_B, etc.
 * The latency = tick_last - tick_A.
 * The worst case is the max over all firings of A.
 * 
 * We wrap around the hyperperiod (duplicate ticks shifted by +tickCount).
 */
function computeLatency(chain: string[]): { worst: number; best: number; all: number[] } | null {
  // Extended ticks (2 hyperperiods to handle wrap-around)
  const extTicks = new Map<string, number[]>();
  for (const id of chain) {
    const ticks = actorTicks.get(id);
    if (!ticks) return null;
    extTicks.set(id, [...ticks, ...ticks.map(t => t + tickCount)]);
  }

  const firstActor = chain[0];
  const latencies: number[] = [];

  for (const startTick of actorTicks.get(firstActor)!) {
    let currentTick = startTick;
    let ok = true;

    for (let i = 1; i < chain.length; i++) {
      const nextTicks = extTicks.get(chain[i])!;
      // Find earliest tick >= currentTick for the next actor
      // (strict > if same actor could appear twice, but here we use >=
      //  because the next actor fires AFTER in the same tick due to index order)
      const nextTick = nextTicks.find(t => t >= currentTick);
      if (nextTick === undefined) { ok = false; break; }
      currentTick = nextTick;
    }

    if (ok) {
      latencies.push(currentTick - startTick);
    }
  }

  if (latencies.length === 0) return null;
  return {
    worst: Math.max(...latencies),
    best: Math.min(...latencies),
    all: latencies,
  };
}

console.log(`Hyperperiod: ${tickCount} ticks = ${tickCount * baseTick_ms} ms`);
console.log(`Base tick: ${baseTick_ms} ms\n`);

for (const path of paths) {
  console.log(`=== ${path.name} ===`);
  console.log(`  Chain: ${path.chain.join(' → ')}`);
  const lat = computeLatency(path.chain);
  if (!lat) {
    console.log(`  ERROR: some actor not found in schedule\n`);
    continue;
  }
  console.log(`  Worst-case: ${lat.worst} ticks = ${lat.worst * baseTick_ms} ms`);
  console.log(`  Best-case:  ${lat.best} ticks = ${lat.best * baseTick_ms} ms`);
  
  // Histogram
  const hist = new Map<number, number>();
  for (const l of lat.all) hist.set(l, (hist.get(l) || 0) + 1);
  const sorted = [...hist.entries()].sort((a, b) => a[0] - b[0]);
  console.log(`  Distribution:`);
  for (const [ticks, count] of sorted) {
    console.log(`    ${ticks} ticks (${ticks * baseTick_ms} ms): ${count}x`);
  }
  console.log();
}
