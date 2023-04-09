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
      this.getCellsInDistance(false,this.x,this.y)

      this.x = constrain(this.dx, 0, env.FIELD_X - env.SCALE);
      this.y = constrain(this.dy, 0, env.FIELD_Y - env.SCALE);

      this.getCellsInDistance(true,this.y,this.x)
    };

    this.show = function () {
      fill(150);
      circle(this.x, this.y,  this.playerScale);
    };

    this.getCellsInDistance = function (bool, dx,dy) {
      let row = dy;
      let col = dx;
      let r = env.SCALE;

      for (let y = row - r; y <= row + r; y++) {
        for (let x = col - r; x <= col + r; x++) {
        // ignoriere die aktuelle Zelle
            if (y === 0 && x === 0) {
                continue;
            }

            let cell = env.getCell(y,x)  
            // müsste nicht hier der speed + random schon hinzugefügt werden ? 
            if (r < dist(dx,dy,x,y) && cell != undefined){
                cell.player = bool;
                if(bool = true) {
                  cell.distance = Number.POSITIVE_INFINITY
                }
            }
        }
      }  
    };

  }
}