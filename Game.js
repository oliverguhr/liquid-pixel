
function setup() {
    env = new Environment()
    createCanvas(env.FIELD_X, env.FIELD_Y);
    env.createParticles();
    env.setXY();
    // frameRate(24);
  }
  
  function draw() {
    noCursor();
    background(51); // darkest charcoal grey 

    env.update();
    env.show();
    
  }
  
  function mouseMoved() {
      env.player.pos();
  }  
  // beispiel für key Mappings
  function keyPressed() {
    if (keyCode === UP_ARROW) {
      env.player.dir(0, -1);
    } else if (keyCode === DOWN_ARROW) {
      env.player.dir(0, 1);
    } else if (keyCode === RIGHT_ARROW) {
      env.player.dir(1, 0);
    } else if (keyCode === LEFT_ARROW) {
      env.player.dir(-1, 0);
    }
  }