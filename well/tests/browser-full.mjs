// Полные партии в браузере: бот играет, страница рисует. Ловим ошибки отрисовки на всех глубинах.
// Запуск: node tests/browser-full.mjs [партий]
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const here = dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(join(here, '..', 'dist', 'index.html')).href;
const botSrc = readFileSync(join(here, 'botlogic.js'), 'utf8');
const games = Number(process.argv[2] || 3);
const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 800, height: 600 }, ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url);
await page.waitForTimeout(500);
await page.evaluate((src) => {
  // eslint-disable-next-line no-eval
  // Константы верхнего уровня не видны через window, поэтому достаём их через eval
  const E = new Proxy({}, { get: (_, k) => (0, eval)(String(k)) });
  window.__bot = (0, eval)(`${src}; makeBot`)(E);
}, botSrc);
const heroes = ['vasya', 'granny', 'janitor'];
for (let i = 0; i < games; i++) {
  const hero = heroes[i % 3];
  await page.evaluate(([s, h]) => { UI.hero = h; startNewGame(s); }, [4000 + i, hero]);
  let res;
  for (let chunk = 0; chunk < 200; chunk++) {
    res = await page.evaluate(() => {
      for (let k = 0; k < 40 && !G.over; k++) { __bot.botTurn(G); afterAction(); }
      return { over: G.over, depth: G.depth, turn: G.turn };
    });
    await page.waitForTimeout(16); // дать кадру отрисоваться
    if (res.over) break;
  }
  console.log(hero, JSON.stringify(res));
}
await browser.close();
if (errors.length) { console.log('ОШИБКИ:\n' + [...new Set(errors)].join('\n')); process.exit(1); }
console.log('ошибок нет');
