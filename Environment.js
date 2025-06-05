class Environment {
    constructor() {
        this.FIELD_X = 800;
        this.FIELD_Y = 800;
        this.PARTICLE_COUNT = 1000;
        this.SCALE = 4;
        this.SPEED = 8;
        this.running = false;
        this.background = createGraphics(this.FIELD_X, this.FIELD_Y);
        this.foreground = createGraphics(this.FIELD_X, this.FIELD_Y);
        this.map = Array.from({ length: this.FIELD_Y }, () => Array.from({ length: this.FIELD_X }, () => new Cell()));
        

        this.player = new Player(this);
        this.particles = [];
        this.obstacles = [];

        this.createParticles = function () {
            const particles = [];

            for (let i = 0; i < this.PARTICLE_COUNT; i++) {
                particles.push(new Particle(this.FIELD_X / 2, this.FIELD_Y / 2));
            }

            this.particles = particles;
        };

        this.init= function () {
            env.background.background(51);
            env.background.noStroke();
            env.foreground.background('rgba(0%, 100%, 0%, 50%)');


            for (let row = 0; row < this.map.length; row++) {
                const colmuns = this.map[row];
                for (let col = 0; col < colmuns.length; col++) {                                        
                    // calc dist from cell to mouse   
                    colmuns[col].y = row;
                    colmuns[col].x = col;
                }
            }
        }

        this.update = function () {
            this.player.update();
            this.updateGradient();
            
            this.particles.forEach(p => {
                p.update();
            });
        };

        this.show = function () {
            env.foreground.clear();
            this.player.show();
            this.particles.forEach(p => {
                p.show();
            });

            if(!this.running)
            {
                this.obstacles.forEach(o => {
                    o.show();
                });
            }
        };

        this.createObstacles = function () {
            if (mouseIsPressed === true) {
                let col = env.player.x;
                let row  = env.player.y;
                let r = this.player.playerScale;

                new Obstacle(env, col, row);
                
                for (let y = row - r; y <= row + r; y++) {
                    for (let x = col - r; x <= col + r; x++) {
                        let cell = env.getCell(x,y)
                        if (r >= dist(col,row,x,y) && cell != undefined) {
                            new Obstacle(env, x,y);
                        }
                    }
                }  
            }
        }

        this.updateGradient = function() {
            //iterate over all cells in map
            for (let row = 0; row < this.map.length; row++) {
                const colmuns = this.map[row];
                for (let col = 0; col < colmuns.length; col++) {                                        
                    // calc dist from cell to mouse   
                    colmuns[col].distance = Math.floor(dist(this.player.x, this.player.y, row,col)); 
                }
            }
        }

        this.getCell = function(x,y) {
            if(y > 0 && x > 0 && y < this.map.length && x < this.map[0].length){
                return this.map[y][x];                
            }
            return undefined; // should never happen
        }
    }
}

if (typeof module !== "undefined") {
    module.exports = Environment;
}
