// ===== Ядро: генератор случайных чисел, утилиты, константы =====

const MAP_W = 48;
const MAP_H = 32;
const MAX_DEPTH = 10;
const FOV_RADIUS = 8;
const INV_SIZE = 18;

// Тайлы карты
const T = {
  WALL: 0,
  FLOOR: 1,
  DOOR: 2,
  ODOOR: 3,
  STAIRS: 4,
  UPSTAIRS: 5,
  WATER: 6,
  GRASS: 7,
  CHASM: 8,
  BARS: 9, // решётка клетки: непроходима, но прозрачна
  FOUNTAIN: 10, // фонтан: из него пьют, подойдя вплотную
  DRY: 11, // высохший фонтан
  ALTAR: 12, // алтарь: благословение за монеты
  ALTAR_OFF: 13, // погасший алтарь
};

const DIRS8 = [
  [0, -1], [1, 0], [0, 1], [-1, 0],
  [1, -1], [1, 1], [-1, 1], [-1, -1],
];
const DIRS4 = DIRS8.slice(0, 4);

// mulberry32: маленький, быстрый, с сериализуемым состоянием
function makeRNG(seed) {
  let s = seed >>> 0;
  const r = {
    next() {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(a, b) { return a + Math.floor(r.next() * (b - a + 1)); },
    pick(arr) { return arr[Math.floor(r.next() * arr.length)]; },
    chance(p) { return r.next() < p; },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(r.next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    weighted(entries) { // [[value, weight], ...]
      let total = 0;
      for (const e of entries) total += e[1];
      let roll = r.next() * total;
      for (const e of entries) {
        roll -= e[1];
        if (roll < 0) return e[0];
      }
      return entries[entries.length - 1][0];
    },
    get state() { return s; },
    set state(v) { s = v | 0; },
  };
  return r;
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const inBounds = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
const idx = (x, y) => y * MAP_W + x;
const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);

// Правильные русские окончания: plural(5, 'монета', 'монеты', 'монет')
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

// Линия Брезенхэма от a до b (включая обе точки)
function lineBetween(x0, y0, x1, y1) {
  const pts = [];
  let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    pts.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return pts;
}

function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
