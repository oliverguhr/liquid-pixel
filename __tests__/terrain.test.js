const MatchSimulation = require('../MatchSimulation');

function terrain(env) {
  return env.obstacles.map(({ x, y }) => [x, y]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

// Independent four-way traversal, without using the generator or pathfinding code.
function reachableCells(env) {
  const free = env.cells.filter(cell => !cell.obstacle);
  const queue = [free[0]];
  const seen = new Set([free[0].index]);
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const next = env.getCell(cell.x + dx * env.SCALE, cell.y + dy * env.SCALE);
      if (next && !next.obstacle && !seen.has(next.index)) {
        seen.add(next.index);
        queue.push(next);
      }
    }
  }
  return { seen, free };
}

test('the match seed produces reproducible terrain and different seeds vary the map', () => {
  const make = seed => MatchSimulation.create({ ...MatchSimulation.defaults, seed });
  const first = make(123);
  const same = make(123);
  const different = make(42);
  expect(first.obstacles.length).toBeGreaterThan(500);
  expect(terrain(first)).toEqual(terrain(same));
  expect(MatchSimulation.report(first)).toEqual(MatchSimulation.report(same));
  expect(terrain(different)).not.toEqual(terrain(first));
});

test('30 seeded maps are symmetric, fully connected and leave room for both complete swarms', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const env = MatchSimulation.create({ ...MatchSimulation.defaults, seed });
    expect(env.teamCounts()).toEqual([1000, 1000]);
    expect(env.obstacles.length / env.cells.length).toBeGreaterThan(0.01);
    expect(env.obstacles.length / env.cells.length).toBeLessThan(0.2);
    const occupied = new Set(env.obstacles.map(({ x, y }) => `${x},${y}`));
    const mirror = env.teams[0].player.x + env.teams[1].player.x;
    expect(env.obstacles.every(({ x, y }) => occupied.has(`${mirror - x},${y}`))).toBe(true);
    expect(env.obstacles.every(({ x, y }) => x > 0 && y > 0
      && x < env.FIELD_X - env.SCALE && y < env.FIELD_Y - env.SCALE)).toBe(true);
    // Both initially compact 1,000-unit swarms have a clear 90-pixel launch area.
    for (const team of env.teams) {
      expect(env.obstacles.every(({ x, y }) => (x - team.player.x) ** 2 + (y - team.player.y) ** 2 > 90 ** 2)).toBe(true);
    }
    const { seen, free } = reachableCells(env);
    expect(seen.size).toBe(free.length);
    expect(env.particles.every(particle => {
      const cell = env.getCell(particle.x, particle.y);
      return !cell.obstacle && cell.particle === particle && seen.has(cell.index);
    })).toBe(true);
    expect(env.cells.filter(cell => cell.particle)).toHaveLength(2000);
  }
});

test.each([
  [80, 60, 20], [160, 120, 80], [320, 240, 200], [800, 600, 1000],
])('bounded generation works on a %i by %i map with %i units per team', (width, height, particleCount) => {
  const env = MatchSimulation.create({ ...MatchSimulation.defaults, width, height, particleCount, seed: 123 });
  expect(env.teamCounts()).toEqual([particleCount, particleCount]);
  const { seen, free } = reachableCells(env);
  expect(seen.size).toBe(free.length);
  expect(env.obstacles.every(o => o.x % env.SCALE === 0 && o.y % env.SCALE === 0)).toBe(true);
});

test('invalid counts are rejected and excessive requests remain bounded by available cells', () => {
  for (const particleCount of [-1, NaN, Infinity]) {
    expect(() => MatchSimulation.create({ ...MatchSimulation.defaults, width: 16, height: 16, particleCount }))
      .toThrow('particle count');
  }
  const env = MatchSimulation.create({ ...MatchSimulation.defaults, width: 16, height: 16,
    particleCount: Number.MAX_SAFE_INTEGER });
  expect(env.particles).toHaveLength(16);
});
