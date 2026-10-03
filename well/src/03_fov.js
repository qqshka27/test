// ===== Поле зрения (рекурсивное теневое сканирование) и поиск путей =====

const FOV_OCTANTS = [
  [1, 0, 0, 1], [0, 1, 1, 0], [0, -1, 1, 0], [-1, 0, 0, 1],
  [-1, 0, 0, -1], [0, -1, -1, 0], [0, 1, -1, 0], [1, 0, 0, -1],
];

// opaque(x, y) -> bool; visit(x, y) вызывается для каждой видимой клетки
function computeFOV(ox, oy, radius, opaque, visit) {
  visit(ox, oy);
  const r2 = radius * radius + radius;
  for (const [xx, xy, yx, yy] of FOV_OCTANTS) {
    const castLight = (row, start, end) => {
      if (start < end) return;
      let newStart = 0;
      for (let j = row; j <= radius; j++) {
        let blocked = false;
        for (let dx = -j, dy = -j; dx <= 0; dx++) {
          const lSlope = (dx - 0.5) / (dy + 0.5);
          const rSlope = (dx + 0.5) / (dy - 0.5);
          if (start < rSlope) continue;
          if (end > lSlope) break;
          const x = ox + dx * xx + dy * xy;
          const y = oy + dx * yx + dy * yy;
          if (!inBounds(x, y)) continue;
          if (dx * dx + dy * dy <= r2) visit(x, y);
          if (blocked) {
            if (opaque(x, y)) { newStart = rSlope; continue; }
            blocked = false;
            start = newStart;
          } else if (opaque(x, y) && j < radius) {
            blocked = true;
            castLight(j + 1, start, lSlope);
            newStart = rSlope;
          }
        }
        if (blocked) break;
      }
    };
    castLight(1, 1.0, 0.0);
  }
}

// Видна ли клетка b из a по прямой (для стрельбы и заклинаний)
function clearLine(level, ax, ay, bx, by) {
  const pts = lineBetween(ax, ay, bx, by);
  for (let i = 1; i < pts.length - 1; i++) {
    const t = level.tiles[idx(pts[i][0], pts[i][1])];
    if (blocksSight(t) || t === T.WALL) return false;
  }
  return true;
}

// Карта Дейкстры: расстояние до цели для каждой клетки.
// cost(x, y) -> число или Infinity (непроходимо)
function dijkstraMap(goals, cost, maxDist = 60) {
  const d = new Float32Array(MAP_W * MAP_H).fill(Infinity);
  // Очередь с корзинами: стоимости маленькие целые, так быстрее кучи
  const buckets = [];
  for (const g of goals) {
    d[idx(g.x, g.y)] = 0;
    (buckets[0] ||= []).push(idx(g.x, g.y));
  }
  for (let b = 0; b < buckets.length && b <= maxDist; b++) {
    const list = buckets[b];
    if (!list) continue;
    for (let k = 0; k < list.length; k++) {
      const c = list[k];
      if (d[c] < b) continue;
      const cx = c % MAP_W, cy = (c / MAP_W) | 0;
      for (const [dx, dy] of DIRS8) {
        const nx = cx + dx, ny = cy + dy;
        if (!inBounds(nx, ny)) continue;
        const step = cost(nx, ny);
        if (step === Infinity) continue;
        const nd = b + step;
        const n = idx(nx, ny);
        if (nd < d[n]) {
          d[n] = nd;
          (buckets[nd] ||= []).push(n);
        }
      }
    }
  }
  return d;
}

// Путь от (sx, sy) до цели по карте Дейкстры, построенной от цели
function pathFrom(dmap, sx, sy, blocked) {
  const path = [];
  let x = sx, y = sy;
  for (let guard = 0; guard < 200; guard++) {
    const here = dmap[idx(x, y)];
    if (here === 0) return path;
    let best = null, bestV = here;
    for (const [dx, dy] of DIRS8) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const v = dmap[idx(nx, ny)];
      if (v < bestV && !(blocked && blocked(nx, ny) && v !== 0)) { bestV = v; best = [nx, ny]; }
    }
    if (!best) return path.length ? path : null;
    path.push(best);
    [x, y] = best;
  }
  return path;
}
