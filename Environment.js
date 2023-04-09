class Environment {
    constructor() {
        this.FIELD_X = 800;
        this.FIELD_Y = 800;
        this.PARTICLE_COUNT = 400;
        this.SCALE = 4;
        this.SPEED = 8;
        this.map = Array.from({ length: this.FIELD_Y }, () => Array.from({ length: this.FIELD_X }, () => new Cell()));

        this.player = new Player(this);
        this.particles = undefined;

        this.createParticles = function () {
            const particles = [];

            for (let i = 0; i < this.PARTICLE_COUNT; i++) {
                particles.push(new Particle(this.FIELD_X / 2, this.FIELD_Y / 2));
            }

            this.particles = particles;
        };

        this.update = function () {
            this.player.update();
            this.updateGradient();
            
            this.particles.forEach(p => {
                p.update();
            });
        };

        this.show = function () {
            this.player.show();
            this.particles.forEach(p => {
                p.show();
            });
        };

        this.updateGradient = function() {
            //iterate over all cells in map
            for (let row = 0; row < this.map.length; row++) {
                const colmuns = this.map[row];
                for (let col = 0; col < colmuns.length; col++) {                                        
                    // calc dist from cell to mouse   
                    colmuns[col].distance = dist(this.player.x, this.player.y, row,col); 
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
