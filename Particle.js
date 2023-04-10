class Particle {
  constructor(start_x, start_y) {
    this.x = Math.floor(random(start_x, start_x + env.FIELD_X * 0.1 - env.SCALE ));
    this.y = Math.floor(random(start_y, start_y + env.FIELD_Y * 0.1 - env.SCALE ));
    this.xspeed = 0;
    this.yspeed = 0;
    env.map[this.x][this.y].particle = this;
    
    this.updateDirection = function () {
      //schau dir alle zellen in der umgebung an und finde die Zelle mit den niedrigsten wert
      let row = this.y;
      let col = this.x;
      let min = {distance : Number.POSITIVE_INFINITY}

      for (let y = row - 1; y <= row + 1; y++) {
          for (let x = col - 1; x <= col + 1; x++) {
          // ignoriere die aktuelle Zelle
              if (y === 0 && x === 0) {
                  continue;
              }

              let cell = env.getCell(y,x); 
              // müsste nicht hier der speed + random schon hinzugefügt werden ? 
              if (cell != undefined && cell.distance <= min.distance){
                  min.distance = cell.distance;
                  this.xspeed = x - col;  
                  this.yspeed = y - row;  // leedcode lol
              }
          }
      }
    }        


    this.update = function () {
      this.updateDirection(env.player.x, env.player.y)
      
      env.map[this.y][this.x].particle = undefined;

      let dx = Math.floor(this.x + this.xspeed * env.SPEED * random(0.5,2));
      let dy = Math.floor(this.y + this.yspeed * env.SPEED * random(0.5,2));

      let cell = env.getCell(dx,dy)  
      if  (cell != undefined && !cell.isBlocked()) {
        this.x = dx;
        this.y = dy;
      }

      this.x = constrain(this.x, 0, env.FIELD_X - env.SCALE);
      this.y = constrain(this.y, 0, env.FIELD_Y - env.SCALE);

      env.map[this.y][this.x].particle = this;
    };




    this.show = function () {
      env.foreground.fill('white');
      env.foreground.circle(this.x, this.y, env.SCALE);
    };
  }
}