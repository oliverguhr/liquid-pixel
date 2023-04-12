class Player {
  constructor(env) {
    this.x = 0;
    this.y = 0;
    this.playerScale = 4 * env.SCALE;
    
    this.dx = 0;
    this.dy = 0;

    this.pos = function () {
      this.dx = Math.floor(mouseX);
      this.dy = Math.floor(mouseY);
    }

    this.update = function () {
      this.getCellsInDistance(false,this.x,this.y);

      this.x = constrain(this.dx, 0, env.FIELD_X - env.SCALE);
      this.y = constrain(this.dy, 0, env.FIELD_Y - env.SCALE);

      this.getCellsInDistance(true,this.x,this.y);
    };

    this.show = function () {
      env.foreground.fill(150);
      env.foreground.circle(this.x, this.y,  this.playerScale);
    };

    this.getCellsInDistance = function (bool, col, row) {
      
      env.map[row][col].player = bool;
      let r = this.playerScale;

      for (let y = row - r; y <= row + r; y++) {
        for (let x = col - r; x <= col + r; x++) {
            let cell = env.getCell(x,y)
            if (r >= dist(col,row,x,y) && cell != undefined) {
                cell.player = bool;
            }
        }
      }  
    };
  }
}