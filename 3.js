const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Audio setup
const bgMusic = document.getElementById('bgMusic');
const toggleMusic = document.getElementById('toggleMusic');
const volumeSlider = document.getElementById('volumeSlider');
const toggleJelly = document.getElementById('toggleJelly');

// Jellyfish enabled flag
let jellyEnabled = true;

// global speed factor for jellyfish (gradually increases)
let speedFactor = 1;

// Jellyfish hit sound element
const jellySfx = document.getElementById('jellySfx');
class Jellyfish {
    constructor(side = 'left') {
        this.size = 30 + Math.random() * 40; // body radius
        this.side = side;
        this.phase = Math.random() * Math.PI * 2;
        this.baseSpeed = 0.3 + Math.random() * 0.6; // base movement speed
        // direction vector
        this.dirX = 0;
        this.dirY = 0;
        // initial position depending on entry side
        if (side === 'left') {
            this.x = -this.size - Math.random() * 100;
            this.y = Math.random() * (canvas.height * 0.8) + canvas.height * 0.1;
            this.dirX = 1;
            this.dirY = (Math.random() - 0.5) * 0.4;
        } else if (side === 'right') {
            this.x = canvas.width + this.size + Math.random() * 100;
            this.y = Math.random() * (canvas.height * 0.8) + canvas.height * 0.1;
            this.dirX = -1;
            this.dirY = (Math.random() - 0.5) * 0.4;
        } else if (side === 'top') {
            this.y = -this.size - Math.random() * 100;
            this.x = Math.random() * (canvas.width * 0.8) + canvas.width * 0.1;
            this.dirY = 1;
            this.dirX = (Math.random() - 0.5) * 0.4;
        } else { // bottom
            this.y = canvas.height + this.size + Math.random() * 100;
            this.x = Math.random() * (canvas.width * 0.8) + canvas.width * 0.1;
            this.dirY = -1;
            this.dirX = (Math.random() - 0.5) * 0.4;
        }
        this.color = `hsla(${Math.floor(Math.random() * 360)}, 70%, 70%, 0.9)`;
        this.tentacles = 4 + Math.floor(Math.random() * 4);
        this.swaySpeed = 0.01 + Math.random() * 0.02;
        this.age = 0;
        this.maxAge = 400 + Math.random() * 800; // frames
        // disappearance state
        this.alpha = 0.95;
        this.disappearing = false;
        this.hit = false; // whether already touched by mouse
    }

    update() {
        this.phase += this.swaySpeed;
        // move according to base direction and global speed factor
        this.x += this.dirX * this.baseSpeed * speedFactor;
        this.y += this.dirY * this.baseSpeed * speedFactor;
        // gentle perpendicular bob
        const bob = Math.sin(this.phase) * (Math.min(2, this.size * 0.02));
        if (Math.abs(this.dirX) > Math.abs(this.dirY)) {
            this.y += bob;
        } else {
            this.x += bob;
        }
        // if in disappearing state, gently shrink and fade
        if (this.disappearing) {
            this.alpha -= 0.02; // fade speed
            this.size *= 0.985; // shrink a bit
        }
        this.age++;
    }

    draw() {
        ctx.save();
        // apply per-jellyfish alpha
        ctx.globalAlpha = this.alpha;
        ctx.translate(this.x, this.y);

        // draw bell (body)
        const grd = ctx.createRadialGradient(0, -this.size * 0.2, this.size * 0.1, 0, 0, this.size);
        grd.addColorStop(0, this.color);
        grd.addColorStop(1, 'rgba(255,255,255,0.05)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.ellipse(0, 0, this.size * 1.1, this.size * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();

        // tentacles
        for (let t = 0; t < this.tentacles; t++) {
            const angle = (t / (this.tentacles - 1 || 1) - 0.5) * Math.PI * 0.8; // spread
            const length = this.size * (1.2 + Math.random() * 0.8);
            const sway = Math.sin(this.phase * (0.8 + t * 0.1) + t) * 8;
            ctx.beginPath();
            ctx.moveTo(Math.cos(angle) * this.size * 0.6, Math.sin(angle) * this.size * 0.5 + this.size * 0.3);
            // use two bezier segments to make a smooth tentacle
            ctx.bezierCurveTo(
                Math.cos(angle) * this.size * 0.6 + sway * 0.2,
                this.size * 0.6 + sway * 0.3,
                Math.cos(angle) * length * 0.3 + sway * 0.4,
                this.size * 0.9 + length * 0.4,
                Math.cos(angle) * length + sway,
                this.size * 1.2 + length
            );
            ctx.strokeStyle = this.color;
            ctx.lineWidth = Math.max(1, this.size * 0.06);
            ctx.lineCap = 'round';
            ctx.stroke();
        }

        ctx.restore();
        // restore alpha (in case other drawing expects full alpha)
        ctx.globalAlpha = 1;
    }

    isOffScreen() {
        return (
            this.x < -this.size - 200 ||
            this.x > canvas.width + this.size + 200 ||
            this.y < -this.size - 200 ||
            this.y > canvas.height + this.size + 200 ||
            this.age > this.maxAge
        );
    }
}
let jellyfish = [];
let spawnTimer = 0;
const spawnInterval = 240; // in frames (~4s at 60fps)

function spawnJelly() {
    const sides = ['left', 'right', 'top', 'bottom'];
    const side = sides[Math.floor(Math.random() * sides.length)];
    if (jellyfish.length < 12) jellyfish.push(new Jellyfish(side));
}

// initial jellyfish
if (jellyEnabled) {
    for (let i = 0; i < 3; i++) spawnJelly();
}

function animate() {
    // slowly increase global speed factor
    speedFactor += 0.00002;

    // translucent background for trailing effect
    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // update and draw jellyfish behind particles (if enabled)
    if (jellyEnabled) {
        for (let i = 0; i < jellyfish.length; i++) {
            const j = jellyfish[i];
            j.update();
            j.draw();
            // remove if fully faded or off-screen
            if (j.alpha <= 0.03 || j.isOffScreen()) {
                jellyfish.splice(i, 1);
                i--;
            }
        }

        // spawn timer
        spawnTimer++;
        if (spawnTimer > spawnInterval) {
            spawnTimer = 0;
            spawnJelly();
        }
    } else {
        // ensure spawn timer doesn't grow while disabled
        spawnTimer = 0;
    }

    // draw particles (cursor trail) on top
    for (let i = 0; i < particles.length; i++) {
        particles[i].update();
        particles[i].draw();

        if (particles[i].size <= 0.2) {
            particles.splice(i, 1);
            i--;
        }
    }

    requestAnimationFrame(animate);
}

animate();