const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

(async () => {
  const outDir = path.resolve(__dirname, '..', 'test-output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  const url = process.env.TARGET_URL || 'https://colorfuloceanvibes.netlify.app/2.html';
  console.log('Target URL:', url);

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);

  try {
    await page.goto(url, { waitUntil: 'networkidle2' });
    console.log('Page loaded');
    await page.waitForSelector('#hud-level', { timeout: 8000 });
    console.log('HUD present');

    // ensure skip controls exist
    const skipExists = await page.$('#skipLevelSelect') && await page.$('#skipLevelBtn');
    console.log('Skip UI present:', !!skipExists);

    // helper to grab global state
    const dumpState = async () => {
      return await page.evaluate(() => {
        return {
          level: window.level,
          poppedCount: window.poppedCount,
          jellyCount: window.jellyfish ? window.jellyfish.length : 0,
          gameWon: window.gameWon || false
        };
      });
    };

    // skip to level 9
    await page.select('#skipLevelSelect', '9');
    await page.click('#skipLevelBtn');
    await page.waitForTimeout(1400);
    let state = await dumpState();
    console.log('After skip to 9 state:', state);
    await page.screenshot({ path: path.join(outDir, 'skip-9.png') });

    // skip to level 10
    await page.select('#skipLevelSelect', '10');
    await page.click('#skipLevelBtn');
    await page.waitForTimeout(1400);
    state = await dumpState();
    console.log('After skip to 10 state:', state);
    await page.screenshot({ path: path.join(outDir, 'skip-10.png') });

    // simulate pointer movement across the canvas to try to trigger pops
    const canvasBox = await page.evaluate(() => {
      const c = document.getElementById('canvas');
      const r = c.getBoundingClientRect();
      return { x: Math.round(r.left + r.width * 0.2), y: Math.round(r.top + r.height * 0.5), w: Math.round(r.width), h: Math.round(r.height) };
    });
    console.log('Canvas box:', canvasBox);

    // do a sweeping mouse movement across the center area for a bit
    const steps = 60;
    for (let i = 0; i < steps; i++) {
      const x = canvasBox.x + (i / (steps - 1)) * (canvasBox.w * 0.6);
      const y = canvasBox.y + canvasBox.h * (0.45 + 0.05 * Math.sin(i * 0.2));
      await page.mouse.move(x, y);
      await page.waitForTimeout(40);
    }

    await page.waitForTimeout(1200);
    state = await dumpState();
    console.log('After sweeping mouse state:', state);
    await page.screenshot({ path: path.join(outDir, 'after-sweep.png') });

    // watch clams movement (if any jellyfish are Clam instances)
    const clamMotion = await page.evaluate(async () => {
      const sample = [];
      for (let t = 0; t < 6; t++) {
        const clams = (window.jellyfish || []).filter(j => j && j.constructor && j.constructor.name === 'Clam');
        sample.push(clams.map(c => ({ x: c.x, y: c.y })));
        await new Promise(r => setTimeout(r, 350));
      }
      return sample;
    });
    fs.writeFileSync(path.join(outDir, 'clam-motion.json'), JSON.stringify(clamMotion, null, 2));
    console.log('Clam samples recorded:', clamMotion.length);

    // attempt to reach a win by continuing to sweep a little more
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 40; j++) {
        const x = canvasBox.x + Math.random() * (canvasBox.w * 0.8);
        const y = canvasBox.y + Math.random() * (canvasBox.h * 0.8);
        await page.mouse.move(x, y);
        await page.waitForTimeout(18);
      }
      await page.waitForTimeout(600);
      const st = await dumpState();
      console.log('Interim sweep state:', st);
      if (st.gameWon) break;
    }

    const final = await dumpState();
    console.log('Final state:', final);
    await page.screenshot({ path: path.join(outDir, 'final.png') });

    await browser.close();
    console.log('Smoke test complete');
    if (final.gameWon) process.exit(0); else process.exit(2);
  } catch (err) {
    console.error('Smoke test failed:', err);
    await page.screenshot({ path: path.join(outDir, 'error.png') }).catch(()=>{});
    await browser.close();
    process.exit(3);
  }
})();
