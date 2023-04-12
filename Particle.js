class Particle {
  constructor(start_x, start_y) {
    this.x = Math.floor(random(start_x, start_x + env.FIELD_X * 0.1 - env.SCALE ));
    this.y = Math.floor(random(start_y, start_y + env.FIELD_Y * 0.1 - env.SCALE ));
    this.xspeed = 0;
    this.yspeed = 0;
    env.map[this.y][this.x].particle = this;
    
    this.updateDirection = function (col,row) {
      //schau dir alle zellen in der umgebung an und finde die Zelle mit den niedrigsten wert
      let min = {distance : Number.POSITIVE_INFINITY}

      for (let dr = row - 1; dr <= row + 1; dr++) {
          for (let dc = col - 1; dc <= col + 1; dc++) {
          // ignoriere die aktuelle Zelle
              if (row === 0 && col === 0) {
                  continue;
              }

              let cell = env.getCell(dr,dc); 
              if (cell != undefined && cell.distance < min.distance){
                  min.distance = cell.distance;
                  this.xspeed = dc - col;  
                  this.yspeed = dr - row;  // leedcode lol
              }
          }
      }
    }        


    this.update = function () {
      this.updateDirection(this.x, this.y)
      
      env.map[this.y][this.x].particle = undefined;

      let dx = Math.floor(this.x + this.xspeed * env.SPEED * random(0.5,2));
      let dy = Math.floor(this.y + this.yspeed * env.SPEED * random(0.5,2));

      dx = constrain(dx, 0, env.FIELD_X - env.SCALE);
      dy = constrain(dy, 0, env.FIELD_Y - env.SCALE);

      let cell = env.getCell(dy,dx)  
      if(cell != undefined && !cell.isBlocked()) {
        this.x = dx;
        this.y = dy;
        cell.particle = this;
      }
    };

    this.show = function () {
      env.foreground.fill('white');
      env.foreground.circle(this.x, this.y, env.SCALE);
    };
  }
}