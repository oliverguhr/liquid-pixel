class Cell {
    constructor() {
        this.distance = 0;
        this.particle = undefined;
        this.player = false;
        this.obstacle = false;
        this.x = 0;
        this.y = 0;
    
        this.isBlocked = function() {
            return this.particle != undefined || this.player || this.obstacle;
        }
    }
}
