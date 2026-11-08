class Player {
  constructor(environment) {
    this.environment = environment;
    this.x = 0;
    this.y = 0;
    this.dx = 0;
    this.dy = 0;
    this.playerScale = 4 * environment.SCALE;
  }

  setTarget(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new TypeError('target coordinates must be finite numbers');
    }
    this.dx = Math.floor(x);
    this.dy = Math.floor(y);
  }

  pos() {
    this.setTarget(mouseX, mouseY);
  }

  dir(x, y) {
    this.setTarget(this.x + x * this.environment.SPEED, this.y + y * this.environment.SPEED);
    this.update();
  }

  update() {
    const environment = this.environment;
    this.x = Math.max(0, Math.min(environment.FIELD_X - environment.SCALE, this.dx));
    this.y = Math.max(0, Math.min(environment.FIELD_Y - environment.SCALE, this.dy));
  }

  show() {
    const graphics = this.environment.foreground;
    if (!graphics) return;
    graphics.noFill();
    graphics.stroke(150);
    graphics.circle(this.x, this.y, this.playerScale);
    graphics.noStroke();
  }
}

if (typeof module !== 'undefined') module.exports = Player;
