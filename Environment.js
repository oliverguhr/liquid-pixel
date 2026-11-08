const EnvironmentCell = typeof module !== 'undefined' ? require('./Cell') : Cell;
const EnvironmentPlayer = typeof module !== 'undefined' ? require('./Player') : Player;
const EnvironmentParticle = typeof module !== 'undefined' ? require('./Particle') : Particle;
const EnvironmentObstacle = typeof module !== 'undefined' ? require('./Obstacle') : Obstacle;

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
    this.particles = [];
    this.obstacles = [];
    this.components = [];
    this.navigationGoals = [];
    this.geometryDirty = true;
    this.backgroundDirty = true;
    this.gradientTarget = '';
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
    for (const cell of this.cells) cell.particle = undefined;
    this.particles = [];
    this.nextParticleId = 0;
    const free = this.cells.filter(cell => !cell.obstacle);
    // Seeded tie-breaking, then compact placement around the center.
    for (let index = free.length - 1; index > 0; index--) {
      const other = Math.floor(this.random() * (index + 1));
      [free[index], free[other]] = [free[other], free[index]];
    }
    const centerX = this.FIELD_X / 2;
    const centerY = this.FIELD_Y / 2;
    const distance = cell => (cell.x - centerX) ** 2 + (cell.y - centerY) ** 2;
    free.sort((a, b) => distance(a) - distance(b));
    const count = Math.min(this.PARTICLE_COUNT, free.length);
    for (let index = 0; index < count; index++) {
      const cell = free[index];
      this.particles.push(new EnvironmentParticle(cell.x, cell.y, this));
    }
    this.spawnInfo = { requested: this.PARTICLE_COUNT, spawned: count, available: free.length };
    return this.spawnInfo;
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
    for (const cell of this.cells) cell.component = -1;
    this.components = [];
    for (const start of this.cells) {
      if (start.obstacle || start.component !== -1) continue;
      const component = this.components.length;
      const queue = [start];
      start.component = component;
      for (let head = 0; head < queue.length; head++) {
        const cell = queue[head];
        for (const neighbour of cell.neighbours) {
          if (neighbour.cell.component === -1 && this.canTraverse(cell, neighbour)) {
            neighbour.cell.component = component;
            queue.push(neighbour.cell);
          }
        }
      }
      this.components.push(queue);
    }
  }

  updateGradient() {
    const target = this.getCell(this.player.x, this.player.y);
    const key = `${target.index}`;
    if (!this.geometryDirty && key === this.gradientTarget) return;
    if (this.geometryDirty) this.updateComponents();
    this.geometryDirty = false;
    this.gradientTarget = key;
    for (const cell of this.cells) cell.distance = Infinity;
    const queue = new NavigationQueue();
    this.navigationGoals = [];
    for (let component = 0; component < this.components.length; component++) {
      const cells = this.components[component];
      let goal = cells[0];
      let minimum = Infinity;
      for (const cell of cells) {
        const distance = (cell.x - target.x) ** 2 + (cell.y - target.y) ** 2;
        if (distance < minimum || (distance === minimum && cell.index < goal.index)) {
          minimum = distance;
          goal = cell;
        }
      }
      goal.distance = 0;
      this.navigationGoals.push({ component, x: goal.x, y: goal.y });
      queue.push(goal, 0);
    }
    while (queue.entries.length) {
      const { cell, distance } = queue.pop();
      if (distance !== cell.distance) continue;
      for (const neighbour of cell.neighbours) {
        if (this.canTraverse(cell, neighbour) && distance + neighbour.cost < neighbour.cell.distance) {
          neighbour.cell.distance = distance + neighbour.cost;
          queue.push(neighbour.cell, neighbour.cell.distance);
        }
      }
    }
    // Retain obstacle detours, but remove the grid's angular error in open space.
    // A free-space level set is a circle rather than a grid-shaped polygon.
    for (const goal of this.navigationGoals) {
      for (const cell of this.components[goal.component]) {
        const dx = Math.abs(cell.x - goal.x) / this.SCALE;
        const dy = Math.abs(cell.y - goal.y) / this.SCALE;
        const directGridDistance = Math.max(dx, dy) * 10 + Math.min(dx, dy) * 4;
        cell.potential = (cell.distance - directGridDistance) * 100 + Math.round(Math.hypot(dx, dy) * 1000);
      }
    }
  }

  moveParticle(particle) {
    const current = this.getCell(particle.x, particle.y);
    particle.xspeed = 0;
    particle.yspeed = 0;
    if (!Number.isFinite(current.distance) || current.distance === 0) {
      particle.credit = 0;
      return false;
    }
    const rotation = (this.tick + particle.id) % 8;
    const sign = (this.tick + particle.id) % 2 ? 1 : -1;
    const rank = neighbour => (sign * (neighbour.direction - rotation) + 8) % 8;
    const navigable = current.neighbours.filter(neighbour => this.canTraverse(current, neighbour));
    navigable.sort((a, b) => (a.cell.potential + a.cost * 100) - (b.cell.potential + b.cost * 100)
      || a.cell.potential - b.cell.potential || rank(a) - rank(b));
    const main = navigable[0];
    if (!main) return false;
    const candidates = navigable.filter(neighbour =>
      neighbour.cell.potential < current.potential || main.dx * neighbour.dx + main.dy * neighbour.dy >= 0);
    candidates.sort((a, b) => {
      const classOf = item => item === main ? 0 : item.cell.potential < current.potential ? 1 : 2;
      return classOf(a) - classOf(b) || a.cell.potential - b.cell.potential || rank(a) - rank(b);
    });
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

  update() {
    this.updateSubstep();
    this.updateSubstep();
  }

  updateSubstep() {
    this.player.update();
    this.updateGradient();
    const baseCredit = Math.max(0, Math.round(this.SPEED * 5 / this.SCALE));
    for (const particle of this.particles) {
      const phase = (this.tick + particle.phase) % 64;
      const variation = (phase < 32 ? phase : 64 - phase) - 16;
      const credit = baseCredit + Math.round(baseCredit * variation / 80);
      particle.credit = Math.min(credit + 13, particle.credit + credit);
    }
    for (let round = 0; round < Math.ceil((baseCredit * 1.2 + 13) / 10); round++) {
      // Individuals compete locally, with changing, deterministic priorities.
      // A strict front-to-back sweep would translate a dense cloud as one slab.
      const order = this.particles.filter(particle => particle.credit >= 10);
      const band = particle => Math.floor((this.getCell(particle.x, particle.y).potential + this.tick * 177 % 2000) / 2000);
      const priority = particle => Math.imul((particle.id + 1) ^ Math.imul(this.tick + round + 1, 374761393), 668265263) >>> 0;
      order.sort((a, b) => band(a) - band(b) || priority(a) - priority(b));
      for (const particle of order) particle.update();
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
