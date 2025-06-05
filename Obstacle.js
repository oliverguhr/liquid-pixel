class Obstacle {
    constructor(env, start_x, start_y) {
      this.x = start_x;
      this.y = start_y;
      
      env.map[this.y][this.x].distance = Number.POSITIVE_INFINITY;
      env.map[this.y][this.x].obstacle = true;
      env.obstacles.push(this);
      
      this.show = function () {
        env.background.fill(153, 102, 0);
        env.background.circle(this.x, this.y, 1);
      };
    }
  } 
