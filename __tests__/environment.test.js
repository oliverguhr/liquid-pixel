const Environment = require('../Environment');
const Particle = require('../Particle');
const Obstacle = require('../Obstacle');

function seeded(seed = 123) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 0x100000000);
}

function environment(options = {}) {
  return new Environment({ width: 80, height: 60, scale: 4, speed: 4,
    particleCount: 30, graphics: false, random: seeded(), ...options });
}

function particleAt(env, x, y) {
  const particle = new Particle(x, y, env);
  env.particles.push(particle);
  return particle;
}

function advance(env, frames) {
  for (let frame = 0; frame < frames; frame++) env.update();
}

function expectConsistent(env) {
  expect(new Set(env.particles.map(p => `${p.x},${p.y}`)).size).toBe(env.particles.length);
  expect(env.cells.filter(cell => cell.particle)).toHaveLength(env.particles.length);
  for (const particle of env.particles) {
    const cell = env.getCell(particle.x, particle.y);
    expect(cell.particle).toBe(particle);
    expect(cell.obstacle).toBe(false);
    expect(particle.x % env.SCALE).toBe(0);
    expect(particle.y % env.SCALE).toBe(0);
  }
}

test('both team fields follow added and cleared terrain even when targets stay unchanged', () => {
  const env = environment();
  const targets = [[64, 20], [12, 20]];
  const updateFields = () => env.teams.forEach((team, id) => {
    team.player.setTarget(...targets[id]);
    team.player.update();
    env.updateGradient(id);
  });
  updateFields();
  const open = env.teams.map(team => [...team.distance]);
  for (let y = 0; y < 48; y += 4) new Obstacle(env, 40, y);
  updateFields();
  expect(env.teams[0].distance[env.getCell(12, 20).index]).toBeGreaterThan(open[0][env.getCell(12, 20).index]);
  expect(env.teams[1].distance[env.getCell(64, 20).index]).toBeGreaterThan(open[1][env.getCell(64, 20).index]);
  env.clearObstacles();
  updateFields();
  expect(env.teams.map(team => [...team.distance])).toEqual(open);
});

test('Environment.getCell returns interior, edge and corner cells as map[y][x]', () => {
  const env = environment();
  const lastX = env.FIELD_X - 1;
  const lastY = env.FIELD_Y - 1;
  for (const [x, y] of [
    [17, 29], [0, 29], [lastX, 29], [17, 0], [17, lastY],
    [0, 0], [lastX, 0], [0, lastY], [lastX, lastY],
  ]) expect(env.getCell(x, y)).toBe(env.map[y][x]);
});

test('Environment.getCell rejects out-of-bounds and non-integer coordinates', () => {
  const env = environment();
  for (const [x, y] of [
    [-1, 29], [env.FIELD_X, 29], [17, -1], [17, env.FIELD_Y],
    [-1, -1], [env.FIELD_X, env.FIELD_Y],
    [1.5, 29], [17, 1.5], [NaN, 29], [17, NaN],
    [Infinity, 29], [17, -Infinity],
    [undefined, 29], [17, undefined], ['17', 29], [17, '29'],
  ]) expect(env.getCell(x, y)).toBeUndefined();
});

test('a displayed particle occupies its whole square and cannot be overlapped', () => {
  const env = environment();
  const particle = particleAt(env, 5, 11);
  expect({ x: particle.x, y: particle.y }).toEqual({ x: 4, y: 8 });
  for (let y = 8; y < 12; y++) {
    for (let x = 4; x < 8; x++) expect(env.getCell(x, y).particle).toBe(particle);
  }
  expect(() => new Particle(7, 10, env)).toThrow('free cell');
  expectConsistent(env);
});

test('spawn uses free cells, remains finite when full, and clears old ownership on respawn', () => {
  const env = environment({ width: 16, height: 16, particleCount: 1000 });
  new Obstacle(env, 8, 8);
  new Obstacle(env, 12, 8);
  expect(env.createParticles()).toEqual({ requested: 1000, spawned: 14, available: 14 });
  expectConsistent(env);
  env.PARTICLE_COUNT = 3;
  env.createParticles();
  expect(env.particles).toHaveLength(3);
  expectConsistent(env);
  env.PARTICLE_COUNT = 0;
  env.createParticles();
  expectConsistent(env);
});

test('a completely blocked map safely spawns no particles', () => {
  const env = environment({ width: 8, height: 8 });
  for (const cell of env.cells) new Obstacle(env, cell.x, cell.y);
  expect(env.createParticles().spawned).toBe(0);
  advance(env, 5);
  expect(env.navigationGoals).toEqual([]);
});

test.each([
  ['right edge towards the upper-right corner', 76, 40, 76, 0],
  ['bottom edge towards the lower-left corner', 40, 56, 0, 56],
])('Particle keeps moving along the %s', (_name, x, y, targetX, targetY) => {
  const env = environment();
  const particle = particleAt(env, x, y);
  env.player.setTarget(targetX, targetY);
  advance(env, 2);
  expect(Math.hypot(particle.x - targetX, particle.y - targetY)).toBeLessThan(Math.hypot(x - targetX, y - targetY));
  advance(env, 60);
  expect({ x: particle.x, y: particle.y }).toEqual({ x: targetX, y: targetY });
  expectConsistent(env);
});

test('large movement budgets cannot tunnel through a thin wall', () => {
  const env = environment({ speed: 80 });
  for (let y = 0; y < env.FIELD_Y; y += 4) new Obstacle(env, 40, y);
  const particle = particleAt(env, 12, 28);
  env.player.setTarget(72, 28);
  advance(env, 20);
  expect(particle.x).toBeLessThan(40);
  expect(env.navigationGoals).toHaveLength(2);
  expectConsistent(env);
});

test('two blocked orthogonal cells prevent cutting a diagonal corner', () => {
  const env = environment({ width: 8, height: 8 });
  new Obstacle(env, 4, 0);
  new Obstacle(env, 0, 4);
  const particle = particleAt(env, 0, 0);
  env.player.setTarget(4, 4);
  advance(env, 20);
  expect({ x: particle.x, y: particle.y }).toEqual({ x: 0, y: 0 });
  expect(env.navigationGoals).toHaveLength(2);
  expectConsistent(env);
});

test('a particle follows a longer route around a finite wall', () => {
  const env = environment();
  for (let y = 8; y <= 48; y += 4) new Obstacle(env, 40, y);
  const particle = particleAt(env, 12, 28);
  env.player.setTarget(68, 28);
  env.update();
  const before = env.getCell(12, 28).distance;
  expect(before).toBeGreaterThan((68 - 12) / 4 * 10);
  advance(env, 60);
  expect({ x: particle.x, y: particle.y }).toEqual({ x: 68, y: 28 });
  expectConsistent(env);
});

test('a particle exits a U-shaped obstacle before approaching the cursor', () => {
  const env = environment();
  for (let y = 12; y <= 44; y += 4) {
    new Obstacle(env, 24, y);
    new Obstacle(env, 52, y);
  }
  for (let x = 24; x <= 52; x += 4) new Obstacle(env, x, 44);
  const particle = particleAt(env, 36, 32);
  env.player.setTarget(36, 52);
  advance(env, 70);
  expect({ x: particle.x, y: particle.y }).toEqual({ x: 36, y: 52 });
  expectConsistent(env);
});

test('a blocked target projects onto a free cell and recovers when moved', () => {
  const env = environment();
  new Obstacle(env, 60, 28);
  const particle = particleAt(env, 12, 28);
  env.player.setTarget(60, 28);
  advance(env, 60);
  expect(env.getCell(particle.x, particle.y).distance).toBe(0);
  expect(env.getCell(particle.x, particle.y).obstacle).toBe(false);
  env.player.setTarget(0, 0);
  advance(env, 60);
  expect({ x: particle.x, y: particle.y }).toEqual({ x: 0, y: 0 });
  expectConsistent(env);
});

test('a particle can take an alternative when the best neighbour is occupied', () => {
  const env = environment({ speed: 4 });
  const particle = particleAt(env, 12, 28);
  env.player.setTarget(68, 28);
  env.player.update();
  env.updateGradient();
  // Prepare navigation while the route is free, then change live occupancy.
  // A cached direction must never imply that its destination is still free.
  env.teams[0].stationary = true;
  particle.credit = 20;
  expect(particle.update()).toBe(false);
  env.teams[0].stationary = false;
  particleAt(env, 16, 28);
  particle.credit = 20;
  expect(particle.update()).toBe(true);
  expect(particle.x).toBeGreaterThan(12);
  expectConsistent(env);
});

test.each([0, 1])('team %i reroutes after painting, target changes and clearing previously visited terrain', team => {
  const env = environment();
  const particle = new Particle(12, 20, env, team);
  env.particles.push(particle);
  env.teams[team].player.setTarget(64, 20);
  // Exercise the normal movement loop before the terrain changes.
  env.teams[team].stationary = true;
  advance(env, 8);
  for (let y = 0; y < 48; y += 4) new Obstacle(env, 16, y);
  env.teams[team].stationary = false;
  const arrive = (x, y) => {
    env.teams[team].player.setTarget(x, y);
    for (let step = 0; step < 160; step++) {
      env.updateSubstep();
      expectConsistent(env);
    }
    expect([particle.x, particle.y]).toEqual([x, y]);
  };
  arrive(64, 20);
  arrive(4, 8);
  env.clearObstacles();
  arrive(64, 8);
});

test('painting is continuous, deduplicated and does not overwrite live particles', () => {
  const env = environment({ width: 200, height: 120 });
  const particle = particleAt(env, 100, 60);
  env.paintObstacles(180, 60, { x: 20, y: 60 });
  expect(env.getCell(60, 60).obstacle).toBe(true);
  expect(env.getCell(140, 60).obstacle).toBe(true);
  expect(env.getCell(particle.x, particle.y).obstacle).toBe(false);
  const count = env.obstacles.length;
  env.paintObstacles(180, 60, { x: 20, y: 60 });
  expect(env.obstacles).toHaveLength(count);
  expectConsistent(env);
});

test('geometry edits invalidate the distance field and route around the new obstruction', () => {
  const env = environment();
  const particle = particleAt(env, 12, 28);
  env.player.setTarget(68, 28);
  env.player.update();
  env.updateGradient();
  const before = env.getCell(12, 28).distance;
  for (let y = 8; y <= 48; y += 4) new Obstacle(env, 40, y);
  env.update();
  expect(env.getCell(12, 28).distance).toBeGreaterThan(before);
  advance(env, 60);
  expect({ x: particle.x, y: particle.y }).toEqual({ x: 68, y: 28 });
  expectConsistent(env);
});

test('several target changes conserve particles and ownership for a long run', () => {
  const env = environment();
  env.createParticles();
  for (const [x, y] of [[0, 0], [79, 59], [79, 0], [0, 59], [40, 28]]) {
    env.player.setTarget(x, y);
    for (let frame = 0; frame < 100; frame++) {
      env.update();
      expectConsistent(env);
    }
  }
});

test('a single pixel stops at the cursor instead of oscillating around it', () => {
  const env = environment();
  const particle = particleAt(env, 12, 28);
  env.player.setTarget(36, 28);
  advance(env, 100);
  expect({ x: particle.x, y: particle.y }).toEqual({ x: 36, y: 28 });
  advance(env, 100);
  expect({ x: particle.x, y: particle.y }).toEqual({ x: 36, y: 28 });
});

test('diagonal movement keeps its direction and matches the axis speed', () => {
  const diagonal = environment({ width: 400, height: 400, speed: 8 });
  const axis = environment({ width: 400, height: 400, speed: 8 });
  const diagonalParticle = particleAt(diagonal, 0, 0);
  const axisParticle = particleAt(axis, 0, 0);
  diagonal.player.setTarget(396, 396);
  axis.player.setTarget(396, 0);
  advance(diagonal, 20);
  advance(axis, 20);
  expect(diagonalParticle.x).toBe(diagonalParticle.y);
  expect(Math.abs(Math.hypot(diagonalParticle.x, diagonalParticle.y) - axisParticle.x)).toBeLessThan(6);
});

test('mouse and keyboard targets clamp safely without blocking the cursor cell', () => {
  const env = environment();
  env.player.setTarget(-100, 10000);
  env.update();
  expect({ x: env.player.x, y: env.player.y }).toEqual({ x: 0, y: 56 });
  env.player.dir(1, -1);
  expect({ x: env.player.x, y: env.player.y }).toEqual({ x: 4, y: 52 });
  expect(env.getCell(4, 52).isBlocked()).toBe(false);
  expect(() => env.player.setTarget(NaN, 0)).toThrow('finite');
});

test('seeded mazes preserve occupancy and every microstep respects walls and corners', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const random = seeded(seed);
    const env = environment({ width: 64, height: 48, speed: 12, particleCount: 20, random });
    for (const cell of env.cells) {
      if (random() < 0.3) new Obstacle(env, cell.x, cell.y);
    }
    env.createParticles();
    const move = env.moveParticle.bind(env);
    env.moveParticle = particle => {
      const x = particle.x;
      const y = particle.y;
      const moved = move(particle);
      if (moved) {
        expect(Math.abs(particle.x - x)).toBeLessThanOrEqual(env.SCALE);
        expect(Math.abs(particle.y - y)).toBeLessThanOrEqual(env.SCALE);
        expect(env.getCell(particle.x, particle.y).obstacle).toBe(false);
        if (particle.x !== x && particle.y !== y) {
          expect(env.getCell(particle.x, y).obstacle).toBe(false);
          expect(env.getCell(x, particle.y).obstacle).toBe(false);
        }
      }
      return moved;
    };
    for (let frame = 0; frame < 60; frame++) {
      if (frame % 15 === 0) env.player.setTarget(Math.floor(random() * 64), Math.floor(random() * 48));
      env.update();
      if (frame % 15 === 0) {
        for (const cell of env.cells) {
          if (!cell.obstacle && cell.distance > 0) {
            expect(cell.neighbours.some(neighbour => env.canTraverse(cell, neighbour)
              && neighbour.cell.potential < cell.potential)).toBe(true);
          }
        }
      }
      expectConsistent(env);
    }
  }
});

test('invalid simulation speed is rejected instead of creating an unbounded update loop', () => {
  for (const speed of [-1, NaN, Infinity]) expect(() => environment({ speed })).toThrow('Speed');
});

test('single pixels reach 1800 independently reachable maze targets without cycling', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const random = seeded(seed);
    const env = environment({ width: 40, height: 32, speed: 8, random });
    for (const cell of env.cells) {
      if (random() < 0.32) new Obstacle(env, cell.x, cell.y);
    }
    const free = env.cells.filter(cell => !cell.obstacle);
    for (let sample = 0; sample < 6; sample++) {
      for (const cell of env.cells) cell.particle = undefined;
      env.particles = [];
      env.tick = 0;
      env.nextParticleId = 0;
      const start = free[Math.floor(random() * free.length)];
      // Independent four-way flood fill: an eight-way move with corner
      // clearance cannot connect regions disconnected by these four steps.
      const reachable = [start];
      const visited = new Set([start]);
      for (let head = 0; head < reachable.length; head++) {
        const cell = reachable[head];
        for (const [dx, dy] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) {
          const next = env.getCell(cell.x + dx, cell.y + dy);
          if (next && !next.obstacle && !visited.has(next)) {
            visited.add(next);
            reachable.push(next);
          }
        }
      }
      const target = reachable[Math.floor(random() * reachable.length)];
      const particle = particleAt(env, start.x, start.y);
      env.player.setTarget(target.x, target.y);
      for (let frame = 0; frame < env.cells.length * 4; frame++) {
        env.update();
        if (particle.x === target.x && particle.y === target.y) break;
      }
      expect({ seed, sample, x: particle.x, y: particle.y }).toEqual({
        seed, sample, x: target.x, y: target.y,
      });
    }
  }
});

test('clearing terrain reopens routes and preserves the swarm', () => {
  const env = environment();
  for (let y = 0; y < env.FIELD_Y; y += env.SCALE) new Obstacle(env, 40, y);
  const particle = particleAt(env, 12, 28);
  env.player.setTarget(68, 28);
  advance(env, 40);
  expect(particle.x).toBeLessThan(40);
  env.clearObstacles();
  expect(env.obstacles).toHaveLength(0);
  advance(env, 40);
  expect({ x: particle.x, y: particle.y }).toEqual({ x: 68, y: 28 });
  expectConsistent(env);
});
