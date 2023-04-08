class Environment {
    constructor() {
        this.FIELD_X = 800;
        this.FIELD_Y = 800;
        this.PARTICLE_COUNT = 400;
        this.SCALE = 4;
        this.map = Array(this.FIELD_X, this.FIELD_X).fill(null).map(() => Array(this.FIELD_Y));
        this.map_distance = Array(this.FIELD_X).fill(0.0).map(() => Array(this.FIELD_Y));
        this.player = new Player(this);

        this.createParticles = function () {
            const particles = [];

            for (let i = 0; i < this.PARTICLE_COUNT; i++) {
                particles.push(new Particle(this, this.FIELD_X / 2, this.FIELD_Y / 2));
            }

            return particles;
        };
        this.particles = this.createParticles();


        this.update = function () {
            this.player.update();
            this.updateGradient();
            
            this.particles.forEach(p => {
                p.updateDirection(this.player.x, this.player.y)
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
            for (let row = 0; row < this.map_distance.length; row++) {
                const colmuns = this.map_distance[row];
                for (let col = 0; col < colmuns.length; col++) {                                        
                    // calc dist from cell to mouse   
                    colmuns[col] = dist(this.player.x, this.player.y, row,col); 
                }
            }
        }

        this.getGradientFromCell = function(x,y) {
            return this.get_cell(this.map_distance, x,y);
        }

        this.getStateFromCell = function(x,y) {
            return this.get_cell(this.map, x,y);
        }

        this.get_cell = function(map,x,y) {
            if(y > 0 && x > 0 && y < map.length && x < map[0].length){
                return map[y][x];                
            }
            return undefined;
        }
    }
}
