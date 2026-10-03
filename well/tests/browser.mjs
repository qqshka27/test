// Проверка в настоящем браузере: страница грузится, нет ошибок, можно играть.
// Запуск: node tests/browser.mjs [папка для скриншотов]
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }

const here = dirname(fileURLToPath(import.meta.url));
const page_url = pathToFileURL(join(here, '..', 'dist', 'index.html')).href;
const shots = process.argv[2] || join(here, '..', 'shots');
mkdirSync(shots, { recursive: true });

const browser = await pw.chromium.launch();
const errors = [];
async function run(name, viewport, mobile) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${name} console: ${m.text()}`); });
  await page.goto(page_url);
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(shots, `${name}-title.png`) });
  await page.click('#t-new');
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(shots, `${name}-start.png`) });
  // Исследуем и деремся, пока не станет интересно
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('x');
    await page.waitForTimeout(400);
    for (let k = 0; k < 6; k++) {
      // атакуем ближайшего врага, если он рядом
      const dir = await page.evaluate(() => {
        const e = visibleEnemies(G).sort((a, b) => dist(a, G.player) - dist(b, G.player))[0];
        if (!e) return null;
        const s = travelStep(G, e.x, e.y);
        return s;
      });
      if (!dir) break;
      const key = { '0,-1': 'ArrowUp', '0,1': 'ArrowDown', '-1,0': 'ArrowLeft', '1,0': 'ArrowRight', '-1,-1': 'q', '1,-1': 'e', '-1,1': 'z', '1,1': 'c' }[dir.join(',')];
      await page.keyboard.press(key);
      await page.waitForTimeout(60);
    }
    const st = await page.evaluate(() => ({ over: !!G.over, depth: G.depth, onStairs: G.level.tiles[idx(G.player.x, G.player.y)] === T.STAIRS }));
    if (st.over) break;
    if (st.onStairs && st.depth < 3) { await page.keyboard.press('>'); await page.waitForTimeout(500); }
    if (i === 6) await page.screenshot({ path: join(shots, `${name}-play.png`) });
  }
  await page.screenshot({ path: join(shots, `${name}-later.png`) });
  await page.keyboard.press('i');
  await page.waitForTimeout(300);
  await page.keyboard.press('a');
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(shots, `${name}-inv.png`) });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  const info = await page.evaluate(() => ({ depth: G.depth, turn: G.turn, hp: G.player.hp, lvl: G.player.level, over: G.over, w: document.documentElement.scrollWidth, vw: innerWidth }));
  console.log(name, JSON.stringify(info));
  await ctx.close();
}
await run('desktop', { width: 1280, height: 800 }, false);
await run('phone', { width: 390, height: 844 }, true);
await browser.close();
if (errors.length) { console.log('ОШИБКИ:\n' + errors.join('\n')); process.exit(1); }
console.log('ошибок нет');
