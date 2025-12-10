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
// These values are user-tunable via the settings UI and persisted to localStorage
let settings = {
    movementThreshold: Number(localStorage.getItem('movementThreshold')) || 2.5, // pixels — require this movement to consider touch
    requireDotThreshold: Number(localStorage.getItem('requireDotThreshold')) || 0.2, // normalized dot product threshold
    globalCooldown: Number(localStorage.getItem('globalCooldown')) || 220 // ms between global sfx
};
const speedRampPerFrame = 0.00005; // how much speedFactor increases each frame
const maxJelly = 12; // maximum simultaneous jellyfish

// Jellyfish hit sound element
const jellySfx = document.getElementById('jellySfx');

// Settings UI elements (initialized below) - optional if panel not present
const sensitivityEl = document.getElementById('sensitivity');
const sensitivityValEl = document.getElementById('sensitivityVal');
const alignmentEl = document.getElementById('alignment');
const alignmentValEl = document.getElementById('alignmentVal');
const cooldownEl = document.getElementById('cooldown');
const cooldownValEl = document.getElementById('cooldownVal');
const resetBtn = document.getElementById('resetSettings');
const undoResetBtn = document.getElementById('undoReset');
const debugToggleBtn = document.getElementById('debugToggle');
let debugEnabled = (localStorage.getItem('debugOverlay') === '1');
let _previousSettings = null; // used for undo after reset

function initSettingsUI() {
    // If the elements are missing (older HTML), skip quietly
    try {
        if (sensitivityEl) {
            sensitivityEl.min = 0; sensitivityEl.max = 12; sensitivityEl.step = 0.1;
            sensitivityEl.value = settings.movementThreshold;
            sensitivityValEl.textContent = settings.movementThreshold;
            sensitivityEl.addEventListener('input', (e) => {
                settings.movementThreshold = Number(e.target.value);
                sensitivityValEl.textContent = settings.movementThreshold;
                try { localStorage.setItem('movementThreshold', String(settings.movementThreshold)); } catch (e) {}
            });
        }
        if (alignmentEl) {
            alignmentEl.min = -1; alignmentEl.max = 1; alignmentEl.step = 0.01;
            alignmentEl.value = settings.requireDotThreshold;
            alignmentValEl.textContent = settings.requireDotThreshold;
            alignmentEl.addEventListener('input', (e) => {
                settings.requireDotThreshold = Number(e.target.value);
                alignmentValEl.textContent = settings.requireDotThreshold;
                try { localStorage.setItem('requireDotThreshold', String(settings.requireDotThreshold)); } catch (e) {}
            });
        }
        if (cooldownEl) {
            cooldownEl.min = 0; cooldownEl.max = 1200; cooldownEl.step = 10;
            cooldownEl.value = settings.globalCooldown;
            cooldownValEl.textContent = settings.globalCooldown;
            cooldownEl.addEventListener('input', (e) => {
                settings.globalCooldown = Number(e.target.value);
                cooldownValEl.textContent = settings.globalCooldown;
                try { localStorage.setItem('globalCooldown', String(settings.globalCooldown)); } catch (e) {}
            });
        }
    } catch (e) {
        // ignore - UI is optional
    }
}

// initialize (if panel exists)
initSettingsUI();

// Reset settings to sensible defaults and update UI/localStorage
function resetSettingsToDefaults() {
    const defaults = { movementThreshold: 2.5, requireDotThreshold: 0.2, globalCooldown: 220 };
    settings = Object.assign({}, defaults);
    try { localStorage.setItem('movementThreshold', String(settings.movementThreshold)); } catch (e) {}
    try { localStorage.setItem('requireDotThreshold', String(settings.requireDotThreshold)); } catch (e) {}
    try { localStorage.setItem('globalCooldown', String(settings.globalCooldown)); } catch (e) {}
    // Update UI elements if present
    if (sensitivityEl) { sensitivityEl.value = settings.movementThreshold; sensitivityValEl.textContent = settings.movementThreshold; }
    if (alignmentEl) { alignmentEl.value = settings.requireDotThreshold; alignmentValEl.textContent = settings.requireDotThreshold; }
    if (cooldownEl) { cooldownEl.value = settings.globalCooldown; cooldownValEl.textContent = settings.globalCooldown; }
}

if (resetBtn) {
    resetBtn.addEventListener('click', (e) => {
        // ask for confirmation first
        try {
            if (!confirm('Reset interaction settings to defaults?')) return;
        } catch (err) {}
        // store previous settings for undo
        _previousSettings = Object.assign({}, settings);
        resetSettingsToDefaults();
        // show undo button briefly
        if (undoResetBtn) {
            undoResetBtn.style.display = 'inline-block';
            undoResetBtn.textContent = 'Undo';
            setTimeout(() => { try { undoResetBtn.style.display = 'none'; } catch (e) {} }, 7000);
        }
        const old = resetBtn.textContent;
        resetBtn.textContent = 'Reset ✓';
        setTimeout(() => { try { resetBtn.textContent = old; } catch (e) {} }, 900);
    });
}

if (undoResetBtn) {
    undoResetBtn.addEventListener('click', () => {
        if (!_previousSettings) return;
        settings = Object.assign({}, _previousSettings);
        try { localStorage.setItem('movementThreshold', String(settings.movementThreshold)); } catch (e) {}
        try { localStorage.setItem('requireDotThreshold', String(settings.requireDotThreshold)); } catch (e) {}
        try { localStorage.setItem('globalCooldown', String(settings.globalCooldown)); } catch (e) {}
        if (sensitivityEl) { sensitivityEl.value = settings.movementThreshold; sensitivityValEl.textContent = settings.movementThreshold; }
        if (alignmentEl) { alignmentEl.value = settings.requireDotThreshold; alignmentValEl.textContent = settings.requireDotThreshold; }
        if (cooldownEl) { cooldownEl.value = settings.globalCooldown; cooldownValEl.textContent = settings.globalCooldown; }
        _previousSettings = null;
        undoResetBtn.style.display = 'none';
    });
}

// wire debug toggle button
if (debugToggleBtn) {
    const applyDebugButtonState = () => {
        debugToggleBtn.textContent = debugEnabled ? 'Debug: On' : 'Toggle Debug Overlay';
        try { localStorage.setItem('debugOverlay', debugEnabled ? '1' : '0'); } catch (e) {}
    };
    debugToggleBtn.addEventListener('click', () => { debugEnabled = !debugEnabled; applyDebugButtonState(); });
    applyDebugButtonState();
}

// Play jelly chime safely by cloning the audio element so multiple sounds can overlap.
function playJellySfx() {
    if (!jellySfx) return;
    try {
        const s = jellySfx.cloneNode(true);
        s.volume = volumeSlider ? Number(volumeSlider.value) : 0.5;
        s.playbackRate = 0.92 + Math.random() * 0.16;
        s.currentTime = 0;
        document.body.appendChild(s);
        const p = s.play();
        if (p && typeof p.catch === 'function') {
            p.catch(() => { try { s.remove(); } catch (_) {} });
        }
        s.onended = () => { try { s.remove(); } catch (_) {} };
    } catch (e) {
        try { jellySfx.currentTime = 0; jellySfx.play().catch(()=>{}); } catch (_) {}
    }
}

// HiDPI canvas setup (keeps drawings crisp on Retina / high-DPI screens)
function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

class Particle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        // smaller particles so the trail looks smoother on high-DPI screens
        this.size = Math.random() * 3 + 1;
        this.speedX = (Math.random() * 1.6 - 0.8);
        this.speedY = (Math.random() * 1.6 - 0.8);
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
// global cooldown to avoid many chimes in quick succession
let lastSfxTime = 0;

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

    // cursor trail (reduced particles for smoother rendering)
    for (let i = 0; i < 3; i++) particles.push(new Particle(mouse.x, mouse.y));

    // if the mouse actually moved enough, check for jelly overlap and trigger chime
    if (prevMouse.x !== null && prevMouse.y !== null) {
        const dx = mouse.x - prevMouse.x;
        const dy = mouse.y - prevMouse.y;
        const moved = Math.sqrt(dx * dx + dy * dy);
    if (moved >= settings.movementThreshold && jellyEnabled) {
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
                // use jelly body radius (accounts for width/height variation)
                const bw = j.size * (j.wFactor || 1);
                const bh = j.size * (j.hFactor || 1);
                const bodyR = Math.max(bw, bh);
                // require the cursor be fairly well inside the jelly body
                if (dist < bodyR * 0.8) {
                    // directional check: movement should be (at least somewhat) towards jellyfish
                    const toJellyX = ddx / (dist || 1);
                    const toJellyY = ddy / (dist || 1);
                    const dot = mvx * toJellyX + mvy * toJellyY; // 1 = directly toward, -1 away
                    const now = Date.now();
                    const perJellyCooldown = 500; // ms (keep a reasonable minimum per-jelly cooldown)
                    const globalCooldown = settings.globalCooldown; // ms (user-tunable)
                    if (dot >= settings.requireDotThreshold && (now - j.lastHit) > perJellyCooldown && (now - lastSfxTime) > globalCooldown) {
                        j.disappearing = true;
                        j.hit = true;
                        j.lastHit = now;
                        lastSfxTime = now;
                        playJellySfx();
                        for (let p = 0; p < 14; p++) {
                            const part = new Particle(j.x, j.y);
                            part.color = j.color.replace(/hsla\(/, 'hsl(').replace(/,\s*0.9\)/, ')');
                            part.size = Math.random() * 2.4 + 0.8;
                            const angle = Math.random() * Math.PI * 2;
                            const speed = 0.8 + Math.random() * 2.6;
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

// Try to unlock audio on first user gesture — browsers block audio until a gesture occurs.
let audioUnlocked = false;
function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    try {
        if (window.AudioContext || window.webkitAudioContext) {
            const ac = new (window.AudioContext || window.webkitAudioContext)();
            ac.resume().catch(()=>{});
        }
    } catch (e) {}
    try {
        if (bgMusic && bgMusic.paused) {
            const p = bgMusic.play();
            if (p && typeof p.then === 'function') p.then(()=>{ bgMusic.pause(); bgMusic.currentTime = 0; }).catch(()=>{});
        }
    } catch (e) {}
}
document.addEventListener('pointerdown', unlockAudio, { once: true, capture: true });

// Music controls wiring
if (toggleMusic) toggleMusic.addEventListener('click', () => {
    try {
        if (bgMusic.paused) {
            bgMusic.play().catch(()=>{});
            toggleMusic.textContent = '🔇 Mute Music';
        } else {
            bgMusic.pause();
            toggleMusic.textContent = '🎵 Play Music';
        }
    } catch (e) {}
});

if (volumeSlider) volumeSlider.addEventListener('input', (e) => { try { bgMusic.volume = Number(e.target.value); } catch (e) {} });

// Jellyfish class
class Jellyfish {
    constructor(side = 'left') {
        // base size (used as a unit)
        this.size = 14 + Math.random() * 22; // 14..36
        // shape variation parameters
        this.wFactor = 0.8 + Math.random() * 1.6;   // width multiplier (0.8..2.4)
        this.hFactor = 0.7 + Math.random() * 1.0;   // height multiplier (0.7..1.7)
        this.rotation = (Math.random() - 0.5) * 0.6; // small tilt in radians
        // tentacle variation
        this.tentacles = 3 + Math.floor(Math.random() * 6); // 3..8
        this.tentacleLengthFactor = 0.9 + Math.random() * 1.4; // 0.9..2.3

        this.side = side;
        this.phase = Math.random() * Math.PI * 2;
        this.baseSpeed = 0.18 + Math.random() * 0.6; // base movement speed
        // direction vector
        this.dirX = 0;
        this.dirY = 0;
        // initial position depending on entry side (use CSS pixels so positions match visible canvas)
        if (side === 'left') {
            this.x = -this.size - Math.random() * 100;
            this.y = Math.random() * (canvas.clientHeight * 0.8) + canvas.clientHeight * 0.1;
            this.dirX = 1;
            this.dirY = (Math.random() - 0.5) * 0.4;
        } else if (side === 'right') {
            this.x = canvas.clientWidth + this.size + Math.random() * 100;
            this.y = Math.random() * (canvas.clientHeight * 0.8) + canvas.clientHeight * 0.1;
            this.dirX = -1;
            this.dirY = (Math.random() - 0.5) * 0.4;
        } else if (side === 'top') {
            this.y = -this.size - Math.random() * 100;
            this.x = Math.random() * (canvas.clientWidth * 0.8) + canvas.clientWidth * 0.1;
            this.dirY = 1;
            this.dirX = (Math.random() - 0.5) * 0.4;
        } else { // bottom
            this.y = canvas.clientHeight + this.size + Math.random() * 100;
            this.x = Math.random() * (canvas.clientWidth * 0.8) + canvas.clientWidth * 0.1;
            this.dirY = -1;
            this.dirX = (Math.random() - 0.5) * 0.4;
        }
        // color variation: hue full range, saturation and lightness slightly varied
        const h = Math.floor(Math.random() * 360);
        const sat = 60 + Math.floor(Math.random() * 30); // 60..90
        const light = 52 + Math.floor(Math.random() * 20); // 52..72
        const alpha = 0.82 + Math.random() * 0.14;
        this.color = `hsla(${h}, ${sat}%, ${light}%, ${alpha})`;
        // sway speed a little influenced by size so smaller jellies move slightly quicker
        this.swaySpeed = 0.012 + Math.random() * 0.02 + (36 - this.size) * 0.00015;
        this.age = 0;
        this.maxAge = 400 + Math.random() * 800; // frames
        // disappearance state
        this.alpha = 0.95;
        this.disappearing = false;
        this.hit = false; // whether already touched by mouse
        this.lastHit = 0; // timestamp of last time this jelly produced a sound
    }

    update() {
        this.phase += this.swaySpeed;
        // move according to base direction and global speed factor
        this.x += this.dirX * this.baseSpeed * speedFactor;
        this.y += this.dirY * this.baseSpeed * speedFactor;
        // gentle perpendicular bob (modulated by shape factors)
        const bob = Math.sin(this.phase) * (Math.min(3, this.size * 0.02));
        if (Math.abs(this.dirX) > Math.abs(this.dirY)) {
            this.y += bob * this.hFactor;
        } else {
            this.x += bob * this.wFactor;
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
        // hover and body radius calculation (use body width/height)
        const dx = (mouse.x || -9999) - this.x;
        const dy = (mouse.y || -9999) - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const bw = this.size * this.wFactor;
        const bh = this.size * this.hFactor;
        const bodyR = Math.max(bw, bh);
        const hover = dist < bodyR * 1.05;
        const hoverStrength = hover ? Math.max(0, 1 - dist / (bodyR * 1.05)) : 0;
        const pulse = 0.6 + 0.4 * Math.sin(this.phase * (2 + this.wFactor));

        if (hover && !this.disappearing) {
            ctx.shadowBlur = 28 * hoverStrength * pulse;
            ctx.shadowColor = `rgba(255,255,255,${0.32 * hoverStrength})`;
        } else {
            ctx.shadowBlur = 0;
        }
        // apply per-jellyfish alpha and position/rotation
        ctx.globalAlpha = this.alpha;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        // subtle halo when hovered
        if (hover && !this.disappearing) {
            const haloR = bodyR * (1.5 + 0.35 * pulse);
            const halo = ctx.createRadialGradient(0, 0, this.size * 0.18, 0, 0, haloR);
            halo.addColorStop(0, `rgba(255,255,255,${0.06 * hoverStrength})`);
            halo.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = halo;
            ctx.beginPath();
            ctx.arc(0, 0, haloR, 0, Math.PI * 2);
            ctx.fill();
        }

        // draw bell (body) with variable width/height
        const grd = ctx.createRadialGradient(0, -bh * 0.18, Math.min(bw, bh) * 0.08, 0, 0, bodyR);
        grd.addColorStop(0, this.color);
        grd.addColorStop(1, 'rgba(255,255,255,0.04)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.ellipse(0, 0, bw, bh, 0, 0, Math.PI * 2);
        ctx.fill();

        // stronger pulsing outline when hovered
        if (hover && !this.disappearing) {
            const outlineAlpha = 0.32 * hoverStrength * pulse;
            ctx.lineWidth = Math.max(0.8, bodyR * 0.06 * (0.9 + 0.4 * pulse));
            ctx.strokeStyle = `rgba(255,255,255,${outlineAlpha})`;
            ctx.beginPath();
            ctx.ellipse(0, 0, bw * 1.12, bh * 1.06, 0, 0, Math.PI * 2);
            ctx.stroke();
        }

        // tentacles
        for (let t = 0; t < this.tentacles; t++) {
            const spread = Math.PI * 0.85;
            const angle = (t / (this.tentacles - 1 || 1) - 0.5) * spread; // spread
            const baseX = Math.cos(angle) * bw * 0.55;
            const baseY = Math.sin(angle) * bh * 0.45 + bh * 0.35;
            const length = this.size * (1.05 + Math.random() * this.tentacleLengthFactor);
            const sway = Math.sin(this.phase * (0.9 + t * 0.07) + t) * (6 + this.size * 0.04);
            ctx.beginPath();
            ctx.moveTo(baseX, baseY);
            ctx.bezierCurveTo(
                baseX + sway * 0.18,
                baseY + sway * 0.28,
                Math.cos(angle) * length * 0.36 + sway * 0.4,
                baseY + length * 0.36,
                Math.cos(angle) * length + sway,
                baseY + length
            );
            ctx.strokeStyle = this.color;
            ctx.lineWidth = Math.max(0.6, this.size * 0.04);
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
            this.x > canvas.clientWidth + this.size + 200 ||
            this.y < -this.size - 200 ||
            this.y > canvas.clientHeight + this.size + 200 ||
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

    // translucent background for trailing effect (use CSS pixel dims so fill covers visible canvas)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);

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

    // debug overlay draws after everything else so it's visible
    if (debugEnabled) {
        // small overlay: draw body radii around each jelly and movement vector
        try {
            ctx.save();
            // movement vector
            if (prevMouse.x !== null && mouse.x !== null) {
                ctx.strokeStyle = 'rgba(255,255,255,0.85)';
                ctx.lineWidth = 1.8;
                ctx.beginPath();
                ctx.moveTo(prevMouse.x, prevMouse.y);
                ctx.lineTo(mouse.x, mouse.y);
                ctx.stroke();
                // arrow head
                const dx = mouse.x - prevMouse.x; const dy = mouse.y - prevMouse.y;
                const ang = Math.atan2(dy, dx);
                const ah = 8;
                ctx.beginPath();
                ctx.moveTo(mouse.x, mouse.y);
                ctx.lineTo(mouse.x - ah * Math.cos(ang - 0.4), mouse.y - ah * Math.sin(ang - 0.4));
                ctx.lineTo(mouse.x - ah * Math.cos(ang + 0.4), mouse.y - ah * Math.sin(ang + 0.4));
                ctx.closePath();
                ctx.fillStyle = 'rgba(255,255,255,0.85)';
                ctx.fill();
            }

            for (let i = 0; i < jellyfish.length; i++) {
                const j = jellyfish[i];
                const bw = j.size * (j.wFactor || 1);
                const bh = j.size * (j.hFactor || 1);
                const bodyR = Math.max(bw, bh);
                // draw body radius
                ctx.beginPath();
                ctx.strokeStyle = 'rgba(120,200,255,0.6)';
                ctx.lineWidth = 1.5;
                ctx.ellipse(j.x, j.y, bw * 0.8, bh * 0.8, 0, 0, Math.PI * 2);
                ctx.stroke();

                // draw full body outline for reference
                ctx.beginPath();
                ctx.strokeStyle = 'rgba(80,140,200,0.25)';
                ctx.lineWidth = 1;
                ctx.ellipse(j.x, j.y, bw * 1.05, bh * 1.05, 0, 0, Math.PI * 2);
                ctx.stroke();

                // if mouse present, draw line from mouse to jelly and display distance/dot
                if (mouse.x !== null && prevMouse.x !== null) {
                    const ddx = j.x - mouse.x;
                    const ddy = j.y - mouse.y;
                    const dist = Math.sqrt(ddx * ddx + ddy * ddy);
                    const mvx = (mouse.x - prevMouse.x);
                    const mvy = (mouse.y - prevMouse.y);
                    const moved = Math.sqrt(mvx * mvx + mvy * mvy) || 1;
                    const mvxn = mvx / moved; const mvyn = mvy / moved;
                    const toJx = ddx / (dist || 1); const toJy = ddy / (dist || 1);
                    const dot = mvxn * toJx + mvyn * toJy;
                    ctx.beginPath();
                    ctx.moveTo(mouse.x, mouse.y);
                    ctx.lineTo(j.x, j.y);
                    ctx.strokeStyle = 'rgba(200,200,120,0.6)';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    // text
                    const tx = mouse.x + 8; const ty = mouse.y - 8 + i * 12;
                    ctx.fillStyle = 'rgba(220,240,255,0.95)';
                    ctx.font = '12px system-ui, -apple-system, Roboto, Arial';
                    ctx.fillText(`d=${Math.round(dist)} dot=${dot.toFixed(2)}`, tx, ty);
                }
            }
        } catch (e) {
            // ignore drawing errors
        } finally {
            ctx.restore();
        }
    }

    requestAnimationFrame(animate);
}

animate();