const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Audio setup
const bgMusic = document.getElementById('bgMusic');
const toggleMusic = document.getElementById('toggleMusic');
const volumeSlider = document.getElementById('volumeSlider');

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

// Set canvas size to window size
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Particle class
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
let mouse = {
    x: null,
    y: null
};

// Track mouse movement
canvas.addEventListener('mousemove', (event) => {
    mouse.x = event.x;
    mouse.y = event.y;
    for(let i = 0; i < 5; i++) {
        particles.push(new Particle(mouse.x, mouse.y));
    }
});

function animate() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
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