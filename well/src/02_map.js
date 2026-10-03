// ===== Генерация карт =====

function isPassableTile(t) {
  return t === T.FLOOR || t === T.DOOR || t === T.ODOOR || t === T.STAIRS ||
    t === T.UPSTAIRS || t === T.WATER || t === T.GRASS;
}
function blocksSight(t) {
  return t === T.WALL || t === T.DOOR || t === T.GRASS;
}

function newTiles(fill) {
  const a = new Uint8Array(MAP_W * MAP_H);
  a.fill(fill);
  return a;
}

// BFS-расстояния от точки по проходимым клеткам (двери считаются проходимыми)
function bfsDistances(tiles, sx, sy, passable = isPassableTile) {
  const d = new Int32Array(MAP_W * MAP_H).fill(-1);
  const q = [idx(sx, sy)];
  d[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const c = q[h], cx = c % MAP_W, cy = (c / MAP_W) | 0;
    for (const [dx, dy] of DIRS8) {
      const nx = cx + dx, ny = cy + dy;
      if (!inBounds(nx, ny)) continue;
      const n = idx(nx, ny);
      if (d[n] >= 0 || !passable(tiles[n])) continue;
      d[n] = d[c] + 1;
      q.push(n);
    }
  }
  return d;
}

function carveRoom(tiles, r) {
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) tiles[idx(x, y)] = T.FLOOR;
}

function carveCorridor(tiles, rng, ax, ay, bx, by) {
  const horizFirst = rng.chance(0.5);
  const cells = [];
  let x = ax, y = ay;
  const stepX = () => { while (x !== bx) { x += sign(bx - x); cells.push([x, y]); } };
  const stepY = () => { while (y !== by) { y += sign(by - y); cells.push([x, y]); } };
  if (horizFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
  for (const [cx, cy] of cells) if (tiles[idx(cx, cy)] === T.WALL) tiles[idx(cx, cy)] = T.FLOOR;
}

const roomCenter = (r) => ({ x: r.x + (r.w >> 1), y: r.y + (r.h >> 1) });
const inRoom = (r, x, y) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;

function genRooms(rng) {
  const tiles = newTiles(T.WALL);
  const rooms = [];
  const target = rng.int(8, 12);
  for (let tries = 0; tries < 400 && rooms.length < target; tries++) {
    const w = rng.int(4, 10), h = rng.int(3, 7);
    const x = rng.int(1, MAP_W - w - 2), y = rng.int(1, MAP_H - h - 2);
    const r = { x, y, w, h };
    let ok = true;
    for (const o of rooms) {
      if (x - 2 < o.x + o.w && x + w + 2 > o.x && y - 2 < o.y + o.h && y + h + 2 > o.y) { ok = false; break; }
    }
    if (ok) rooms.push(r);
  }
  for (const r of rooms) carveRoom(tiles, r);
  // Цепочка комнат по x плюс несколько петель — чтобы можно было убегать кругами
  const order = rooms.slice().sort((a, b) => a.x - b.x);
  for (let i = 0; i < order.length - 1; i++) {
    const a = roomCenter(order[i]), b = roomCenter(order[i + 1]);
    carveCorridor(tiles, rng, a.x, a.y, b.x, b.y);
  }
  const loops = rng.int(1, 3);
  for (let i = 0; i < loops; i++) {
    const a = roomCenter(rng.pick(rooms)), b = roomCenter(rng.pick(rooms));
    carveCorridor(tiles, rng, a.x, a.y, b.x, b.y);
  }
  // Двери там, где коридор входит в комнату
  for (const r of rooms) {
    for (let x = r.x - 1; x <= r.x + r.w; x++) {
      for (let y = r.y - 1; y <= r.y + r.h; y++) {
        const onRing = x === r.x - 1 || x === r.x + r.w || y === r.y - 1 || y === r.y + r.h;
        if (!onRing || !inBounds(x, y) || tiles[idx(x, y)] !== T.FLOOR) continue;
        const wallL = !inBounds(x - 1, y) || tiles[idx(x - 1, y)] === T.WALL;
        const wallR = !inBounds(x + 1, y) || tiles[idx(x + 1, y)] === T.WALL;
        const wallU = !inBounds(x, y - 1) || tiles[idx(x, y - 1)] === T.WALL;
        const wallD = !inBounds(x, y + 1) || tiles[idx(x, y + 1)] === T.WALL;
        if (((wallL && wallR) || (wallU && wallD)) && rng.chance(0.55)) tiles[idx(x, y)] = T.DOOR;
      }
    }
  }
  return { tiles, rooms };
}

function genCaves(rng) {
  for (let attempt = 0; attempt < 30; attempt++) {
    let tiles = newTiles(T.WALL);
    for (let y = 1; y < MAP_H - 1; y++)
      for (let x = 1; x < MAP_W - 1; x++)
        tiles[idx(x, y)] = rng.chance(0.44) ? T.WALL : T.FLOOR;
    for (let it = 0; it < 5; it++) {
      const next = newTiles(T.WALL);
      for (let y = 1; y < MAP_H - 1; y++) {
        for (let x = 1; x < MAP_W - 1; x++) {
          let walls = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++)
              if (tiles[idx(x + dx, y + dy)] === T.WALL) walls++;
          next[idx(x, y)] = walls >= 5 || (it < 2 && walls <= 1) ? T.WALL : T.FLOOR;
        }
      }
      tiles = next;
    }
    // Оставляем только самую большую связную область
    const seen = new Int32Array(MAP_W * MAP_H).fill(-1);
    let best = -1, bestSize = 0, region = 0;
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i] !== T.FLOOR || seen[i] >= 0) continue;
      const d = bfsDistances(tiles, i % MAP_W, (i / MAP_W) | 0);
      let size = 0;
      for (let j = 0; j < d.length; j++) if (d[j] >= 0) { seen[j] = region; size++; }
      if (size > bestSize) { bestSize = size; best = region; }
      region++;
    }
    if (bestSize < 520) continue;
    for (let i = 0; i < tiles.length; i++) if (tiles[i] === T.FLOOR && seen[i] !== best) tiles[i] = T.WALL;
    return { tiles, rooms: [] };
  }
  return genRooms(rng); // запасной вариант, если пещера не задалась
}

// Пятна воды и травы для атмосферы
function sprinkle(tiles, rng, tile, blobs) {
  for (let b = 0; b < blobs; b++) {
    let x = rng.int(2, MAP_W - 3), y = rng.int(2, MAP_H - 3);
    const steps = rng.int(6, 22);
    for (let s = 0; s < steps; s++) {
      if (inBounds(x, y) && tiles[idx(x, y)] === T.FLOOR) tiles[idx(x, y)] = tile;
      const [dx, dy] = rng.pick(DIRS4);
      x = clamp(x + dx, 1, MAP_W - 2); y = clamp(y + dy, 1, MAP_H - 2);
    }
  }
}

function randomFloorIn(tiles, rng, room, avoid) {
  for (let t = 0; t < 200; t++) {
    const x = room ? rng.int(room.x, room.x + room.w - 1) : rng.int(1, MAP_W - 2);
    const y = room ? rng.int(room.y, room.y + room.h - 1) : rng.int(1, MAP_H - 2);
    if (tiles[idx(x, y)] === T.FLOOR && !(avoid && avoid(x, y))) return { x, y };
  }
  return null;
}

// Логово Пса: ручная арена с клеткой Барсика наверху
function genLair(rng) {
  const tiles = newTiles(T.WALL);
  const arena = { x: 8, y: 2, w: 32, h: 14 };
  carveRoom(tiles, arena);
  // Колонны
  for (const [px, py] of [[13, 6], [13, 11], [34, 6], [34, 11], [18, 9], [29, 9]]) {
    tiles[idx(px, py)] = T.WALL;
    tiles[idx(px + 1, py)] = T.WALL;
  }
  // Клетка с котом
  const cat = { x: 24, y: 3 };
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      if (dx || dy) tiles[idx(cat.x + dx, cat.y + dy)] = T.BARS;
  // Проход вниз и стартовая комната
  const start = { x: 24, y: 27 };
  const startRoom = { x: 19, y: 24, w: 11, h: 6 };
  carveRoom(tiles, startRoom);
  for (let y = arena.y + arena.h; y < startRoom.y; y++) tiles[idx(24, y)] = T.FLOOR;
  tiles[idx(24, 20)] = T.DOOR;
  // Две боковые кладовки с припасами
  const left = { x: 6, y: 20, w: 7, h: 5 };
  const right = { x: 35, y: 20, w: 7, h: 5 };
  carveRoom(tiles, left); carveRoom(tiles, right);
  carveCorridor(tiles, rng, 12, 22, 19, 26);
  carveCorridor(tiles, rng, 35, 22, 29, 26);
  sprinkle(tiles, rng, T.GRASS, 3);
  tiles[idx(start.x, start.y)] = T.UPSTAIRS;
  return { tiles, rooms: [arena, startRoom, left, right], start, stairs: null, cat, arena };
}

function generateLevel(depth, rng) {
  const theme = themeFor(depth);
  if (depth >= MAX_DEPTH) {
    const lv = genLair(rng);
    lv.theme = theme;
    return lv;
  }
  const base = theme === 'caves' ? genCaves(rng) : genRooms(rng);
  const { tiles, rooms } = base;
  if (theme === 'caves') { sprinkle(tiles, rng, T.WATER, rng.int(2, 4)); sprinkle(tiles, rng, T.GRASS, rng.int(3, 6)); }
  else { sprinkle(tiles, rng, T.WATER, rng.int(0, 2)); sprinkle(tiles, rng, T.GRASS, rng.int(0, 3)); }

  // Старт и лестница — максимально далеко друг от друга
  let start = rooms.length ? randomFloorIn(tiles, rng, rooms[0]) : randomFloorIn(tiles, rng, null);
  if (rooms.length) {
    // стартуем из случайной крайней комнаты
    const r = rng.chance(0.5) ? rooms.reduce((a, b) => (a.x < b.x ? a : b)) : rooms.reduce((a, b) => (a.x > b.x ? a : b));
    start = randomFloorIn(tiles, rng, r) || start;
  }
  const d = bfsDistances(tiles, start.x, start.y);
  let far = start, farD = -1;
  for (let i = 0; i < d.length; i++) {
    if (d[i] > farD && tiles[i] === T.FLOOR) { farD = d[i]; far = { x: i % MAP_W, y: (i / MAP_W) | 0 }; }
  }
  tiles[idx(start.x, start.y)] = T.UPSTAIRS;
  tiles[idx(far.x, far.y)] = T.STAIRS;
  return { tiles, rooms, start, stairs: far, theme };
}

// Все ли проходимые клетки достижимы со старта (для тестов и самопроверки)
function levelConnected(tiles, start) {
  const d = bfsDistances(tiles, start.x, start.y);
  for (let i = 0; i < tiles.length; i++) if (isPassableTile(tiles[i]) && d[i] < 0) return false;
  return true;
}
