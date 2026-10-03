// Загружает игровой движок (без отрисовки) в Node для тестов и бота.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', 'src');

// Только логика: файлы до 08 включительно, отрисовка и интерфейс не нужны
const ENGINE_FILES = readdirSync(src).filter((f) => /^0[0-8]_.*\.js$/.test(f)).sort();

const EXPORTS = [
  'MAP_W', 'MAP_H', 'MAX_DEPTH', 'T', 'DIRS8', 'MONSTERS', 'WEAPONS', 'ARMORS', 'POTIONS', 'SCROLLS', 'WANDS',
  'makeRNG', 'generateLevel', 'levelConnected', 'inRoom', 'isPassableTile', 'bfsDistances', 'computeFOV', 'dijkstraMap',
  'newGame', 'playerMove', 'playerWait', 'playerDescend', 'playerPickup', 'useItem', 'throwItem', 'zapWand',
  'equipItem', 'dropFromInv', 'itemName', 'isKnown', 'exploreStep', 'travelStep', 'visibleEnemies',
  'nearestEnemy', 'serializeGame', 'deserializeGame', 'idx', 'dist', 'statsOf', 'playerDamage', 'playerArmor',
  'monsterVisible', 'canSee', 'itemAt', 'actorAt', 'spawnMonster', 'xpToNext', 'enterLevel', 'plural',
  'lineBetween', 'itemActions', 'readScroll', 'drinkPotion', 'removeOne', 'addToInventory', 'makeItem',
];

export function loadEngine() {
  const code = ENGINE_FILES.map((f) => readFileSync(join(src, f), 'utf8')).join('\n;\n');
  // eslint-disable-next-line no-new-func
  const factory = new Function(`${code}\nreturn { ${EXPORTS.join(', ')} };`);
  return factory();
}
