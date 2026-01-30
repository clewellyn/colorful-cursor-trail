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

// Underwater FX (optional, disabled by default). We'll create a guarded WebAudio chain when enabled.
const underwaterToggleEl = document.getElementById('underwaterFx');
let _audioCtx = null;
let _mediaSrc = null;
let _lpFilter = null;
let _wetGain = null;
let _dryGain = null;
let _useFallback = false;
let _bgOriginalVolume = null;
function initUnderwaterAudio() {
    try {
        if (_audioCtx) return;
        if (!(window.AudioContext || window.webkitAudioContext)) return;
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        // create nodes: dry gain (direct) + lowpass -> wet gain
        _dryGain = _audioCtx.createGain();
        _dryGain.gain.value = 1.0; // by default play dry
        _lpFilter = _audioCtx.createBiquadFilter();
        _lpFilter.type = 'lowpass';
        _lpFilter.frequency.value = 900; // gentle low-pass to create muffled/underwater tone
        _lpFilter.Q.value = 0.8;
        _wetGain = _audioCtx.createGain();
        _wetGain.gain.value = 0.0; // start muted (effect off)

        // create source node from the music element when needed (do not create multiple times)
        try {
            _mediaSrc = _audioCtx.createMediaElementSource(bgMusic);
            // route: media -> dryGain -> destination
            _mediaSrc.connect(_dryGain);
            _dryGain.connect(_audioCtx.destination);
            // and media -> lpFilter -> wetGain -> destination (wet path)
            _mediaSrc.connect(_lpFilter);
            _lpFilter.connect(_wetGain);
            _wetGain.connect(_audioCtx.destination);
            // ensure the audio context is running
            try { _audioCtx.resume().catch(()=>{}); } catch (e) {}
        } catch (e) {
            // some browsers disallow multiple MediaElementSource creations; ignore safely
            _mediaSrc = null;
            _useFallback = true; // mark that we should fallback to volume-only behavior
        }
    } catch (e) {}
}

function setUnderwaterEnabled(enabled) {
    try {
        if (!(_audioCtx)) initUnderwaterAudio();
        if (!(_audioCtx && _mediaSrc && _lpFilter && _wetGain && _dryGain)) {
            // fallback: adjust bgMusic.volume smoothly if we cannot create a MediaElementSource
            if (_useFallback && bgMusic) {
                try {
                    if (_bgOriginalVolume === null) _bgOriginalVolume = Number(bgMusic.volume) || 0.5;
                    const target = enabled ? 0.25 : _bgOriginalVolume;
                    const start = Number(bgMusic.volume) || 0.0;
                    const dur = 350; // ms
                    const steps = 12;
                    const stepMs = Math.max(8, Math.floor(dur / steps));
                    const delta = (target - start) / steps;
                    let s = 0;
                    const iv = setInterval(() => {
                        s++;
                        try { bgMusic.volume = Math.min(1, Math.max(0, start + delta * s)); } catch (e) {}
                        if (s >= steps) clearInterval(iv);
                    }, stepMs);
                    appendLog('info', `[audio-fallback] underwater ${enabled ? 'enabled' : 'disabled'} volume faded to ${target}`);
                    return;
                } catch (e) { return; }
            }
            return;
        }
        // ensure audio context is running
        try { _audioCtx.resume().catch(()=>{}); } catch (e) {}
        if (enabled) {
            // fade into wet (muffled) sound and reduce dry slightly
            _wetGain.gain.cancelScheduledValues(_audioCtx.currentTime);
            _dryGain.gain.cancelScheduledValues(_audioCtx.currentTime);
            _wetGain.gain.setValueAtTime(_wetGain.gain.value, _audioCtx.currentTime);
            _dryGain.gain.setValueAtTime(_dryGain.gain.value, _audioCtx.currentTime);
            _wetGain.gain.linearRampToValueAtTime(0.9, _audioCtx.currentTime + 0.35);
            _dryGain.gain.linearRampToValueAtTime(0.25, _audioCtx.currentTime + 0.35);
            appendLog('info', '[audio] underwater FX enabled');
            // ensure music is playing after routing (some browsers require explicit play)
            try { bgMusic.play().catch(()=>{}); } catch (e) {}
        } else {
            // fade out wet and restore dry
            _wetGain.gain.cancelScheduledValues(_audioCtx.currentTime);
            _dryGain.gain.cancelScheduledValues(_audioCtx.currentTime);
            _wetGain.gain.setValueAtTime(_wetGain.gain.value, _audioCtx.currentTime);
            _dryGain.gain.setValueAtTime(_dryGain.gain.value, _audioCtx.currentTime);
            _wetGain.gain.linearRampToValueAtTime(0.0, _audioCtx.currentTime + 0.35);
            _dryGain.gain.linearRampToValueAtTime(1.0, _audioCtx.currentTime + 0.35);
            appendLog('info', '[audio] underwater FX disabled');
            try { bgMusic.play().catch(()=>{}); } catch (e) {}
        }
    } catch (e) {}
}

// wire underwater toggle if present
if (underwaterToggleEl) {
    try {
        underwaterToggleEl.checked = false;
        underwaterToggleEl.addEventListener('change', (ev) => {
            // ensure user gesture unlocks audio
            try { unlockAudio(); } catch (e) {}
            setUnderwaterEnabled(ev.target.checked);
            showToast(ev.target.checked ? 'Underwater FX enabled' : 'Underwater FX disabled', 1200, 'info');
        });
    } catch (e) {}
}

// id counter for debug/logging
let _jellyIdCounter = 1;
// Level progression
let level = 1;
let poppedCount = 0;
const popsToNextLevel = 30;

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
// settings UI: safe mode and in-page logs
const safeModeEl = document.getElementById('safeMode');
const showLogsBtn = document.getElementById('showLogs');
const exportLogsBtn = document.getElementById('exportLogs');
let inPageLogs = [];
function appendLog(type, text) {
    const t = `${new Date().toLocaleTimeString()} ${text}`;
    inPageLogs.push({ type, text: t });
    if (inPageLogs.length > 200) inPageLogs.shift();
    // render if panel exists
    const panel = document.querySelector('.log-panel');
    if (panel) {
        panel.innerHTML = inPageLogs.slice().reverse().map(l => `<div class="log-entry ${l.type}">${l.text}</div>`).join('');
    }
}

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

// HUD: create and update on-screen level/progress indicator
function createHUD() {
    try {
        let h = document.querySelector('.game-hud');
        if (!h) {
            h = document.createElement('div');
            h.className = 'game-hud';
            h.innerHTML = `
                <div class="hud-row"><span class="hud-label">Level</span><span id="hud-level" class="hud-value">${level}</span></div>
                <div class="hud-row"><span class="hud-label">Popped</span><span id="hud-popped" class="hud-value">${poppedCount}/${popsToNextLevel}</span></div>
                <div class="hud-row"><span class="hud-label">Audio</span><span id="hud-audio-mode" class="hud-value hud-audio">Off</span></div>
                <div class="hud-bar"><div id="hud-bar-fill" class="hud-bar-fill" style="width:0%"></div></div>
            `;
            document.body.appendChild(h);
        }
    } catch (e) {}
}

function updateHUD() {
    try {
        const levelEl = document.getElementById('hud-level');
        const poppedEl = document.getElementById('hud-popped');
        const barFill = document.getElementById('hud-bar-fill');
        if (levelEl) levelEl.textContent = String(level);
        if (poppedEl) poppedEl.textContent = `${poppedCount}/${popsToNextLevel}`;
        if (barFill) {
            const pct = Math.min(100, Math.round((poppedCount / popsToNextLevel) * 100));
            barFill.style.width = pct + '%';
        }
        // also refresh audio indicator if present
        try { updateAudioIndicator(); } catch (e) {}
    } catch (e) {}
}

// update small HUD audio indicator to reflect WebAudio vs fallback and On/Off state
function updateAudioIndicator() {
    try {
        const el = document.getElementById('hud-audio-mode');
        if (!el) return;
        const toggled = underwaterToggleEl && underwaterToggleEl.checked;
        // prefer _audioCtx presence to detect WebAudio path; _useFallback indicates fallback
        if (toggled) {
            if (_useFallback) el.textContent = 'Underwater (Fallback)';
            else if (_audioCtx) el.textContent = 'Underwater (WebAudio)';
            else el.textContent = 'Underwater';
        } else {
            if (_useFallback) el.textContent = 'Normal (Fallback)';
            else if (_audioCtx) el.textContent = 'Normal (WebAudio)';
            else el.textContent = 'Normal';
        }
    } catch (e) {}
}

// small HUD pop animation when an enemy is popped
function animateHudPop() {
    try {
        const bar = document.getElementById('hud-bar-fill');
        if (!bar) return;
        bar.classList.add('pop');
        setTimeout(() => { try { bar.classList.remove('pop'); } catch (e) {} }, 520);
    } catch (e) {}
}

// create a centered level transition overlay and call callback after animation completes
function createLevelTransition(text, cb) {
    try {
        const el = document.createElement('div');
        el.className = 'level-transition';
        el.innerHTML = `<div class="lt-main">${text}</div><span class="lt-sub">Prepare to pop!</span>`;
        document.body.appendChild(el);
        // force layout then show
        requestAnimationFrame(() => { el.classList.add('show'); });
        // after animation completes, hide and callback
        setTimeout(() => {
            try { el.classList.remove('show'); } catch (e) {}
            setTimeout(() => { try { el.remove(); } catch (e) {};
                try { if (typeof cb === 'function') cb(); } catch (ex) {}
            }, 300);
        }, 1100);
    } catch (e) { if (typeof cb === 'function') cb(); }
}

// create HUD on load
createHUD();
updateHUD();

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

// wire safe mode and show logs
if (safeModeEl) {
    // initialize
    try { safeModeEl.checked = localStorage.getItem('safeMode') === '1'; } catch (e) {}
    // Safe mode runtime behaviour: when enabled, apply stricter interaction thresholds
    const SAFE_MODE_CONFIG = { movementThreshold: 6.5, requireDotThreshold: 0.6, globalCooldown: 600 };
    let _savedSettingsBeforeSafe = null;
    function applySafeMode(enabled) {
        try {
            if (enabled) {
                // save current user settings so we can restore later
                if (!_savedSettingsBeforeSafe) _savedSettingsBeforeSafe = Object.assign({}, settings);
                settings.movementThreshold = SAFE_MODE_CONFIG.movementThreshold;
                settings.requireDotThreshold = SAFE_MODE_CONFIG.requireDotThreshold;
                settings.globalCooldown = SAFE_MODE_CONFIG.globalCooldown;
                try { localStorage.setItem('movementThreshold', String(settings.movementThreshold)); } catch (e) {}
                try { localStorage.setItem('requireDotThreshold', String(settings.requireDotThreshold)); } catch (e) {}
                try { localStorage.setItem('globalCooldown', String(settings.globalCooldown)); } catch (e) {}
                // update UI sliders if present
                if (sensitivityEl) { sensitivityEl.value = settings.movementThreshold; sensitivityValEl.textContent = settings.movementThreshold; }
                if (alignmentEl) { alignmentEl.value = settings.requireDotThreshold; alignmentValEl.textContent = settings.requireDotThreshold; }
                if (cooldownEl) { cooldownEl.value = settings.globalCooldown; cooldownValEl.textContent = settings.globalCooldown; }
                appendLog('info', `[safeMode] enabled: applied stricter thresholds`);
            } else {
                // restore previous settings if we have them
                if (_savedSettingsBeforeSafe) {
                    settings = Object.assign({}, _savedSettingsBeforeSafe);
                    try { localStorage.setItem('movementThreshold', String(settings.movementThreshold)); } catch (e) {}
                    try { localStorage.setItem('requireDotThreshold', String(settings.requireDotThreshold)); } catch (e) {}
                    try { localStorage.setItem('globalCooldown', String(settings.globalCooldown)); } catch (e) {}
                    if (sensitivityEl) { sensitivityEl.value = settings.movementThreshold; sensitivityValEl.textContent = settings.movementThreshold; }
                    if (alignmentEl) { alignmentEl.value = settings.requireDotThreshold; alignmentValEl.textContent = settings.requireDotThreshold; }
                    if (cooldownEl) { cooldownEl.value = settings.globalCooldown; cooldownValEl.textContent = settings.globalCooldown; }
                    _savedSettingsBeforeSafe = null;
                }
                appendLog('info', `[safeMode] disabled: restored user settings`);
            }
        } catch (e) {}
    }

    // apply initial state and persist changes
    try { applySafeMode(safeModeEl.checked); } catch (e) {}
    safeModeEl.addEventListener('change', (e) => {
        try { localStorage.setItem('safeMode', e.target.checked ? '1' : '0'); } catch (e) {}
        applySafeMode(e.target.checked);
    });
}
if (showLogsBtn) {
    let panel = null;
    showLogsBtn.addEventListener('click', () => {
        if (!panel) {
            panel = document.createElement('div');
            panel.className = 'log-panel';
            document.body.appendChild(panel);
        }
        panel.classList.toggle('show');
        // render existing logs
        panel.innerHTML = inPageLogs.slice().reverse().map(l => `<div class="log-entry ${l.type}">${l.text}</div>`).join('');
    });
}

// Export logs button: copies logs to clipboard or downloads as a .txt fallback
function getLogsText() {
    // Filter out known UI helper lines that may have been accidentally captured
    const ignoredSnippets = [
        'Values persist in your browser. Tweak to reduce accidental chimes.',
        'Settings are saved locally. Increase Sensitivity or Cooldown to reduce accidental chimes.'
    ];
    return inPageLogs.slice().map(l => l.text).filter(t => {
        for (let s of ignoredSnippets) if (t.indexOf(s) !== -1) return false;
        return true;
    }).join('\n');
}

// Small on-screen toast for quick confirmations
function showToast(msg, ms = 2000, type = 'info') {
    try {
        let t = document.querySelector('.app-toast');
        if (!t) {
            t = document.createElement('div');
            t.className = 'app-toast';
            t.setAttribute('role', 'status');
            t.setAttribute('aria-live', 'polite');
            document.body.appendChild(t);
        }
        // normalize type: 'success' | 'error' | 'info'
        t.classList.remove('success', 'error', 'info');
        t.classList.add(type);
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(t._hideTimer);
        t._hideTimer = setTimeout(() => {
            try { t.classList.remove('show'); } catch (e) {}
        }, ms);
    } catch (e) {
        // ignore DOM errors
    }
}

if (exportLogsBtn) {
    exportLogsBtn.addEventListener('click', async () => {
        const text = getLogsText();
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                appendLog('info', '[export] copied logs to clipboard');
                showToast('Logs copied to clipboard', 1800, 'success');
            } else {
                throw new Error('clipboard-unavailable');
            }
        } catch (e) {
            // fallback to download
            try {
                const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'colorful-cursor-logs.txt';
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                appendLog('info', '[export] downloaded logs as colorful-cursor-logs.txt');
                showToast('Logs downloaded', 1800, 'success');
            } catch (ex) {
                appendLog('suppressed', '[export] failed to export logs');
                showToast('Export failed', 2000, 'error');
            }
        }
    });
}

// Play jelly chime safely by cloning the audio element so multiple sounds can overlap.
function playJellySfx() {
    if (!jellySfx) return;
    if (!sfxEnabled) return;
    try {
        const s = jellySfx.cloneNode(true);
        // mark clones so we can find/remove them when pausing
        try { s.dataset.sfxClone = '1'; } catch (e) {}
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

// Bubble particle emitted from tails — rises and fades
class Bubble {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = 2 + Math.random() * 3;
        this.speedX = (Math.random() * 0.6 - 0.3) * 0.4;
        // bubbles drift upward
        this.speedY = - (0.3 + Math.random() * 0.9);
        this.alpha = 0.9 + Math.random() * 0.08;
        this.life = 600 + Math.random() * 900; // ms
        this.birth = Date.now();
        this.color = `rgba(220,245,255,${0.9 + Math.random() * 0.1})`;
    }

    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        // gentle slow rise and fade
        const age = Date.now() - this.birth;
        this.alpha = Math.max(0, 1 - age / this.life);
        this.size *= 0.999;
    }

    draw() {
        try {
            ctx.save();
            ctx.globalAlpha = Math.max(0, this.alpha * 0.95);
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.arc(this.x, this.y, Math.max(0.6, this.size), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        } catch (e) {}
    }
}

let particles = [];
let mouse = { x: null, y: null };
let prevMouse = { x: null, y: null };
// track whether the mouse listener is currently attached (so we can remove it when paused)
let mouseListenerAttached = false;
// global cooldown to avoid many chimes in quick succession
let lastSfxTime = 0;
// whether we allow jelly sfx to play (paused will set this false)
let sfxEnabled = true;
// pause/resume controls
let paused = false;
let rafId = null;
let _wasMusicPlaying = false;

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
function onCanvasMouseMove(event) {
    if (paused) return; // ignore input while paused
    prevMouse.x = mouse.x;
    prevMouse.y = mouse.y;
    mouse.x = event.clientX;
    mouse.y = event.clientY;

    // cursor trail (reduced particles for smoother rendering)
    for (let i = 0; i < 3; i++) particles.push(new Particle(mouse.x, mouse.y));

    // if we have a previous mouse sample, check jelly overlap and trigger chime when appropriate
    if (prevMouse.x !== null && prevMouse.y !== null && jellyEnabled) {
        const dx = mouse.x - prevMouse.x;
        const dy = mouse.y - prevMouse.y;
        const moved = Math.sqrt(dx * dx + dy * dy);
        // normalized movement vector (guard against zero moved below)
        const mvx = moved ? dx / moved : 0;
        const mvy = moved ? dy / moved : 0;

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

            // compute previous distance to detect an entering motion
            const prevDx = j.x - (prevMouse.x || mouse.x);
            const prevDy = j.y - (prevMouse.y || mouse.y);
            const prevDist = Math.sqrt(prevDx * prevDx + prevDy * prevDy);
            const enteringRequired = prevDist > bodyR * 1.05 && dist < bodyR * 0.8;

            // only proceed if movement was large enough OR we detected an entering crossing
            if (!(moved >= settings.movementThreshold || enteringRequired)) continue;

            // directional check: when entering, we allow direction to be ignored; otherwise require dot threshold
            const toJellyX = ddx / (dist || 1);
            const toJellyY = ddy / (dist || 1);
            const dot = mvx * toJellyX + mvy * toJellyY; // 1 = directly toward, -1 away

            const now = Date.now();
            const perJellyCooldown = 600; // ms (slightly larger to avoid rapid retriggers)
            const globalCooldown = settings.globalCooldown; // ms (user-tunable)

            // small spawn grace to avoid jellies spawning under the cursor causing a chime
            const spawnGrace = 140; // ms
            if ((now - j.spawnTime) < spawnGrace) {
                // suppressed due to recent spawn
                try { console.log('[chime-suppressed] jelly=', j.id, 'reason=spawnGrace', 'ageMs=', now - j.spawnTime); } catch (e) {}
                appendLog('suppressed', `[spawnGrace] jelly=${j.id} ageMs=${now - j.spawnTime}`);
                continue;
            }

            const directionOk = enteringRequired ? true : (dot >= settings.requireDotThreshold);

            if (dist < bodyR * 0.8 && directionOk && (now - j.lastHit) > perJellyCooldown && (now - lastSfxTime) > globalCooldown) {
                // diagnostic log to help tune thresholds if needed
                try {
                    const msg = `[chime] jelly=${j.id} dist=${Math.round(dist)} prevDist=${Math.round(prevDist)} moved=${Math.round(moved)} dot=${dot.toFixed(2)} entering=${enteringRequired} nowDiff=${now - lastSfxTime}`;
                    console.log(msg);
                    appendLog('chime', msg);
                } catch (e) {}
                j.disappearing = true;
                j.hit = true;
                j.lastHit = now;
                lastSfxTime = now;
                // track pops for level progression
                try { poppedCount++; appendLog('info', `[progress] popped=${poppedCount}/${popsToNextLevel} level=${level}`); updateHUD(); animateHudPop(); } catch (e) {}
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
                // if we've reached the pops required, advance level (with a transition)
                try { if (poppedCount >= popsToNextLevel) { goToNextLevel(); } } catch (e) {}
                break; // only trigger one jelly per movement
            } else {
                // suppressed — log why for diagnostics
                try {
                    const reason = (now - j.lastHit) <= perJellyCooldown ? 'perJellyCooldown' : (now - lastSfxTime) <= globalCooldown ? 'globalCooldown' : 'direction/movement-failed';
                    const msg = `[chime-suppressed] jelly=${j.id} dist=${Math.round(dist)} prevDist=${Math.round(prevDist)} moved=${Math.round(moved)} dot=${dot.toFixed(2)} entering=${enteringRequired} reason=${reason}`;
                    console.log(msg);
                    appendLog('suppressed', msg);
                } catch (e) {}
            }
        }
    }
}

// attach the listener initially
try { canvas.addEventListener('mousemove', onCanvasMouseMove); mouseListenerAttached = true; } catch (e) {}

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
            this.id = _jellyIdCounter++;
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
        this.spawnTime = Date.now(); // small grace period after spawning to avoid immediate triggers
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

// Stingray entity — flatter, faster, and requires the same hit logic
class Stingray {
    constructor(side = 'left') {
        // make sizes more varied (some smaller, some much larger)
        this.size = 12 + Math.random() * 40; // 12..52
        // wider and flatter variation
        this.wFactor = 1.2 + Math.random() * 1.2; // wider range
        this.hFactor = 0.35 + Math.random() * 0.35; // shallow height
        this.rotation = (Math.random() - 0.5) * 0.35;
        this.side = side;
        this.id = _jellyIdCounter++;
        this.phase = Math.random() * Math.PI * 2;
        // make stingrays slower and more fluid than before; baseSpeed tuned to be gentler
        this.baseSpeed = 0.16 + Math.random() * 0.46; // ~0.16..0.62 (slower than previous)
        this.dirX = 0; this.dirY = 0;
        if (side === 'left') {
            this.x = -this.size - Math.random() * 120;
            this.y = Math.random() * (canvas.clientHeight * 0.8) + canvas.clientHeight * 0.1;
            this.dirX = 1; this.dirY = (Math.random() - 0.5) * 0.25;
        } else if (side === 'right') {
            this.x = canvas.clientWidth + this.size + Math.random() * 120;
            this.y = Math.random() * (canvas.clientHeight * 0.8) + canvas.clientHeight * 0.1;
            this.dirX = -1; this.dirY = (Math.random() - 0.5) * 0.25;
        } else if (side === 'top') {
            this.y = -this.size - Math.random() * 120;
            this.x = Math.random() * (canvas.clientWidth * 0.8) + canvas.clientWidth * 0.1;
            this.dirY = 1; this.dirX = (Math.random() - 0.5) * 0.25;
        } else {
            this.y = canvas.clientHeight + this.size + Math.random() * 120;
            this.x = Math.random() * (canvas.clientWidth * 0.8) + canvas.clientWidth * 0.1;
            this.dirY = -1; this.dirX = (Math.random() - 0.5) * 0.25;
        }
        const h = Math.floor(Math.random() * 360);
        const sat = 40 + Math.floor(Math.random() * 30);
        const light = 28 + Math.floor(Math.random() * 18);
        const alpha = 0.9;
        this.color = `hsla(${h}, ${sat}%, ${light}%, ${alpha})`;
        // make the sway a bit faster and with a larger amplitude for a wavy, fluid motion
        this.swaySpeed = 0.014 + Math.random() * 0.02;
        this.swayAmp = 0.9 + Math.random() * 1.5; // amplitude multiplier for undulation
        this.age = 0;
        this.maxAge = 300 + Math.random() * 700;
        this.alpha = 0.98;
        this.disappearing = false;
        this.hit = false;
        this.lastHit = 0;
        this.spawnTime = Date.now();
        // bubble emission control
        this._lastBubbleTime = Date.now() - (Math.random() * 800);
        this._bubbleInterval = 360 + Math.random() * 980; // ms between bubble spawns (varies per ray)
    }

    update() {
        this.phase += this.swaySpeed;
        // smoother, more sinuous motion - apply base movement and a larger perpendicular undulation
        const undulation = Math.sin(this.phase * (1.2 + this.wFactor * 0.2)) * (2 + this.size * 0.03) * this.swayAmp;
        this.x += this.dirX * this.baseSpeed * speedFactor + (Math.abs(this.dirY) > Math.abs(this.dirX) ? undulation * 0.2 : 0);
        this.y += this.dirY * this.baseSpeed * speedFactor + (Math.abs(this.dirX) > Math.abs(this.dirY) ? undulation * 0.6 : undulation * 0.35);
        // gentle size/alpha changes when disappearing
        if (this.disappearing) { this.alpha -= 0.02; this.size *= 0.989; }
        this.age++;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        const bw = this.size * this.wFactor;
        const bh = this.size * this.hFactor;
        // undulation amount for visual deformation
        const und = Math.sin(this.phase * 1.8) * (1.5 + this.size * 0.02) * this.swayAmp;

        // body: smooth ellipse but slightly deformed by undulation for a fluid look
        const g = ctx.createLinearGradient(-bw * 0.5, 0, bw * 0.5, 0);
        g.addColorStop(0, this.color);
        g.addColorStop(1, 'rgba(255,255,255,0.06)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(0, 0, bw, Math.max(2, bh + und * 0.35), 0, 0, Math.PI * 2);
        ctx.fill();

        // slight top ridge and bottom curve to imply undulating wing edges
        ctx.lineWidth = Math.max(0.5, this.size * 0.02);
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        // top curve
        ctx.beginPath();
        ctx.moveTo(-bw * 0.55, -und * 0.4);
        ctx.quadraticCurveTo(0, -bh * 0.55 - und * 0.8, bw * 0.55, -und * 0.4);
        ctx.stroke();
        // bottom curve
        ctx.beginPath();
        ctx.moveTo(-bw * 0.55, und * 0.3 + bh * 0.08);
        ctx.quadraticCurveTo(0, bh * 0.6 + und * 0.9, bw * 0.55, und * 0.3 + bh * 0.08);
        ctx.stroke();

        // tail: choose shape by level - longer triangular tail on level 2, otherwise a smoother waving tail
        if (typeof level !== 'undefined' && level === 2) {
            // long, narrow 'icicle' triangular tail for stingrays on level 2
            ctx.beginPath();
            // base point near the body
            const baseY = bh * 0.55 + und * 0.2;
            // make the base narrow relative to body width
            const baseHalf = Math.max(3, Math.min(bw * 0.28, this.size * 0.42));
            // extend the tip much further back (longer tail)
            const tipY = baseY + Math.max(this.size * 2.2, bh * 2.8) + Math.abs(und) * 0.9;
            // draw narrow triangle with tip centered below the body
            ctx.moveTo(-baseHalf, baseY);
            ctx.lineTo(0, tipY);
            ctx.lineTo(baseHalf, baseY);
            ctx.closePath();
            ctx.fillStyle = this.color;
            ctx.fill();
            // subtle outline for the triangular tail
            ctx.lineWidth = Math.max(0.3, this.size * 0.014);
            ctx.strokeStyle = 'rgba(255,255,255,0.04)';
            ctx.stroke();
            // compute tail tip (local coords) and emit bubbles from the tip
            try {
                const tailTipLocal = { x: 0, y: tipY };
                const worldX = this.x + Math.cos(this.rotation) * tailTipLocal.x - Math.sin(this.rotation) * tailTipLocal.y;
                const worldY = this.y + Math.sin(this.rotation) * tailTipLocal.x + Math.cos(this.rotation) * tailTipLocal.y;
                const now = Date.now();
                if ((now - this._lastBubbleTime) > this._bubbleInterval && Math.random() < 0.92) {
                    this._lastBubbleTime = now;
                    const count = 1 + Math.floor(Math.random() * 3);
                    for (let b = 0; b < count; b++) {
                        const bx = worldX + (Math.random() - 0.5) * Math.max(4, this.size * 0.08);
                        const by = worldY + (Math.random() - 0.1) * Math.max(4, this.size * 0.08);
                        particles.push(new Bubble(bx, by));
                    }
                }
            } catch (e) {}
        } else {
            // default: longer and narrower tail (icicle-like) but keep a slight curve
            const baseY = bh * 0.55 + und * 0.2;
            const baseHalf = Math.max(3, Math.min(bw * 0.22, this.size * 0.36));
            const tipY = baseY + Math.max(this.size * 1.8, bh * 2.0) + Math.abs(und) * 0.6;
            // draw two thin quadratic sides meeting at a far tip to give a tapered look
            ctx.beginPath();
            ctx.moveTo(-baseHalf, baseY);
            ctx.quadraticCurveTo(-baseHalf * 0.2, (baseY + tipY) * 0.45, 0, tipY);
            ctx.quadraticCurveTo(baseHalf * 0.2, (baseY + tipY) * 0.45, baseHalf, baseY);
            ctx.closePath();
            ctx.fillStyle = this.color;
            ctx.fill();
            // occasional small bubbles from the narrow tip (less frequently)
            try {
                const tailTipLocal = { x: 0, y: tipY };
                const worldX = this.x + Math.cos(this.rotation) * tailTipLocal.x - Math.sin(this.rotation) * tailTipLocal.y;
                const worldY = this.y + Math.sin(this.rotation) * tailTipLocal.x + Math.cos(this.rotation) * tailTipLocal.y;
                const now = Date.now();
                if ((now - this._lastBubbleTime) > (this._bubbleInterval * 1.6) && Math.random() < 0.45) {
                    this._lastBubbleTime = now;
                    const bx = worldX + (Math.random() - 0.5) * Math.max(3, this.size * 0.06);
                    const by = worldY + (Math.random() - 0.2) * Math.max(3, this.size * 0.06);
                    particles.push(new Bubble(bx, by));
                }
            } catch (e) {}
        }
        ctx.restore();
        ctx.globalAlpha = 1;
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
    if (jellyfish.length < maxJelly) {
        if (level === 1) jellyfish.push(new Jellyfish(side));
        else jellyfish.push(new Stingray(side));
    }
}

function goToNextLevel() {
    // show a centered transition banner, then actually advance level and respawn
    const nextLevel = level + 1;
    createLevelTransition(`Level ${nextLevel}`, () => {
        try {
            level = nextLevel;
            appendLog('info', `[level] advancing to level ${level}`);
            showToast(`Level ${level}: Now popping ${level === 2 ? 'Stingrays' : 'next creatures'}`, 2200, 'success');
            // clear existing entities and reset counters
            jellyfish.length = 0;
            poppedCount = 0;
            spawnTimer = 0;
            // spawn initial set for new level
            for (let i = 0; i < 3; i++) spawnJelly();
            updateHUD();
        } catch (e) {}
    });
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

    rafId = requestAnimationFrame(animate);
}

animate();

// Pause / Resume button wiring
const pauseBtn = document.getElementById('pauseBtn');
function setPaused(p) {
    if (p === paused) return;
    paused = !!p;
    if (paused) {
        // stop the animation loop
        if (rafId) try { cancelAnimationFrame(rafId); } catch (e) {}
        rafId = null;
        // pause music if playing
        try {
            if (bgMusic && !bgMusic.paused) { _wasMusicPlaying = true; bgMusic.pause(); } else { _wasMusicPlaying = false; }
        } catch (e) {}
        // disable sfx while paused and remove any cloned sfx elements
        try {
            sfxEnabled = false;
            const clones = document.querySelectorAll('audio[data-sfx-clone]');
            clones.forEach(c => { try { c.pause(); c.remove(); } catch (e) {} });
        } catch (e) {}
        // detach mousemove listener to fully prevent interaction while paused
        try {
            if (mouseListenerAttached) { canvas.removeEventListener('mousemove', onCanvasMouseMove); mouseListenerAttached = false; }
        } catch (e) {}
        appendLog('info', '[pause] paused - sfx disabled');
        if (pauseBtn) pauseBtn.textContent = '▶ Resume';
    } else {
        // resume
        try { sfxEnabled = true; } catch (e) {}
        // re-attach mouse listener
        try {
            if (!mouseListenerAttached) { canvas.addEventListener('mousemove', onCanvasMouseMove); mouseListenerAttached = true; }
        } catch (e) {}
        if (_wasMusicPlaying) try { bgMusic.play().catch(()=>{}); } catch (e) {}
        // restart animation
        rafId = requestAnimationFrame(animate);
        if (pauseBtn) pauseBtn.textContent = '⏸️ Pause';
        appendLog('info', '[pause] resumed - sfx enabled');
    }
}

if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
        setPaused(!paused);
    });
}