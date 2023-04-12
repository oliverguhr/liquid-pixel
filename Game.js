
function setup() {
    env = new Environment()
    createCanvas(env.FIELD_X, env.FIELD_Y);
    env.init();
    
    button = createButton('spawn');
    button.position(20, 20);
    button.mousePressed(start);

    frameRate(30);
  }
  
  function draw() {
    
    noCursor();
    // background('rgba(0%, 0%, 0%, 0)'); // darkest charcoal grey 
    env.update();
    env.show();
    image(env.background, 0, 0);
    image(env.foreground, 0, 0);
  }

  function start() {
    env.running = true;
    env.frame = 0;
    env.createParticles();
  }
  
  function doubleClicked() {
    env.drawGradient();
  }

  function mouseDragged() {
    env.player.pos();
    env.createObstracles();
    // prevent default
    return false;
  }
  
  function mouseMoved() {
      env.player.pos();
      // console.log(env.map[env.player.y][env.player.y]);
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