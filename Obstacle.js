class Obstacle {
  constructor(environment, x, y) {
    this.environment = environment;
    const cell = environment.getCell(x, y);
    if (!cell || cell.isBlocked()) return;
    this.x = cell.x;
    this.y = cell.y;
    cell.obstacle = true;
    cell.distance = Infinity;
    environment.obstacles.push(this);
    environment.geometryDirty = true;
    environment.backgroundDirty = true;
  }

  show() {
    const graphics = this.environment.background;
    if (!graphics) return;
    graphics.fill(153, 102, 0);
    graphics.rect(this.x, this.y, this.environment.SCALE, this.environment.SCALE);
  }
}

if (typeof module !== 'undefined') module.exports = Obstacle;
