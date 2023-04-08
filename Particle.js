class Particle {
  constructor(env, start_x, start_y) {
    this.x = Math.floor(random(start_x, start_x + env.FIELD_X * 0.1 - env.SCALE ));
    this.y = Math.floor(random(start_y, start_y + env.FIELD_Y * 0.1 - env.SCALE ));
    this.env = env;
    this.xspeed = 0;
    this.yspeed = 0;
     this.updateDirection = function () {
      //schau dir alle zellen in der umgebung an und finde die Zelle mit den niedrigsten wert
      let row = this.y
      let col = this.x
      let min = {distance : Number.POSITIVE_INFINITY}

      for (let y = row - 1; y <= row + 1; y++) {
          for (let x = col - 1; x <= col + 1; x++) {
          // ignoriere die aktuelle Zelle
              if (y === 0 && x === 0) {
                  continue;
              }

              let distance = this.env.getGradientFromCell(y,x)   // die distanz des partikels zur zelle.
              let particle = this.env.getStateFromCell(y,x)            // die zell auf die sich das partikel bewegen soll muss frei sein
              if (distance < min.distance && particle == undefined){
                  min.distance = distance
                  this.xspeed = x - col  
                  this.yspeed = y - row  // leedcode lol
              }
          }
      }                      
    }        


    this.update = function () {
      // his.rnd();
      this.x = Math.floor(this.x + this.xspeed * this.env.SCALE * random(0.5,2));
      this.y = Math.floor(this.y + this.yspeed * this.env.SCALE * random(0.5,2));

      this.x = constrain(this.x, 0, this.env.FIELD_X - this.env.SCALE);
      this.y = constrain(this.y, 0, this.env.FIELD_Y - this.env.SCALE);
    };




    this.show = function () {
      fill(255, 204, 0);
      circle(this.x, this.y, this.env.SCALE);
    };
  }
}