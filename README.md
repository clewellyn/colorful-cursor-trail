# Colorful Cursor Trail

A simple visual app that creates a colorful trail following your cursor using HTML5 Canvas and JavaScript.

## How to use
Open `2.html` in your browser and move your mouse to see the effect.

## Files
- `2.html`: Main HTML file
- `1.css`: Styles for the app
- `3.js`: JavaScript for the cursor trail effect

### New feature
- Jellyfish swim across the screen as a background visual element. They are drawn procedurally on the canvas and move with a gentle sailing/bobbing motion. You can control the background 8-bit music using the on-screen controls.

### Interaction tuning UI
The page now includes an "Interaction Settings" panel (top-left) where you can tune how the cursor interacts with jellyfish:

- Sensitivity: minimum cursor movement (pixels) required to consider a touch.
- Alignment: how directly your movement must point at a jellyfish (1 = directly toward, -1 = away).
- Global cooldown: minimum time in milliseconds between chimes so repeated hits don't spam sound.

Values persist to your browser's localStorage. There's a Reset button (with an Undo option) to revert to defaults.

Debug overlay: use the "Toggle Debug Overlay" button in the settings to visualize detection radii, the movement vector, per-jelly distance, and the computed directional dot. This helps diagnose accidental chimes on different devices.

## Demo
![Demo Screenshot](demo.png)

---
Inspired by Codepen.io visual effects.