const Determinism = require('../Determinism');
const MatchSimulation = require('../MatchSimulation');
const Obstacle = require('../Obstacle');

const config = { ...MatchSimulation.defaults, width: 160, height: 120, particleCount: 80, seed: 42 };

test('integer distance rounds the Euclidean metric consistently in every direction', () => {
  for (let x = 0; x < 200; x++) {
    for (let y = 0; y < 200; y++) {
      const distance = Determinism.distance(x, y);
      const squared = (x * x + y * y) * 1000000;
      // Independent rounding bounds, with quarter units to avoid floating roots.
      expect((2 * distance - 1) ** 2).toBeLessThanOrEqual(squared * 4 + (distance === 0 ? 1 : 0));
      expect((2 * distance + 1) ** 2).toBeGreaterThan(squared * 4);
      expect(Determinism.distance(-y, x)).toBe(distance);
    }
  }
});

test('the shared random generator has a fixed portable sequence', () => {
  const random = Determinism.random(1);
  expect([random(), random(), random()].map(n => n * 0x100000000)).toEqual([1015568748, 1586005467, 2165703038]);
  expect(() => Determinism.random(-1)).toThrow();
});

test('a match starts with equal mobile teams and reproducible positions', () => {
  const first = MatchSimulation.create(config);
  const second = MatchSimulation.create(config);
  expect(first.teamCounts()).toEqual([80, 80]);
  expect(first.teams.every(team => !team.stationary)).toBe(true);
  expect(MatchSimulation.state(first)).toEqual(MatchSimulation.state(second));
  expect(MatchSimulation.report(MatchSimulation.create({ ...config, seed: 43 })).hash)
    .not.toBe(MatchSimulation.report(first).hash);
  expect(() => MatchSimulation.create({ ...config, version: 'old' })).toThrow('version');
});

test('independent worlds agree over 1800 half-steps with terrain, target changes and combat', () => {
  const worlds = [MatchSimulation.create(config), MatchSimulation.create(config)];
  for (const env of worlds) {
    for (let y = 20; y < 100; y += 4) new Obstacle(env, 80, y);
  }
  for (let frame = 1; frame <= 600; frame++) {
    const targets = frame < 100 ? [[116, 60], [116, 60]]
      : frame < 250 ? [[116, 20], [44, 100]]
        : frame < 400 ? [[40, 60], [40, 60]] : [[116, 60], [116, 60]];
    for (const env of worlds) MatchSimulation.applyFrame(env, { tick: frame * 3, steps: 3, targets });
    if (frame % 20 === 0) {
      expect(MatchSimulation.state(worlds[0])).toEqual(MatchSimulation.state(worlds[1]));
      expect(MatchSimulation.report(worlds[0])).toEqual(MatchSimulation.report(worlds[1]));
      expect(worlds[0].particles).toHaveLength(160);
      for (const particle of worlds[0].particles) {
        expect(worlds[0].getCell(particle.x, particle.y).particle).toBe(particle);
        expect(particle.health).toBeGreaterThanOrEqual(0);
      }
    }
  }
  expect(worlds[0].combatStats.conversions).toBeGreaterThan(0);
});

test.each(['health', 'team', 'credit', 'convertedAt'])('checksum includes authoritative particle %s', property => {
  const env = MatchSimulation.create(config);
  const before = MatchSimulation.report(env).hash;
  env.particles[0][property]++;
  expect(MatchSimulation.report(env).hash).not.toBe(before);
});

test('frame ordering is enforced and target changes happen on the specified frame', () => {
  const env = MatchSimulation.create(config);
  const before = MatchSimulation.state(env);
  expect(() => MatchSimulation.applyFrame(env, { tick: 6, steps: 3, targets: [[0, 0], [40, 80]] })).toThrow('order');
  expect(MatchSimulation.state(env)).toEqual(before);
  MatchSimulation.applyFrame(env, { tick: 3, steps: 3, targets: [[0, 0], [40, 80]] });
  expect(env.teams.map(team => [team.player.x, team.player.y])).toEqual([[0, 0], [40, 80]]);
});
