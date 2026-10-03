// ===== Автопутешествие и автоисследование, сохранение =====

function visibleEnemies(g) {
  return g.actors.filter((a) => !MONSTERS[a.type].peaceful && !a.disguised && canSee(g, a.x, a.y) && monsterVisible(g, a));
}

function travelCost(g) {
  const lv = g.level;
  return (x, y) => {
    const i = idx(x, y);
    if (!lv.seen[i]) return Infinity;
    const t = lv.tiles[i];
    if (!isPassableTile(t)) return Infinity;
    const trap = trapAt(g, x, y);
    if (trap && !trap.hidden) return 25; // обходим, но если иначе никак — наступаем
    return 1;
  };
}

// Следующий шаг пути к клетке (или null)
function travelStep(g, tx, ty) {
  const p = g.player;
  if (p.x === tx && p.y === ty) return null;
  const cost = travelCost(g);
  // Цель может быть монстром/сундуком — разрешаем входить в неё
  const map = dijkstraMap([{ x: tx, y: ty }], (x, y) => (x === tx && y === ty ? 1 : cost(x, y)), 120);
  if (map[idx(p.x, p.y)] === Infinity) return null;
  const path = pathFrom(map, p.x, p.y, (x, y) => {
    const a = actorAt(g, x, y);
    return a && a !== p;
  });
  if (!path || !path.length) return null;
  return [path[0][0] - p.x, path[0][1] - p.y];
}

function exploreGoals(g) {
  const lv = g.level, p = g.player;
  const goals = [];
  for (let y = 1; y < MAP_H - 1; y++) {
    for (let x = 1; x < MAP_W - 1; x++) {
      const i = idx(x, y);
      if (!lv.seen[i] || !isPassableTile(lv.tiles[i])) continue;
      if (x === p.x && y === p.y) continue;
      let frontier = false;
      for (const [dx, dy] of DIRS8) if (!lv.seen[idx(x + dx, y + dy)]) { frontier = true; break; }
      if (frontier) goals.push({ x, y });
    }
  }
  const full = p.inv.length >= INV_SIZE;
  for (const it of g.items) {
    if (it.price || it.dropped || !lv.seen[idx(it.x, it.y)]) continue;
    if (full && it.kind !== 'gold' && it.kind !== 'chest' && !(STACKABLE.has(it.kind) && p.inv.some((o) => o.kind === it.kind && o.type === it.type))) continue;
    if (it.x === p.x && it.y === p.y) continue;
    const tr = trapAt(g, it.x, it.y);
    if (tr && !tr.hidden) continue;
    goals.push({ x: it.x, y: it.y });
  }
  // Алтари стоит хотя бы показать — к ним путь не ведём, это решение игрока
  // Замаскированные мимики выглядят как сундуки — исследователь к ним тоже идёт
  for (const a of g.actors) if (a.disguised && lv.seen[idx(a.x, a.y)]) goals.push({ x: a.x, y: a.y });
  return goals;
}

// Один шаг автоисследования. Возвращает 'moved' | 'danger' | 'done' | 'stuck'
function exploreStep(g) {
  if (g.over) return 'stuck';
  if (visibleEnemies(g).length) return 'danger';
  const p = g.player;
  const goals = exploreGoals(g);
  if (!goals.length) return 'done';
  const cost = travelCost(g);
  const goalSet = new Set(goals.map((q) => idx(q.x, q.y)));
  const map = dijkstraMap(goals, (x, y) => (goalSet.has(idx(x, y)) ? 1 : cost(x, y)), 150);
  if (map[idx(p.x, p.y)] === Infinity) return 'done';
  const path = pathFrom(map, p.x, p.y, (x, y) => {
    const a = actorAt(g, x, y);
    return a && a !== p && !a.disguised;
  });
  if (!path || !path.length) return 'stuck';
  const [nx, ny] = path[0];
  playerMove(g, nx - p.x, ny - p.y);
  return 'moved';
}

// ---------- Сохранение ----------

function serializeGame(g) {
  const p = g.player;
  const data = {
    ...g,
    rng: g.rng.state,
    fx: [],
    _chase: undefined,
    _phase: undefined,
    itemId: ITEM_ID,
    player: { ...p, weapon: p.weapon ? p.weapon.id : null, armor: p.armor ? p.armor.id : null },
    level: { ...g.level, tiles: Array.from(g.level.tiles), seen: Array.from(g.level.seen), visible: undefined },
    actors: g.actors.map((a) => ({ ...a, wanderMap: undefined })),
  };
  return JSON.stringify(data);
}

function deserializeGame(json) {
  const d = typeof json === 'string' ? JSON.parse(json) : json;
  const rng = makeRNG(0);
  rng.state = d.rng;
  ITEM_ID = d.itemId || 1000;
  const g = { ...d, rng, fx: [] };
  delete g.itemId;
  g.level.tiles = Uint8Array.from(d.level.tiles);
  g.level.seen = Uint8Array.from(d.level.seen);
  g.level.visible = new Uint8Array(MAP_W * MAP_H);
  const p = g.player;
  p.weapon = p.inv.find((o) => o.id === d.player.weapon) || null;
  p.armor = p.inv.find((o) => o.id === d.player.armor) || null;
  updateFOV(g);
  computePlayerMaps(g);
  return g;
}
