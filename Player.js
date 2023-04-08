class Player {
  constructor(env) {
    this.x = 0;
    this.y = 0;
    
    this.xspeed = 0;
    this.yspeed = 0;

    this.dir = function (x, y) {
      this.xspeed = x;
      this.yspeed = y;
    };

    this.pos = function () {
      this.x = Math.floor(mouseX);
      this.y = Math.floor(mouseY);
    }

    this.update = function () {
      this.x = this.x + this.xspeed * env.SCALE;
      this.y = this.y + this.yspeed * env.SCALE;

      this.x = constrain(this.x, 0, env.FIELD_X - env.SCALE);
      this.y = constrain(this.y, 0, env.FIELD_Y - env.SCALE);
    };

    this.show = function () {
      fill(150);
      circle(this.x, this.y, env.SCALE * 4);
    };
  }
}