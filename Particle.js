class Particle {
  constructor(x, y, environment) {
    const cell = environment.getCell(x, y);
    if (!cell || cell.isBlocked()) throw new RangeError('Particle needs a free cell');
    this.environment = environment;
    this.id = environment.nextParticleId++;
    const identity = Math.imul(this.id + 1, 0x9e3779b1) >>> 0;
    this.phase = identity & 63;
    this.shade = 210 + ((identity >>> 8) % 46);
    this.x = cell.x;
    this.y = cell.y;
    this.xspeed = 0;
    this.yspeed = 0;
    this.credit = 0;
    cell.particle = this;
  }

  update() {
    return this.environment.moveParticle(this);
  }

  show() {
    const graphics = this.environment.foreground;
    if (!graphics) return;
    graphics.fill(this.shade);
    graphics.rect(this.x, this.y, this.environment.SCALE, this.environment.SCALE);
  }
}

if (typeof module !== 'undefined') module.exports = Particle;
