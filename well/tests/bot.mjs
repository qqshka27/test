// Бот, который играет сам. Нужен для поиска падений и настройки баланса.
// Запуск: node tests/bot.mjs [число партий] [начальный сид] [герой]
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEngine } from './engine.mjs';

export const E = loadEngine();
const here = dirname(fileURLToPath(import.meta.url));
// eslint-disable-next-line no-new-func
const makeBot = new Function(readFileSync(join(here, 'botlogic.js'), 'utf8') + '\nreturn makeBot;')();
const { botTurn } = makeBot(E);

export function playOne(seed, maxTurns = 10000, hero) {
  const g = E.newGame(seed, hero);
  let actions = 0, stuck = 0;
  while (!g.over && actions < maxTurns) {
    const before = g.turn;
    botTurn(g);
    g.fx.length = 0; // в Node эффекты некому показывать
    actions++;
    if (g.turn === before) { if (++stuck > 50) E.playerWait(g); } else stuck = 0;
  }
  return g;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const n = Number(process.argv[2] || 50);
  const seed0 = Number(process.argv[3] || 1);
  const hero = process.argv[4];
  const depths = {}, causes = {};
  let wins = 0, turns = 0, levels = 0;
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const g = playOne(seed0 + i, 10000, hero);
    const key = g.over ? (g.over.won ? 'win' : g.depth) : `timeout@${g.depth}`;
    depths[key] = (depths[key] || 0) + 1;
    if (g.over && !g.over.won) causes[g.over.cause] = (causes[g.over.cause] || 0) + 1;
    if (g.over && g.over.won) wins++;
    turns += g.turn; levels += g.player.level;
  }
  console.log(`партий: ${n}, побед: ${wins} (${Math.round((wins / n) * 100)}%), ср. ходов: ${Math.round(turns / n)}, ср. уровень: ${(levels / n).toFixed(1)}, ${Date.now() - t0} мс`);
  console.log('где закончилась игра:', depths);
  console.log('причины смерти:', Object.entries(causes).sort((a, b) => b[1] - a[1]));
}
