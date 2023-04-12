class Environment {
    constructor() {
        this.FIELD_X = 800;
        this.FIELD_Y = 800;
        this.PARTICLE_COUNT = 1;
        this.SCALE = 4;
        this.SPEED = 8;
        this.running = false;
        this.frame = 0;
        this.background = createGraphics(this.FIELD_X, this.FIELD_Y);
        this.foreground = createGraphics(this.FIELD_X, this.FIELD_Y);
        this.map = Array.from({ length: this.FIELD_Y }, () => Array.from({ length: this.FIELD_X }, () => new Cell()));
        

        this.player = new Player(this);
        this.particles = [];
        this.obstracles = [];

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
            env.foreground.background('rgba(0%, 0%, 0%, 0%)');


            for (let row = 0; row < this.map.length; row++) {
                const colmuns = this.map[row];
                for (let col = 0; col < colmuns.length; col++) {                                        
                    // calc dist from cell to mouse   
                    colmuns[col].y = row;
                    colmuns[col].x = col;
                }
            }
        }

        this.update = async function () {
            this.player.update();
            if(this.frame == 0 && this.running) {
                //let lastPrint = millis()
                await this.updateGradient();
                //console.log("Gradient calculation time: " + str(millis() - lastPrint));
                this.frame = 7;
            }
            this.frame = this.frame - 1;
            
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
                this.obstracles.forEach(o => {
                    o.show();
                });
            }
        };

        this.drawGradient = async function () {
            let lastPrint = millis()
            await this.updateGradient();
            console.log("Gradient calculation time: " + str(millis() - lastPrint));
            var cells = this.map.flat();
            let m = 1000; // call stack exeeded-->  Math.max(...cells.map(a => a.distance));
            for (let index = 0; index < cells.length; index = index + 10) {
                
                env.background.fill(255, 0, 0, Math.floor(255 / m * cells[index].distance));
                env.background.circle(cells[index].x, cells[index].y, 1);
            }
        }

        this.createObstracles = function () {
            if (mouseIsPressed === true) {
                let col = env.player.x;
                let row  = env.player.y;
                let r = this.player.playerScale;
                
                for (let dr = row - r; dr <= row + r; dr++) {
                    for (let dc = col - r; dc <= col + r; dc++) {
                        let cell = env.getCell(dr,dc)
                        if (r >= dist(col,row,dc,dr) && cell != undefined) {
                            new Obstracle(env, dc,dr);
                        }
                    }
                }  
            }
        }

        this.updateGradient = function() { new Promise(() => {
                const visited = new Array(this.map.length).fill(false).map(() => new Array(this.map[0].length).fill(false));
                const queue = [{ row: this.player.y, col: this.player.x, level: 0 }];
                let lastRow = this.player.y;
                let lastCol = this.player.x;

                while (queue.length > 0) {
                    const { row, col, level } = queue.shift();
                    this.map[row][col].distance = level;
                    lastRow = row;
                    lastCol = col;
                    // add neighboring cells to queue   
                    for (let dr = row - 1; dr <= row + 1; dr++) {
                        for (let dc = col -1; dc <= col + 1; dc++) {

                            if (this.isValidCell(dr,dc) && !visited[dr][dc]) {
                                let d = level + dist(lastCol,lastRow,dc,dr);
                                queue.push({ row: dr, col: dc, level: d });
                                visited[dr][dc] = true;
                            }
                        }
                    }
                
                }
            });
        }

        this.isValidCell = function(row,col) {
            if(row > 0 && col > 0 && row < this.map.length && col < this.map[0].length && !this.map[row][col].obstracle){
                return true;                
            }
            return false;
        }

        this.getCell = function(row,col) {
            if(row > 0 && col > 0 && row < this.map.length && col < this.map[0].length){
                return this.map[row][col];                
            }
            return undefined;
        }
    }
}
