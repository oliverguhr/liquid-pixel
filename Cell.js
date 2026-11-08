class Cell {
  constructor(x = 0, y = 0, index = 0) {
    this.x = x;
    this.y = y;
    this.index = index;
    this.distance = Infinity;
    this.potential = Infinity;
    this.component = -1;
    this.particle = undefined;
    this.obstacle = false;
    this.neighbours = [];
  }

  isBlocked() {
    return this.obstacle || this.particle !== undefined;
  }
}

if (typeof module !== 'undefined') module.exports = Cell;
