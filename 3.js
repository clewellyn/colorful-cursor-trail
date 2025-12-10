const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Audio setup
const bgMusic = document.getElementById('bgMusic');
const toggleMusic = document.getElementById('toggleMusic');
const volumeSlider = document.getElementById('volumeSlider');
const toggleJelly = document.getElementById('toggleJelly');

// Jellyfish enabled flag
let jellyEnabled = true;

// Music controls
toggleMusic.addEventListener('click', () => {
    if (bgMusic.paused) {
        bgMusic.play();
        toggleMusic.textContent = '🔇 Mute Music';
    } else {
        bgMusic.pause();
        toggleMusic.textContent = '🎵 Play Music';
    }
});

volumeSlider.addEventListener('input', (e) => {
    bgMusic.volume = e.target.value;
});

// Jellyfish toggle button behavior
if (toggleJelly) {
    toggleJelly.addEventListener('click', () => {
        jellyEnabled = !jellyEnabled;
        toggleJelly.textContent = `🪼 Jellyfish: ${jellyEnabled ? 'On' : 'Off'}`;
        toggleJelly.classList.toggle('toggled', jellyEnabled);
        if (!jellyEnabled) {
            // clear existing jellyfish immediately
            jellyfish.length = 0;
            spawnTimer = 0;
        } else {
            // spawn one to make it feel responsive
            spawnJelly();
        }
    });
}

// Set canvas size to window size
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Particle class (cursor trail)
class Particle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = Math.random() * 5 + 2;
        this.speedX = Math.random() * 2 - 1;
        this.speedY = Math.random() * 2 - 1;
        this.color = `hsl(${Math.random() * 360}, 100%, 50%)`;
    }

    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.size > 0.2) this.size -= 0.1;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

let particles = [];
let mouse = { x: null, y: null };

// Track mouse movement
canvas.addEventListener('mousemove', (event) => {
    mouse.x = event.x;
    mouse.y = event.y;
    for (let i = 0; i < 5; i++) particles.push(new Particle(mouse.x, mouse.y));
});

// Jellyfish class
class Jellyfish {
    constructor(side = 'left') {
        this.size = 30 + Math.random() * 40; // body radius
        this.y = Math.random() * (canvas.height * 0.8) + canvas.height * 0.1;
        this.side = side;
        this.speed = 0.3 + Math.random() * 0.6; // horizontal speed
        this.vx = this.side === 'left' ? this.speed : -this.speed;
        this.x = this.side === 'left' ? -this.size - Math.random() * 100 : canvas.width + this.size + Math.random() * 100;
        this.phase = Math.random() * Math.PI * 2;
        this.color = `hsla(${Math.floor(Math.random() * 360)}, 70%, 70%, 0.9)`;
        this.tentacles = 4 + Math.floor(Math.random() * 4);
        this.age = 0;
        this.maxAge = 400 + Math.random() * 800; // frames
        this.swaySpeed = 0.01 + Math.random() * 0.02;
        // disappearance state
        this.alpha = 0.95;
        this.disappearing = false;
        this.hit = false; // whether already touched by mouse
    }

    update() {
        this.x += this.vx;
        // gentle vertical bob using sine
        this.phase += this.swaySpeed;
        this.y += Math.sin(this.phase) * 0.6;
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
        return (this.x < -this.size - 200 || this.x > canvas.width + this.size + 200 || this.age > this.maxAge);
    }
}

let jellyfish = [];
let spawnTimer = 0;
const spawnInterval = 240; // in frames (~4s at 60fps)

function spawnJelly() {
    const side = Math.random() < 0.5 ? 'left' : 'right';
    if (jellyfish.length < 8) jellyfish.push(new Jellyfish(side));
}

// initial jellyfish
if (jellyEnabled) {
    for (let i = 0; i < 2; i++) spawnJelly();
}

function animate() {
    // translucent background for trailing effect
    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // update and draw jellyfish behind particles (if enabled)
    if (jellyEnabled) {
        for (let i = 0; i < jellyfish.length; i++) {
            const j = jellyfish[i];

            // mouse collision: soft disappear when touched
            if (!j.disappearing && mouse.x != null && mouse.y != null) {
                const dx = j.x - mouse.x;
                const dy = j.y - mouse.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < j.size * 0.9) {
                    j.disappearing = true;
                    j.hit = true;
                    // create a small burst of particles at jellyfish position
                    for (let p = 0; p < 18; p++) {
                        const part = new Particle(j.x, j.y);
                        // make burst particles match jellyfish color and fly outward
                        part.color = j.color.replace(/hsla\(/, 'hsl(').replace(/,\s*0.9\)/, ')');
                        part.size = Math.random() * 4 + 2;
                        const angle = Math.random() * Math.PI * 2;
                        const speed = 1 + Math.random() * 3;
                        part.speedX = Math.cos(angle) * speed;
                        part.speedY = Math.sin(angle) * speed;
                        particles.push(part);
                    }
                }
            }

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