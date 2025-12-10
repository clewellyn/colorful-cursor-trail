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

// Configurable parameters
const movementThreshold = 2.5; // pixels — require this movement to consider touch
const requireDotThreshold = 0.2; // require normalized dot product > this to consider movement toward jelly
const speedRampPerFrame = 0.00005; // how much speedFactor increases each frame
const maxJelly = 12; // maximum simultaneous jellyfish

// Jellyfish hit sound element
const jellySfx = document.getElementById('jellySfx');

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
let prevMouse = { x: null, y: null };

// hint tooltip (show once)
const hint = document.getElementById('hint');
if (hint && !localStorage.getItem('seenHint')) {
    setTimeout(() => {
        hint.classList.add('show');
        setTimeout(() => {
            hint.classList.remove('show');
            try { localStorage.setItem('seenHint', '1'); } catch (e) {}
        }, 3500);
    }, 600);
}

// Track mouse movement: draw particles and trigger jelly hit when user moves into one
canvas.addEventListener('mousemove', (event) => {
    prevMouse.x = mouse.x;
    prevMouse.y = mouse.y;
    mouse.x = event.clientX;
    mouse.y = event.clientY;

    // cursor trail
    for (let i = 0; i < 5; i++) particles.push(new Particle(mouse.x, mouse.y));

    // if the mouse actually moved enough, check for jelly overlap and trigger chime
    if (prevMouse.x !== null && prevMouse.y !== null) {
        const dx = mouse.x - prevMouse.x;
        const dy = mouse.y - prevMouse.y;
        const moved = Math.sqrt(dx * dx + dy * dy);
        if (moved >= movementThreshold && jellyEnabled) {
            // normalized movement vector
            const mvx = dx / moved;
            const mvy = dy / moved;
            for (let i = 0; i < jellyfish.length; i++) {
                const j = jellyfish[i];
                if (j.disappearing) continue;
                const cx = j.x;
                const cy = j.y;
                const ddx = cx - mouse.x;
                const ddy = cy - mouse.y;
                const dist = Math.sqrt(ddx * ddx + ddy * ddy);
                if (dist < j.size * 0.9) {
                    // directional check: movement should be (at least somewhat) towards jellyfish
                    const toJellyX = ddx / (dist || 1);
                    const toJellyY = ddy / (dist || 1);
                    const dot = mvx * toJellyX + mvy * toJellyY; // 1 = directly toward, -1 away
                    if (dot >= requireDotThreshold) {
                        j.disappearing = true;
                        j.hit = true;
                        playJellySfx();
                        for (let p = 0; p < 18; p++) {
                            const part = new Particle(j.x, j.y);
                            part.color = j.color.replace(/hsla\(/, 'hsl(').replace(/,\s*0.9\)/, ')');
                            part.size = Math.random() * 4 + 2;
                            const angle = Math.random() * Math.PI * 2;
                            const speed = 1 + Math.random() * 3;
                            part.speedX = Math.cos(angle) * speed;
                            part.speedY = Math.sin(angle) * speed;
                            particles.push(part);
                        }
                        break; // only trigger one jelly per movement
                    }
                }
            }
        }
    }
});

// Jellyfish class
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
        // hover glow if cursor nearby
        const dx = (mouse.x || -9999) - this.x;
        const dy = (mouse.y || -9999) - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const hover = dist < this.size * 1.1;
        // hover strength 0..1 (closer = stronger)
        const hoverStrength = hover ? Math.max(0, 1 - dist / (this.size * 1.1)) : 0;
        // pulsing factor based on internal phase
        const pulse = 0.6 + 0.4 * Math.sin(this.phase * 3);

        if (hover && !this.disappearing) {
            ctx.shadowBlur = 30 * hoverStrength * pulse;
            ctx.shadowColor = `rgba(255,255,255,${0.35 * hoverStrength})`;
        } else {
            ctx.shadowBlur = 0;
        }
        // apply per-jellyfish alpha
        ctx.globalAlpha = this.alpha;
        ctx.translate(this.x, this.y);

        // subtle halo when hovered
        if (hover && !this.disappearing) {
            const haloR = this.size * (1.6 + 0.4 * pulse);
            const halo = ctx.createRadialGradient(0, 0, this.size * 0.2, 0, 0, haloR);
            halo.addColorStop(0, `rgba(255,255,255,${0.08 * hoverStrength})`);
            halo.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = halo;
            ctx.beginPath();
            ctx.arc(0, 0, haloR, 0, Math.PI * 2);
            ctx.fill();
        }

        // draw bell (body)
        const grd = ctx.createRadialGradient(0, -this.size * 0.2, this.size * 0.1, 0, 0, this.size);
        grd.addColorStop(0, this.color);
        grd.addColorStop(1, 'rgba(255,255,255,0.05)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.ellipse(0, 0, this.size * 1.1, this.size * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();

        // stronger pulsing outline when hovered
        if (hover && !this.disappearing) {
            const outlineAlpha = 0.35 * hoverStrength * pulse;
            ctx.lineWidth = Math.max(1, this.size * 0.08 * (0.8 + 0.4 * pulse));
            ctx.strokeStyle = `rgba(255,255,255,${outlineAlpha})`;
            ctx.beginPath();
            ctx.ellipse(0, 0, this.size * 1.25, this.size * 0.95, 0, 0, Math.PI * 2);
            ctx.stroke();
        }

        // tentacles
        for (let t = 0; t < this.tentacles; t++) {
            const angle = (t / (this.tentacles - 1 || 1) - 0.5) * Math.PI * 0.8; // spread
            const length = this.size * (1.2 + Math.random() * 0.8);
            const sway = Math.sin(this.phase * (0.8 + t * 0.1) + t) * 8;
            ctx.beginPath();
            ctx.moveTo(Math.cos(angle) * this.size * 0.6, Math.sin(angle) * this.size * 0.5 + this.size * 0.3);
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
        // restore alpha and shadow
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
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
    if (jellyfish.length < maxJelly) jellyfish.push(new Jellyfish(side));
}

// initial jellyfish
if (jellyEnabled) {
    for (let i = 0; i < 3; i++) spawnJelly();
}

function animate() {
    // slowly increase global speed factor
    speedFactor += speedRampPerFrame;

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