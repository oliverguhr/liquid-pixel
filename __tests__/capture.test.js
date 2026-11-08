const Environment = require('../Environment');
const Particle = require('../Particle');
const Obstacle = require('../Obstacle');

function seeded(seed = 123) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 0x100000000);
}

function world(options = {}) {
  return new Environment({ graphics: false, width: 80, height: 60, random: seeded(), ...options });
}

function add(env, x, y, team = 0) {
  const particle = new Particle(x, y, env, team);
  env.particles.push(particle);
  return particle;
}

function target(env, team, x, y) {
  env.teams[team].player.setTarget(x, y);
  env.teams[team].player.update();
  env.updateGradient(team);
}

function healthy(env, ids) {
  expect(env.particles.map(p => p.id).sort((a, b) => a - b)).toEqual(ids);
  expect(new Set(env.particles.map(p => `${p.x},${p.y}`)).size).toBe(ids.length);
  expect(env.cells.filter(cell => cell.particle)).toHaveLength(ids.length);
  for (const particle of env.particles) {
    const cell = env.getCell(particle.x, particle.y);
    expect(cell.particle).toBe(particle);
    expect(cell.obstacle).toBe(false);
    expect([0, 1]).toContain(particle.team);
    expect(particle.health).toBeGreaterThanOrEqual(0);
    expect(particle.health).toBeLessThanOrEqual(env.combat.maxHealth);
  }
}

test('repeated frontal contact captures the same particle only below zero health', () => {
  const env = world({ width: 8, height: 4 });
  const attacker = add(env, 0, 0);
  const victim = add(env, 4, 0, 1);
  const id = victim.id;
  victim.health = 32;
  target(env, 0, 4, 0);
  env.resolveContact(attacker);
  expect(victim.health).toBe(16);
  expect(victim.team).toBe(1);
  env.resolveContact(attacker);
  expect(victim.health).toBe(0);
  expect(victim.team).toBe(1);
  env.resolveContact(attacker);
  expect(victim.team).toBe(0);
  expect(victim.health).toBe(34);
  expect(victim.id).toBe(id);
  expect({ x: victim.x, y: victim.y }).toEqual({ x: 4, y: 0 });
  expect(env.combatStats).toEqual({ attacks: 3, heals: 0, conversions: 1 });
  healthy(env, [0, 1]);
});

test('a free alternative takes precedence over attacking an adjacent enemy', () => {
  const env = world();
  const attacker = add(env, 12, 28);
  const victim = add(env, 16, 28, 1);
  target(env, 0, 68, 28);
  env.resolveContact(attacker);
  expect(victim.health).toBe(100);
  attacker.credit = 20;
  expect(attacker.update()).toBe(true);
  expect({ x: attacker.x, y: attacker.y }).not.toEqual({ x: 12, y: 28 });
});

function packedContact() {
  const env = world({ width: 20, height: 20 });
  const attacker = add(env, 8, 8);
  for (const [dx, dy] of env.directions) add(env, 8 + dx * 4, 8 + dy * 4);
  target(env, 0, 16, 8);
  return { env, attacker };
}

test('a side attack is weaker, heals no attacker, and has priority over friendly healing', () => {
  const { env, attacker } = packedContact();
  const main = env.getCell(12, 8).particle;
  const side = env.getCell(12, 4).particle;
  side.team = 1;
  main.health = 50;
  attacker.health = 70;
  env.resolveContact(attacker);
  expect(side.health).toBe(99);
  expect(main.health).toBe(50);
  expect(attacker.health).toBe(70);
});

test('own neighbours heal to the cap without changing team or particle count', () => {
  const { env, attacker } = packedContact();
  const friend = env.getCell(12, 8).particle;
  friend.health = 97;
  env.resolveContact(attacker);
  expect(friend.health).toBe(99);
  env.resolveContact(attacker);
  env.resolveContact(attacker);
  expect(friend.health).toBe(100);
  expect(friend.team).toBe(0);
  expect(env.combatStats.heals).toBe(2);
  healthy(env, [...Array(9).keys()]);
});

test('an enemy behind a fighter is not attacked merely because it is touching', () => {
  const { env, attacker } = packedContact();
  const behind = env.getCell(4, 8).particle;
  behind.team = 1;
  env.resolveContact(attacker);
  expect(behind.health).toBe(100);
  expect(env.combatStats.attacks).toBe(0);
});

test('walls and blocked diagonal corners prevent damage and capture', () => {
  const env = world({ width: 8, height: 8 });
  const attacker = add(env, 0, 0);
  const victim = add(env, 4, 4, 1);
  new Obstacle(env, 4, 0);
  new Obstacle(env, 0, 4);
  env.player.setTarget(4, 4);
  env.teams[1].player.setTarget(0, 0);
  for (let frame = 0; frame < 100; frame++) env.update();
  expect(attacker.team).toBe(0);
  expect(victim.team).toBe(1);
  expect(victim.health).toBe(100);
  expect(env.combatStats.attacks).toBe(0);
  healthy(env, [0, 1]);
});

test.each([0, 1])('team %i can capture; captured units follow the new team target', team => {
  const env = world({ width: 20, height: 4 });
  env.teams[team].stationary = false;
  const attacker = add(env, 0, 0, team);
  const victim = add(env, 4, 0, 1 - team);
  // Block free forward alternatives while capturing, then steer both units away.
  new Obstacle(env, 8, 0);
  target(env, team, 4, 0);
  victim.health = 0;
  env.resolveContact(attacker);
  expect(victim.team).toBe(team);
  env.clearObstacles();
  target(env, team, 16, 0);
  for (let frame = 0; frame < 20; frame++) env.update();
  expect(victim.x).toBeGreaterThan(4);
  expect(env.teamCounts()[team]).toBe(2);
  healthy(env, [0, 1]);
});

test('contact rate does not depend on movement speed or extra microsteps', () => {
  const run = speed => {
    const env = world({ width: 8, height: 4, speed });
    add(env, 0, 0);
    const victim = add(env, 4, 0, 1);
    env.player.setTarget(4, 0);
    env.teams[1].player.setTarget(4, 0);
    for (let frame = 0; frame < 3; frame++) env.update();
    return { health: victim.health, stats: env.combatStats };
  };
  expect(run(80)).toEqual(run(4));
  expect(run(4).health).toBe(52);
});

test('capture scenario keeps the red cloud stationary and replays deterministically', () => {
  const replay = () => {
    const env = world({ width: 240, height: 160, particleCount: 100 });
    env.createCaptureScenario();
    const red = env.particles.filter(p => p.team === 1).map(p => ({ id: p.id, x: p.x, y: p.y }));
    for (let frame = 0; frame < 15; frame++) env.update();
    expect(env.particles.filter(p => p.team === 1).map(p => ({ id: p.id, x: p.x, y: p.y }))).toEqual(red);
    env.player.setTarget(172, 80);
    const ids = env.particles.map(p => p.id);
    for (let frame = 0; frame < 400; frame++) {
      env.update();
      if (frame % 50 === 0) healthy(env, ids);
    }
    expect(env.combatStats.conversions).toBeGreaterThanOrEqual(40);
    expect(env.teamCounts()).toEqual([140, 0]);
    return env.particles.map(({ id, x, y, team, health }) => ({ id, x, y, team, health }));
  };
  expect(replay()).toEqual(replay());
});

test('two teams use independent gradients and both invalidate after terrain changes', () => {
  const env = world();
  target(env, 0, 68, 28);
  target(env, 1, 12, 28);
  const cell = env.getCell(12, 28);
  expect(env.teams[0].distance[cell.index]).toBe(140);
  expect(env.teams[1].distance[cell.index]).toBe(0);
  for (let y = 8; y <= 48; y += 4) new Obstacle(env, 40, y);
  env.updateGradient(0);
  env.updateGradient(1);
  expect(env.teams[0].distance[cell.index]).toBeGreaterThan(140);
  expect(env.teams[1].distance[env.getCell(68, 28).index]).toBeGreaterThan(140);
});

test('scenario spawn respects obstacles and capacity; normal respawn removes both teams', () => {
  const env = world({ width: 16, height: 16, particleCount: 20 });
  new Obstacle(env, 8, 8);
  expect(env.createCaptureScenario().spawned).toBe(15);
  healthy(env, [...Array(15).keys()]);
  env.PARTICLE_COUNT = 3;
  env.createParticles();
  expect(env.teamCounts()).toEqual([3, 0]);
  expect(env.scenario).toBe('free-play');
  expect(env.combatStats).toEqual({ attacks: 0, heals: 0, conversions: 0 });
  healthy(env, [0, 1, 2]);
});
