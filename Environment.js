const EnvironmentCell = typeof module !== 'undefined' ? require('./Cell') : Cell;
const EnvironmentPlayer = typeof module !== 'undefined' ? require('./Player') : Player;
const EnvironmentParticle = typeof module !== 'undefined' ? require('./Particle') : Particle;
const EnvironmentObstacle = typeof module !== 'undefined' ? require('./Obstacle') : Obstacle;
const EnvironmentMath = typeof module !== 'undefined' ? require('./Determinism') : Determinism;

// Integer costs: ten for an axis step, fourteen for a diagonal.
class NavigationQueue {
  constructor() { this.entries = []; }

  push(cell, distance) {
    const entry = { cell, distance };
    let index = this.entries.length;
    this.entries.push(entry);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.entries[parent].distance <= distance) break;
      this.entries[index] = this.entries[parent];
      index = parent;
    }
    this.entries[index] = entry;
  }

  pop() {
    const first = this.entries[0];
    const last = this.entries.pop();
    if (this.entries.length) {
      let index = 0;
      while (index * 2 + 1 < this.entries.length) {
        let child = index * 2 + 1;
        if (child + 1 < this.entries.length
            && this.entries[child + 1].distance < this.entries[child].distance) child++;
        if (this.entries[child].distance >= last.distance) break;
        this.entries[index] = this.entries[child];
        index = child;
      }
      this.entries[index] = last;
    }
    return first;
  }
}

class Environment {
  constructor(options = {}) {
    this.FIELD_X = options.width ?? 800;
    this.FIELD_Y = options.height ?? 800;
    this.SCALE = options.scale ?? 4;
    this.SPEED = options.speed ?? 8;
    this.PARTICLE_COUNT = options.particleCount ?? 1000;
    for (const value of [this.FIELD_X, this.FIELD_Y, this.SCALE]) {
      if (!Number.isInteger(value) || value < 1) throw new RangeError('Field dimensions and scale must be positive integers');
    }
    if (this.FIELD_X % this.SCALE || this.FIELD_Y % this.SCALE) {
      throw new RangeError('Field dimensions must be multiples of scale');
    }
    if (!Number.isFinite(this.SPEED) || this.SPEED < 0) throw new RangeError('Speed must be finite and nonnegative');
    this.random = options.random ?? (typeof random === 'function' ? () => random() : Math.random);
    const graphics = options.graphics !== false && typeof createGraphics === 'function';
    this.background = graphics ? createGraphics(this.FIELD_X, this.FIELD_Y) : null;
    this.foreground = graphics ? createGraphics(this.FIELD_X, this.FIELD_Y) : null;
    this.columns = this.FIELD_X / this.SCALE;
    this.rows = this.FIELD_Y / this.SCALE;
    this.cells = Array.from({ length: this.rows * this.columns }, (_, index) =>
      new EnvironmentCell(index % this.columns * this.SCALE, Math.floor(index / this.columns) * this.SCALE, index));
    // All pixels in a displayed square share its occupancy and obstacle state.
    this.map = Array.from({ length: this.FIELD_Y }, (_, y) =>
      Array.from({ length: this.FIELD_X }, (_, x) => this.cells[
        Math.floor(y / this.SCALE) * this.columns + Math.floor(x / this.SCALE)]));
    this.directions = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
    for (const cell of this.cells) {
      for (let direction = 0; direction < this.directions.length; direction++) {
        const [dx, dy] = this.directions[direction];
        const next = this.getCell(cell.x + dx * this.SCALE, cell.y + dy * this.SCALE);
        if (next) cell.neighbours.push({ cell: next, dx, dy, direction, cost: dx && dy ? 14 : 10 });
      }
    }
    this.player = new EnvironmentPlayer(this);
    this.teams = [this.player, new EnvironmentPlayer(this)].map((player, id) => ({
      id, player, stationary: id === 1, gradientTarget: '',
      distance: new Float64Array(this.cells.length),
      potential: new Float64Array(this.cells.length), navigationGoals: [],
      movementCache: new Array(this.cells.length),
    }));
    // One contact action per logical frame, independently of movement speed.
    this.combat = Object.freeze({ maxHealth: 100, attack: 16, heal: 2, conversionHealth: 50 });
    this.combatStats = { attacks: 0, heals: 0, conversions: 0 };
    this.scenario = 'free-play';
    this.particles = [];
    this.obstacles = [];
    this.components = [];
    this.navigationGoals = [];
    this.geometryDirty = true;
    this.backgroundDirty = true;
    this.tick = 0;
    this.nextParticleId = 0;
    this.running = false;
  }

  init() {
    this.backgroundDirty = true;
    this.show();
  }

  getCell(x, y) {
    if (Number.isInteger(x) && Number.isInteger(y)
        && x >= 0 && y >= 0 && x < this.FIELD_X && y < this.FIELD_Y) return this.map[y][x];
    return undefined;
  }

  createParticles() {
    if (!Number.isInteger(this.PARTICLE_COUNT) || this.PARTICLE_COUNT < 0) throw new RangeError('Invalid particle count');
    this.clearParticles();
    this.scenario = 'free-play';
    this.spawnInfo = this.spawnSwarm(0, this.PARTICLE_COUNT, this.FIELD_X / 2, this.FIELD_Y / 2);
    return this.spawnInfo;
  }

  clearParticles() {
    for (const cell of this.cells) cell.particle = undefined;
    this.particles = [];
    this.nextParticleId = 0;
    this.combatStats = { attacks: 0, heals: 0, conversions: 0 };
  }

  spawnSwarm(team, count, centerX, centerY) {
    if (!this.teams[team]) throw new RangeError('Unknown particle team');
    if (!Number.isInteger(count) || count < 0) throw new RangeError('Invalid particle count');
    if (![centerX, centerY].every(Number.isFinite)) throw new RangeError('Invalid spawn position');
    const free = this.cells.filter(cell => !cell.isBlocked());
    // Seeded tie-breaking, then compact placement around the center.
    for (let index = free.length - 1; index > 0; index--) {
      const other = Math.floor(this.random() * (index + 1));
      [free[index], free[other]] = [free[other], free[index]];
    }
    const distance = cell => (cell.x - centerX) ** 2 + (cell.y - centerY) ** 2;
    free.sort((a, b) => distance(a) - distance(b));
    const spawned = Math.min(count, free.length);
    for (let index = 0; index < spawned; index++) {
      const cell = free[index];
      this.particles.push(new EnvironmentParticle(cell.x, cell.y, this, team));
    }
    return { requested: count, spawned, available: free.length };
  }

  createCaptureScenario() {
    this.clearParticles();
    this.scenario = 'capture';
    const y = Math.floor(this.FIELD_Y / 2 / this.SCALE) * this.SCALE;
    const left = Math.floor(this.FIELD_X * 0.28 / this.SCALE) * this.SCALE;
    const right = Math.floor(this.FIELD_X * 0.72 / this.SCALE) * this.SCALE;
    this.player.setTarget(left, y);
    this.teams[1].player.setTarget(right, y);
    this.teams[1].stationary = true;
    const blue = this.spawnSwarm(0, this.PARTICLE_COUNT, left, y);
    const red = this.spawnSwarm(1, Math.floor(this.PARTICLE_COUNT * 0.4), right, y);
    this.spawnInfo = { requested: blue.requested + red.requested, spawned: blue.spawned + red.spawned,
      available: blue.available };
    this.running = true;
    return this.spawnInfo;
  }

  teamCounts() {
    const counts = this.teams.map(() => 0);
    for (const particle of this.particles) counts[particle.team]++;
    return counts;
  }

  canTraverse(from, neighbour) {
    if (neighbour.cell.obstacle) return false;
    if (neighbour.dx && neighbour.dy) {
      return !this.getCell(from.x + neighbour.dx * this.SCALE, from.y).obstacle
        && !this.getCell(from.x, from.y + neighbour.dy * this.SCALE).obstacle;
    }
    return true;
  }

  updateComponents() {
    for (const team of this.teams) team.gradientTarget = '';
    for (const cell of this.cells) {
      cell.component = -1;
      // Terrain changes invalidate these links; moving particles do not.
      cell.walkableNeighbours = cell.neighbours.filter(neighbour => this.canTraverse(cell, neighbour));
    }
    this.components = [];
    for (const start of this.cells) {
      if (start.obstacle || start.component !== -1) continue;
      const component = this.components.length;
      const queue = [start];
      start.component = component;
      for (let head = 0; head < queue.length; head++) {
        const cell = queue[head];
        for (const neighbour of cell.walkableNeighbours) {
          if (neighbour.cell.component === -1) {
            neighbour.cell.component = component;
            queue.push(neighbour.cell);
          }
        }
      }
      this.components.push(queue);
    }
  }

  updateGradient(teamId = 0) {
    const team = this.teams[teamId];
    const target = this.getCell(team.player.x, team.player.y);
    const key = `${target.index}`;
    if (!this.geometryDirty && key === team.gradientTarget) return;
    if (this.geometryDirty) this.updateComponents();
    this.geometryDirty = false;
    team.gradientTarget = key;
    team.movementCache = new Array(this.cells.length);
    const { distance: distances, potential: potentials } = team;
    distances.fill(Infinity);
    potentials.fill(Infinity);
    const queue = new NavigationQueue();
    team.navigationGoals = [];
    for (let component = 0; component < this.components.length; component++) {
      const cells = this.components[component];
      let goal = target;
      // In its own component, a free target is already the nearest cell.
      if (target.component !== component) {
        goal = cells[0];
        let minimum = Infinity;
        for (const cell of cells) {
          const distance = (cell.x - target.x) ** 2 + (cell.y - target.y) ** 2;
          if (distance < minimum || (distance === minimum && cell.index < goal.index)) {
            minimum = distance;
            goal = cell;
          }
        }
      }
      distances[goal.index] = 0;
      team.navigationGoals.push({ component, x: goal.x, y: goal.y });
      queue.push(goal, 0);
    }
    while (queue.entries.length) {
      const { cell, distance } = queue.pop();
      if (distance !== distances[cell.index]) continue;
      for (const neighbour of cell.walkableNeighbours) {
        if (distance + neighbour.cost < distances[neighbour.cell.index]) {
          distances[neighbour.cell.index] = distance + neighbour.cost;
          queue.push(neighbour.cell, distances[neighbour.cell.index]);
        }
      }
    }
    // Retain obstacle detours, but remove the grid's angular error in open space.
    // A free-space level set is a circle rather than a grid-shaped polygon.
    for (const goal of team.navigationGoals) {
      for (const cell of this.components[goal.component]) {
        const dx = Math.abs(cell.x - goal.x) / this.SCALE;
        const dy = Math.abs(cell.y - goal.y) / this.SCALE;
        const directGridDistance = Math.max(dx, dy) * 10 + Math.min(dx, dy) * 4;
        potentials[cell.index] = (distances[cell.index] - directGridDistance) * 100 + EnvironmentMath.distance(dx, dy);
      }
    }
    // Preserve the public primary-team field used by navigation diagnostics.
    if (teamId === 0) {
      this.navigationGoals = team.navigationGoals;
      for (const cell of this.cells) {
        cell.distance = distances[cell.index];
        cell.potential = potentials[cell.index];
      }
    }
  }

  movementOptions(particle) {
    const current = this.getCell(particle.x, particle.y);
    const team = this.teams[particle.team];
    const potential = cell => team.potential[cell.index];
    if (!Number.isFinite(team.distance[current.index]) || team.distance[current.index] === 0) return null;
    const rotation = (this.tick + particle.id) % 8;
    // Navigation depends on terrain, target and eight deterministic tie orders,
    // never on occupancy. Live movement/contact still checks the current owner.
    const cached = team.movementCache[current.index] ??= new Array(8);
    if (cached[rotation]) return cached[rotation];
    const sign = (this.tick + particle.id) % 2 ? 1 : -1;
    const rank = neighbour => (sign * (neighbour.direction - rotation) + 8) % 8;
    const navigable = current.walkableNeighbours;
    const compareMain = (a, b) => (potential(a.cell) + a.cost * 100) - (potential(b.cell) + b.cost * 100)
      || potential(a.cell) - potential(b.cell) || rank(a) - rank(b);
    let main = navigable[0];
    for (let index = 1; index < navigable.length; index++) {
      if (compareMain(navigable[index], main) < 0) main = navigable[index];
    }
    if (!main) return null;
    const candidates = navigable.filter(neighbour =>
      potential(neighbour.cell) < potential(current) || main.dx * neighbour.dx + main.dy * neighbour.dy >= 0);
    candidates.sort((a, b) => {
      const classOf = item => item === main ? 0 : potential(item.cell) < potential(current) ? 1 : 2;
      return classOf(a) - classOf(b) || potential(a.cell) - potential(b.cell) || rank(a) - rank(b);
    });
    return cached[rotation] = { main, candidates, good: candidates.filter(item => item !== main && potential(item.cell) < potential(current)).slice(0, 2) };
  }

  moveParticle(particle) {
    const current = this.getCell(particle.x, particle.y);
    particle.xspeed = 0;
    particle.yspeed = 0;
    const options = this.movementOptions(particle);
    if (!options) {
      particle.credit = 0;
      return false;
    }
    if (this.teams[particle.team].stationary) return false;
    const { candidates } = options;
    for (const neighbour of candidates) {
      if (neighbour.cell.particle) continue;
      // Carry a partial diagonal step instead of spending it on a zigzag.
      if (neighbour.cost > particle.credit) return false;
      current.particle = undefined;
      neighbour.cell.particle = particle;
      particle.x = neighbour.cell.x;
      particle.y = neighbour.cell.y;
      particle.xspeed = neighbour.dx;
      particle.yspeed = neighbour.dy;
      particle.credit -= neighbour.cost;
      return true;
    }
    return false;
  }

  resolveContact(particle) {
    const options = this.movementOptions(particle);
    // Contact never replaces a possible free movement, even for the stationary opponent.
    if (!options || options.candidates.some(item => !item.cell.particle)) return;
    const { main, good } = options;
    const enemy = [main, ...good].find(item => item.cell.particle?.team !== particle.team);
    if (enemy) {
      const victim = enemy.cell.particle;
      victim.health -= enemy === main ? this.combat.attack : this.combat.attack >> 4;
      this.combatStats.attacks++;
      if (victim.health < 0) {
        victim.health = ((victim.health % this.combat.conversionHealth) + this.combat.conversionHealth) % this.combat.conversionHealth;
        victim.team = particle.team;
        victim.credit = 0;
        victim.xspeed = 0;
        victim.yspeed = 0;
        victim.convertedAt = this.tick;
        this.combatStats.conversions++;
      }
    } else {
      const friend = main.cell.particle;
      if (friend?.team === particle.team && friend.health < this.combat.maxHealth) {
        friend.health = Math.min(this.combat.maxHealth, friend.health + this.combat.heal);
        this.combatStats.heals++;
      }
    }
  }

  update() {
    this.updateSubstep();
    this.updateSubstep();
  }

  updateSubstep() {
    for (const team of this.teams) team.player.update();
    const activeTeams = new Set([0, ...this.particles.map(particle => particle.team)]);
    for (const id of activeTeams) this.updateGradient(id);
    const baseCredit = Math.max(0, Math.round(this.SPEED * 5 / this.SCALE));
    for (const particle of this.particles) {
      const phase = (this.tick + particle.phase) % 64;
      const variation = (phase < 32 ? phase : 64 - phase) - 16;
      const credit = baseCredit + Math.round(baseCredit * variation / 80);
      particle.credit = Math.min(credit + 13, particle.credit + credit);
    }
    const moved = new Set();
    for (let round = 0; round < Math.ceil((baseCredit * 1.2 + 13) / 10); round++) {
      // Individuals compete locally, with changing, deterministic priorities.
      // A strict front-to-back sweep would translate a dense cloud as one slab.
      const offset = this.tick * 177 % 2000;
      const seed = Math.imul(this.tick + round + 1, 374761393);
      // Positions may change between rounds, but never during this sort.
      const order = this.particles.filter(particle => particle.credit >= 10).map(particle => ({
        particle,
        band: Math.floor((this.teams[particle.team].potential[this.getCell(particle.x, particle.y).index] + offset) / 2000),
        priority: Math.imul((particle.id + 1) ^ seed, 668265263) >>> 0,
      }));
      order.sort((a, b) => a.band - b.band || a.priority - b.priority || a.particle.id - b.particle.id);
      for (const { particle } of order) if (particle.update()) moved.add(particle);
    }
    // Newly captured units start acting for their new team on the next half-step.
    if (activeTeams.size > 1 || this.particles.some(particle => particle.health < this.combat.maxHealth)) {
      const order = this.particles.filter(particle => (this.tick + particle.id) % 2 === 0 && !moved.has(particle));
      const priority = particle => Math.imul((particle.id + 1) ^ Math.imul(this.tick + 1, 374761393), 668265263) >>> 0;
      order.sort((a, b) => priority(a) - priority(b) || a.id - b.id);
      for (const particle of order) if (particle.convertedAt !== this.tick) this.resolveContact(particle);
    }
    for (const particle of this.particles) particle.credit = Math.min(13, particle.credit);
    this.tick++;
  }

  paintObstacles(x, y, from = { x, y }) {
    if (![x, y, from.x, from.y].every(Number.isFinite)) return;
    const radius = this.player.playerScale;
    const length = Math.hypot(x - from.x, y - from.y);
    const steps = Math.max(1, Math.ceil(length / this.SCALE));
    for (let step = 0; step <= steps; step++) {
      const cx = from.x + (x - from.x) * step / steps;
      const cy = from.y + (y - from.y) * step / steps;
      for (let row = Math.max(0, Math.floor((cy - radius) / this.SCALE)); row <= Math.min(this.rows - 1, Math.floor((cy + radius) / this.SCALE)); row++) {
        for (let column = Math.max(0, Math.floor((cx - radius) / this.SCALE)); column <= Math.min(this.columns - 1, Math.floor((cx + radius) / this.SCALE)); column++) {
          const px = column * this.SCALE;
          const py = row * this.SCALE;
          if (Math.hypot(Math.max(px - cx, 0, cx - (px + this.SCALE)), Math.max(py - cy, 0, cy - (py + this.SCALE))) <= radius) {
            new EnvironmentObstacle(this, px, py);
          }
        }
      }
    }
  }

  clearObstacles() {
    for (const cell of this.cells) cell.obstacle = false;
    this.obstacles = [];
    this.geometryDirty = true;
    this.backgroundDirty = true;
  }

  show() {
    if (!this.foreground) return;
    if (this.backgroundDirty) {
      this.background.background(51);
      this.background.noStroke();
      for (const obstacle of this.obstacles) obstacle.show();
      this.backgroundDirty = false;
    }
    this.foreground.clear();
    this.foreground.noStroke();
    for (const particle of this.particles) particle.show();
    this.player.show();
  }
}

if (typeof module !== 'undefined') module.exports = Environment;
