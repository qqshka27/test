// ===== Игра: состояние, ходы, бой =====

function newGame(seed) {
  seed = (seed === undefined ? (Math.random() * 2 ** 32) >>> 0 : seed >>> 0);
  ITEM_ID = 1;
  const g = {
    version: 1,
    seed,
    rng: makeRNG(seed),
    depth: 0,
    turn: 0,
    nextId: 1,
    actors: [],
    items: [],
    traps: [],
    messages: [],
    fx: [],
    over: null,
    stats: { kills: 0, goldFound: 0, potions: 0, scrolls: 0, deepest: 1, killedBy: null },
    player: null,
    level: null,
  };
  setupAppearances(g);
  g.player = {
    id: 0, type: 'player', x: 0, y: 0, hp: 24, maxHp: 24, energy: 100, speed: 100,
    level: 1, xp: 0, str: 0, gold: 0, inv: [], weapon: null, armor: null, status: {},
    regenClock: 0,
  };
  const dagger = makeItem('weapon', 'dagger');
  const jacket = makeItem('armor', 'leather');
  g.player.inv.push(dagger, jacket, makeItem('food', 'pie'), makeItem('potion', 'heal'));
  g.player.weapon = dagger;
  g.player.armor = jacket;
  g.known.potion.heal = true; // бабушка дала с собой, подписала
  enterLevel(g, 1);
  msg(g, 'Барсик опять провалился в старый колодец. Придётся лезть за ним.', 'story');
  msg(g, 'Стрелки или WASD — ходить. Тапните по клетке, чтобы пойти туда.', 'hint');
  return g;
}

function msg(g, text, cls = 'info') {
  g.messages.push({ text, cls, turn: g.turn });
  if (g.messages.length > 120) g.messages.splice(0, g.messages.length - 120);
}
function fx(g, e) { g.fx.push(e); }

// ---------- Уровни ----------

function enterLevel(g, depth) {
  g.depth = depth;
  g.stats.deepest = Math.max(g.stats.deepest, depth);
  const lv = generateLevel(depth, g.rng);
  lv.seen = new Uint8Array(MAP_W * MAP_H);
  lv.visible = new Uint8Array(MAP_W * MAP_H);
  lv.detect = false;
  g.level = lv;
  g.actors = [];
  g.items = [];
  g.traps = [];
  const p = g.player;
  p.x = lv.start.x; p.y = lv.start.y;
  p.energy = 100;
  populate(g);
  updateFOV(g);
  const th = THEMES[lv.theme];
  if (depth === MAX_DEPTH) {
    msg(g, `Глубина ${depth}. ${th.name}.`, 'depth');
    msg(g, th.ambient, 'story');
  } else {
    msg(g, `Глубина ${depth}. ${th.name}.`, 'depth');
    msg(g, depth === 1 ? th.ambient : CAT_HINTS[(depth - 2 + g.seed) % CAT_HINTS.length], 'story');
  }
  fx(g, { type: 'sound', name: 'descend' });
  fx(g, { type: 'levelin' });
}

function occupied(g, x, y) {
  if (g.player.x === x && g.player.y === y) return true;
  return g.actors.some((a) => a.x === x && a.y === y);
}
function actorAt(g, x, y) {
  if (g.player.x === x && g.player.y === y) return g.player;
  for (const a of g.actors) if (a.x === x && a.y === y) return a;
  return null;
}
function itemAt(g, x, y) {
  for (const it of g.items) if (it.x === x && it.y === y) return it;
  return null;
}
function trapAt(g, x, y) {
  for (const t of g.traps) if (t.x === x && t.y === y) return t;
  return null;
}

function spawnMonster(g, type, x, y, opts = {}) {
  const def = MONSTERS[type];
  // Монстры чуть крепче, если встречаются глубже своей «родной» глубины
  const over = Math.max(0, g.depth - def.depth[0]);
  const hp = def.boss || def.peaceful ? def.hp : Math.round(def.hp * (1 + over * 0.12));
  const m = {
    id: g.nextId++, type, x, y, hp, maxHp: hp, energy: g.rng.int(0, 99), speed: def.speed,
    awake: !!opts.awake, status: {}, lastSeen: null, wander: null, cooldown: 0, cooldown2: 6,
    gold: 0, disguised: def.ai === 'mimic', summons: 0, owner: opts.owner || 0,
  };
  g.actors.push(m);
  return m;
}

function freeFloor(g, room, avoidNear) {
  const tiles = g.level.tiles;
  for (let t = 0; t < 300; t++) {
    const p = randomFloorIn(tiles, g.rng, room);
    if (!p) continue;
    if (occupied(g, p.x, p.y) || itemAt(g, p.x, p.y) || trapAt(g, p.x, p.y)) continue;
    if (avoidNear && dist(p, g.player) < avoidNear) continue;
    return p;
  }
  return null;
}

function pickMonsterType(g, depth) {
  const opts = Object.entries(MONSTERS)
    .filter(([, d]) => d.weight > 0 && depth >= d.depth[0] && depth <= d.depth[1])
    .map(([k, d]) => [k, d.weight]);
  return g.rng.weighted(opts);
}

function populate(g) {
  const rng = g.rng, depth = g.depth, lv = g.level;
  if (depth === MAX_DEPTH) return populateLair(g);

  // Магазин
  let shopRoom = null;
  if ((depth === 3 || depth === 6 || depth === 9) && lv.rooms.length > 2) {
    const cands = lv.rooms.filter((r) => !inRoom(r, lv.start.x, lv.start.y) && !inRoom(r, lv.stairs.x, lv.stairs.y) && r.w >= 5 && r.h >= 3);
    if (cands.length) {
      shopRoom = rng.pick(cands);
      lv.shop = shopRoom;
      for (let y = shopRoom.y; y < shopRoom.y + shopRoom.h; y++)
        for (let x = shopRoom.x; x < shopRoom.x + shopRoom.w; x++)
          if (lv.tiles[idx(x, y)] !== T.FLOOR) lv.tiles[idx(x, y)] = T.FLOOR;
      const c = roomCenter(shopRoom);
      spawnMonster(g, 'merchant', c.x, shopRoom.y);
      const wares = [
        makeItem('potion', 'heal'), makeItem('potion', 'heal'),
        randomItem(g, depth + 2), randomItem(g, depth + 2), randomItem(g, depth + 1),
        makeItem('scroll', rng.pick(['enchant', 'teleport', 'mapping'])),
        rng.chance(0.5) ? makeItem('weapon', rng.pick(Object.keys(WEAPONS).filter((k) => WEAPONS[k].depth <= depth + 2)), { ench: 1 })
          : makeItem('armor', rng.pick(Object.keys(ARMORS).filter((k) => ARMORS[k].depth <= depth + 2)), { ench: 1 }),
      ];
      for (const w of wares) {
        const p = freeFloor(g, { x: shopRoom.x, y: shopRoom.y + 1, w: shopRoom.w, h: Math.max(1, shopRoom.h - 1) });
        if (!p) break;
        w.x = p.x; w.y = p.y; w.price = itemPrice(g, w);
        g.items.push(w);
      }
    }
  }
  const notShop = (x, y) => shopRoom && inRoom(shopRoom, x, y);
  const pickRoom = () => (lv.rooms.length ? rng.pick(lv.rooms.filter((r) => r !== shopRoom)) : null);
  const placeFree = (avoidNear) => {
    for (let t = 0; t < 20; t++) {
      const p = freeFloor(g, pickRoom(), avoidNear);
      if (p && !notShop(p.x, p.y)) return p;
    }
    return null;
  };

  // Монстры
  const nMon = 4 + Math.floor(depth * 1.1) + rng.int(0, 3);
  for (let i = 0; i < nMon; i++) {
    const p = placeFree(7);
    if (!p) continue;
    const type = pickMonsterType(g, depth);
    const m = spawnMonster(g, type, p.x, p.y, { awake: rng.chance(0.25) });
    // Иногда приходят стаями
    if ((type === 'rat' || type === 'kobold' || type === 'skeleton') && rng.chance(0.3)) {
      for (const [dx, dy] of DIRS8) {
        const nx = m.x + dx, ny = m.y + dy;
        if (lv.tiles[idx(nx, ny)] === T.FLOOR && !occupied(g, nx, ny) && rng.chance(0.4)) spawnMonster(g, type, nx, ny);
      }
    }
  }
  // Предметы
  const nItems = rng.int(4, 7);
  for (let i = 0; i < nItems; i++) {
    const p = placeFree();
    if (!p) continue;
    const it = randomItem(g, depth);
    it.x = p.x; it.y = p.y;
    g.items.push(it);
  }
  // Золото
  const nGold = rng.int(2, 4);
  for (let i = 0; i < nGold; i++) {
    const p = placeFree();
    if (!p) continue;
    g.items.push(makeItem('gold', 'gold', { qty: rng.int(4, 10) + depth * rng.int(2, 5), x: p.x, y: p.y }));
  }
  // Сундуки и мимики
  if (rng.chance(0.55)) {
    const p = placeFree(4);
    if (p) {
      if (depth >= 4 && rng.chance(0.35)) spawnMonster(g, 'mimic', p.x, p.y);
      else g.items.push(makeItem('chest', 'chest', { x: p.x, y: p.y }));
    }
  }
  // Ловушки
  const nTraps = rng.int(0, 1 + Math.floor(depth / 2));
  for (let i = 0; i < nTraps; i++) {
    const p = freeFloor(g, null, 3);
    if (!p || notShop(p.x, p.y)) continue;
    const type = rng.weighted([['spike', 4], ['teleport', 2], ['alarm', 2], ['gas', depth >= 3 ? 2 : 0]]);
    g.traps.push({ x: p.x, y: p.y, type, hidden: true });
  }
}

function populateLair(g) {
  const lv = g.level;
  const dog = spawnMonster(g, 'dog', 24, 9);
  dog.awake = false;
  spawnMonster(g, 'cat', lv.cat.x, lv.cat.y);
  // Припасы в кладовках
  for (const r of [lv.rooms[2], lv.rooms[3]]) {
    for (let i = 0; i < 2; i++) {
      const p = freeFloor(g, r);
      if (!p) continue;
      const it = randomItem(g, g.depth);
      it.x = p.x; it.y = p.y;
      g.items.push(it);
    }
  }
  const p = freeFloor(g, lv.rooms[2]);
  if (p) g.items.push(makeItem('food', 'sausage', { x: p.x, y: p.y, qty: 2 }));
  const q = freeFloor(g, lv.rooms[3]);
  if (q) g.items.push(makeItem('potion', 'heal', { x: q.x, y: q.y }));
  // Пара охранников по пути
  for (let i = 0; i < 2; i++) {
    const s = freeFloor(g, lv.arena, 6);
    if (s) spawnMonster(g, i ? 'skeleton' : 'shade', s.x, s.y);
  }
}

// ---------- Поле зрения ----------

function updateFOV(g) {
  const lv = g.level;
  lv.visible.fill(0);
  const p = g.player;
  computeFOV(p.x, p.y, FOV_RADIUS, (x, y) => blocksSight(lv.tiles[idx(x, y)]), (x, y) => {
    lv.visible[idx(x, y)] = 1;
    lv.seen[idx(x, y)] = 1;
  });
}

function canSee(g, x, y) { return !!g.level.visible[idx(x, y)]; }

// Видит ли игрок этого монстра (с учётом невидимок и мимиков)
function monsterVisible(g, m) {
  if (g.level.detect && !MONSTERS[m.type].stealth) return true;
  if (!canSee(g, m.x, m.y)) return false;
  if (MONSTERS[m.type].stealth && dist(m, g.player) > 2) return false;
  return true;
}

// ---------- Характеристики ----------

function playerAccuracy(g) {
  const p = g.player, w = p.weapon;
  return 10 + p.level + (w ? WEAPONS[w.type].accu + w.ench : 0) - (p.status.confused ? 4 : 0);
}
function playerDamage(g) {
  const p = g.player, w = p.weapon;
  if (!w) return [1 + p.str, 2 + p.str];
  const d = WEAPONS[w.type].dmg;
  return [d[0] + w.ench + p.str, d[1] + w.ench + p.str];
}
function playerEvasion(g) {
  const p = g.player, a = p.armor;
  return 5 + Math.floor(p.level / 2) + (a ? ARMORS[a.type].eva : 0) + (p.status.haste ? 3 : 0);
}
function playerArmor(g) {
  const a = g.player.armor;
  return a ? ARMORS[a.type].arm + a.ench : 0;
}
function xpToNext(level) { return 10 * level + 5 * level * level; }

function statsOf(g, a) {
  if (a === g.player) return { accu: playerAccuracy(g), eva: playerEvasion(g), arm: playerArmor(g), dmg: playerDamage(g) };
  const d = MONSTERS[a.type];
  const over = Math.max(0, g.depth - d.depth[0]);
  return {
    accu: d.accu + Math.floor(over / 2) - (a.status.confused ? 4 : 0),
    eva: d.eva + (a.status.sleep ? -100 : 0),
    arm: d.arm,
    dmg: [d.dmg[0] + Math.floor(over / 3), d.dmg[1] + Math.floor(over / 2)],
  };
}

function nameOf(g, a) { return a === g.player ? 'вы' : MONSTERS[a.type].name; }

// ---------- Бой ----------

function attack(g, att, def, opts = {}) {
  const rng = g.rng;
  const A = statsOf(g, att), D = statsOf(g, def);
  const pHit = clamp(A.accu / (A.accu + Math.max(0, D.eva)), 0.15, 0.97);
  const isPlayer = att === g.player;
  const ranged = !!opts.ranged;
  fx(g, { type: ranged ? 'shot' : 'bump', id: att.id, x: att.x, y: att.y, tx: def.x, ty: def.y, color: opts.color });
  const sneak = def !== g.player && (!def.awake || def.status.sleep > 0);
  if (def.status.sleep) def.status.sleep = 0;
  if (rng.next() > pHit) {
    if (isPlayer) msg(g, `Промах! ${capitalize(MONSTERS[def.type].name)} уворачивается.`, 'miss');
    else if (def === g.player) msg(g, `${capitalize(MONSTERS[att.type].name)} промахивается.`, 'miss');
    fx(g, { type: 'float', x: def.x, y: def.y, text: 'мимо', color: '#9aa' });
    fx(g, { type: 'sound', name: 'miss' });
    wake(g, def);
    return false;
  }
  let dmg = opts.dmg ? rng.int(opts.dmg[0], opts.dmg[1]) : rng.int(A.dmg[0], A.dmg[1]);
  let crit = false;
  if (isPlayer && sneak) { dmg = Math.round(dmg * 1.5); crit = true; }
  if (isPlayer && rng.chance(0.07)) { dmg = Math.round(dmg * 1.6); crit = true; }
  const block = rng.int(0, D.arm);
  dmg = Math.max(0, dmg - block);
  if (isPlayer) {
    const n = MONSTERS[def.type].acc;
    if (dmg === 0) msg(g, `Вы бьёте ${n}, но удар не пробивает защиту.`, 'miss');
    else msg(g, `${crit ? 'Сильный удар! ' : ''}Вы бьёте ${n}.`, 'hit');
  } else if (def === g.player) {
    const d = MONSTERS[att.type];
    if (dmg === 0) msg(g, `${capitalize(d.name)} ${d.verb} вас, но броня выдерживает.`, 'miss');
    else msg(g, `${capitalize(d.name)} ${d.verb} вас.`, 'bad');
  }
  wake(g, def);
  damage(g, def, dmg, att, crit);
  // Особые эффекты укусов
  if (!isPlayer && def === g.player && dmg > 0 && MONSTERS[att.type].poison && rng.chance(MONSTERS[att.type].poison) && !g.over) {
    def.status.poison = (def.status.poison || 0) + rng.int(3, 6);
    msg(g, 'Вы отравлены!', 'bad');
  }
  return true;
}

function wake(g, a) {
  if (a === g.player) return;
  if (!a.awake) a.awake = true;
  a.lastSeen = { x: g.player.x, y: g.player.y };
}

function damage(g, a, amount, source, crit) {
  if (amount <= 0) {
    fx(g, { type: 'float', x: a.x, y: a.y, text: '0', color: '#9aa' });
    return;
  }
  a.hp -= amount;
  fx(g, { type: 'float', x: a.x, y: a.y, text: String(amount), color: a === g.player ? '#ff6b5e' : crit ? '#ffd34e' : '#fff' , big: crit });
  fx(g, { type: 'flash', id: a.id });
  fx(g, { type: 'sound', name: a === g.player ? 'hurt' : 'hit' });
  if (a === g.player) {
    fx(g, { type: 'shake', power: Math.min(6, 1 + amount / 3) });
    if (a.hp <= 0) {
      a.hp = 0;
      const cause = source && source !== a && source.type ? MONSTERS[source.type].name : (typeof source === 'string' ? source : 'несчастный случай');
      gameOver(g, false, cause);
    }
    return;
  }
  // Слизь делится
  const def = MONSTERS[a.type];
  if (def.splits && a.hp > 0 && a.hp >= 4) {
    for (const [dx, dy] of g.rng.shuffle(DIRS8.slice())) {
      const nx = a.x + dx, ny = a.y + dy;
      if (isPassableTile(g.level.tiles[idx(nx, ny)]) && !occupied(g, nx, ny)) {
        const half = Math.floor(a.hp / 2);
        a.hp -= half;
        const s = spawnMonster(g, 'slime', nx, ny, { awake: true });
        s.hp = half; s.maxHp = half;
        if (canSee(g, nx, ny)) msg(g, 'Слизь делится надвое!', 'info');
        break;
      }
    }
  }
  if (a.hp <= 0) killMonster(g, a, source);
}

function killMonster(g, m, source) {
  const def = MONSTERS[m.type];
  if (def.boss) return defeatBoss(g, m);
  g.actors = g.actors.filter((a) => a !== m);
  const vis = canSee(g, m.x, m.y);
  if (vis) msg(g, `${capitalize(def.name)} ${def.death || 'погибает'}.`, 'kill');
  fx(g, { type: 'death', x: m.x, y: m.y, sprite: def.sprite });
  fx(g, { type: 'sound', name: 'kill' });
  if (m.gold > 0) dropItem(g, makeItem('gold', 'gold', { qty: m.gold }), m.x, m.y);
  if (m.type === 'mimic') {
    for (let i = 0; i < 2; i++) dropItem(g, randomItem(g, g.depth + 1), m.x, m.y);
  }
  if (source === g.player || (source && source.byPlayer)) {
    g.stats.kills++;
    gainXP(g, def.xp + Math.floor(def.xp * Math.max(0, g.depth - def.depth[0]) * 0.1));
  }
  // Миньоны некроманта рассыпаются вместе с ним
  if (m.type === 'necro') {
    for (const a of g.actors.slice()) if (a.owner === m.id) {
      g.actors = g.actors.filter((x) => x !== a);
      fx(g, { type: 'death', x: a.x, y: a.y, sprite: MONSTERS[a.type].sprite });
      if (canSee(g, a.x, a.y)) msg(g, 'Поднятый скелет рассыпается.', 'kill');
    }
  }
}

function defeatBoss(g, dog) {
  g.actors = g.actors.filter((a) => a !== dog && a.type !== 'puppy');
  msg(g, 'Древний Пёс скулит, съёживается и превращается в лохматого щенка.', 'boss');
  msg(g, 'Щенок виляет хвостом и убегает. Решётка клетки со скрипом поднимается!', 'boss');
  fx(g, { type: 'death', x: dog.x, y: dog.y, sprite: 'dog', big: true });
  fx(g, { type: 'shake', power: 8 });
  fx(g, { type: 'sound', name: 'victory' });
  const c = g.level.cat;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      if (g.level.tiles[idx(c.x + dx, c.y + dy)] === T.BARS) g.level.tiles[idx(c.x + dx, c.y + dy)] = T.FLOOR;
  g.level.cageOpen = true;
  g.stats.kills++;
  gainXP(g, 50);
  updateFOV(g);
}

function gainXP(g, n) {
  const p = g.player;
  p.xp += n;
  while (p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level);
    levelUp(g);
  }
}

function levelUp(g) {
  const p = g.player;
  p.level++;
  const hp = 4 + g.rng.int(0, 2);
  p.maxHp += hp;
  p.hp = Math.min(p.maxHp, p.hp + hp + Math.round(p.maxHp * 0.2));
  let extra = '';
  if (p.level % 2 === 1) { p.str++; extra = ', сила +1'; }
  msg(g, `Новый уровень: ${p.level}! Здоровье +${hp}${extra}.`, 'good');
  fx(g, { type: 'levelup', x: p.x, y: p.y });
  fx(g, { type: 'sound', name: 'levelup' });
}

function gameOver(g, won, cause) {
  if (g.over) return;
  g.over = { won, cause, turn: g.turn, depth: g.depth, score: computeScore(g, won) };
  g.stats.killedBy = cause;
  if (won) {
    msg(g, 'Барсик трётся о ваши ноги и громко мурчит. Пора домой!', 'boss');
  } else {
    msg(g, `Вы погибли. Причина: ${cause}.`, 'bad');
    fx(g, { type: 'sound', name: 'death' });
  }
}

function computeScore(g, won) {
  return g.player.gold + g.stats.deepest * 150 + g.stats.kills * 10 + g.player.level * 25 + (won ? 3000 - Math.min(2000, Math.floor(g.turn / 2)) : 0);
}

// ---------- Предметы на полу ----------

function dropItem(g, it, x, y) {
  // Ищем ближайшую свободную клетку по спирали
  for (let r = 0; r < 6; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = x + dx, ny = y + dy;
        if (!inBounds(nx, ny)) continue;
        const t = g.level.tiles[idx(nx, ny)];
        if (!(t === T.FLOOR || t === T.GRASS || t === T.WATER || t === T.ODOOR)) continue;
        const other = itemAt(g, nx, ny);
        if (other) {
          if (other.kind === 'gold' && it.kind === 'gold') { other.qty += it.qty; return true; }
          continue;
        }
        it.x = nx; it.y = ny;
        g.items.push(it);
        return true;
      }
    }
  }
  return false;
}

function addToInventory(g, it) {
  const p = g.player;
  if (STACKABLE.has(it.kind)) {
    const same = p.inv.find((o) => o.kind === it.kind && o.type === it.type);
    if (same) { same.qty += it.qty; return true; }
  }
  if (p.inv.length >= INV_SIZE) return false;
  delete it.x; delete it.y;
  p.inv.push(it);
  return true;
}

function removeOne(g, it) {
  const p = g.player;
  if (it.qty > 1) { it.qty--; const one = { ...it, id: ITEM_ID++, qty: 1 }; return one; }
  p.inv = p.inv.filter((o) => o !== it);
  if (p.weapon === it) p.weapon = null;
  if (p.armor === it) p.armor = null;
  return it;
}

// Подобрать предмет под ногами. buy=true — согласие купить в магазине
function pickUp(g, buy) {
  const p = g.player;
  const it = itemAt(g, p.x, p.y);
  if (!it || it.kind === 'chest') return false;
  if (it.kind === 'gold') {
    p.gold += it.qty; g.stats.goldFound += it.qty;
    g.items = g.items.filter((o) => o !== it);
    msg(g, `Вы подбираете ${itemName(g, it)}.`, 'loot');
    fx(g, { type: 'sound', name: 'coin' });
    fx(g, { type: 'float', x: p.x, y: p.y, text: `+${it.qty}`, color: '#ffd34e' });
    return true;
  }
  if (it.price) {
    if (!buy) {
      msg(g, `${capitalize(itemName(g, it))} — ${it.price} ${plural(it.price, 'монета', 'монеты', 'монет')}. Нажмите «Взять», чтобы купить.`, 'shop');
      return false;
    }
    if (p.gold < it.price) {
      msg(g, `Торговец качает головой: не хватает ${it.price - p.gold} ${plural(it.price - p.gold, 'монеты', 'монет', 'монет')}.`, 'shop');
      return false;
    }
    if (p.inv.length >= INV_SIZE && !(STACKABLE.has(it.kind) && p.inv.some((o) => o.kind === it.kind && o.type === it.type))) {
      msg(g, 'Рюкзак полон.', 'info');
      return false;
    }
    p.gold -= it.price;
    const price = it.price;
    delete it.price;
    if (g.known[it.kind]) g.known[it.kind][it.type] = true;
    g.items = g.items.filter((o) => o !== it);
    addToInventory(g, it);
    msg(g, `Куплено: ${itemName(g, it)} за ${price}. «Приходите ещё!»`, 'shop');
    fx(g, { type: 'sound', name: 'coin' });
    return true;
  }
  if (!addToInventory(g, it)) {
    msg(g, `Здесь лежит: ${itemName(g, it)}. Рюкзак полон.`, 'info');
    return false;
  }
  delete it.dropped;
  g.items = g.items.filter((o) => o !== it);
  msg(g, `Вы нашли: ${itemName(g, it)}.`, 'loot');
  fx(g, { type: 'sound', name: 'pickup' });
  return true;
}

function openChest(g, chest) {
  g.items = g.items.filter((o) => o !== chest);
  msg(g, 'Вы открываете сундук.', 'loot');
  fx(g, { type: 'sound', name: 'chest' });
  fx(g, { type: 'particles', x: chest.x, y: chest.y, color: '#ffd34e', n: 14 });
  const n = g.rng.int(2, 3);
  for (let i = 0; i < n; i++) dropItem(g, randomItem(g, g.depth + 1), chest.x, chest.y);
  dropItem(g, makeItem('gold', 'gold', { qty: g.rng.int(10, 25) + g.depth * 4 }), chest.x, chest.y);
}

// ---------- Действия игрока ----------
// Каждое действие возвращает true, если потрачен ход

function playerMove(g, dx, dy) {
  if (g.over) return false;
  const p = g.player;
  if (p.status.confused && g.rng.chance(0.5)) {
    [dx, dy] = g.rng.pick(DIRS8);
  }
  const nx = p.x + dx, ny = p.y + dy;
  if (!inBounds(nx, ny)) return false;
  const target = actorAt(g, nx, ny);
  if (target && target !== p) {
    const def = MONSTERS[target.type];
    if (target.type === 'merchant') {
      msg(g, g.rng.pick(['Торговец: «Смотрите, не стесняйтесь».', 'Торговец: «Всё по честной цене!»', 'Торговец: «Кота не видел. Но видел собаку. Большую.»']), 'shop');
      return endTurn(g);
    }
    if (target.type === 'cat') {
      if (g.level.cageOpen) {
        msg(g, 'Вы берёте Барсика на руки.', 'boss');
        gameOver(g, true, null);
        fx(g, { type: 'sound', name: 'meow' });
        return true;
      }
      msg(g, 'Барсик за решёткой. Сначала разберитесь с Псом.', 'info');
      return false;
    }
    if (target.disguised) revealMimic(g, target);
    attack(g, p, target);
    return endTurn(g);
  }
  const t = g.level.tiles[idx(nx, ny)];
  if (t === T.DOOR) {
    g.level.tiles[idx(nx, ny)] = T.ODOOR;
    fx(g, { type: 'sound', name: 'door' });
    return endTurn(g);
  }
  if (t === T.BARS) {
    msg(g, 'Прочная решётка. Сквозь неё виден Барсик.', 'info');
    return false;
  }
  if (!isPassableTile(t)) return false;
  const chest = itemAt(g, nx, ny);
  if (chest && chest.kind === 'chest') {
    openChest(g, chest);
    return endTurn(g);
  }
  p.x = nx; p.y = ny;
  fx(g, { type: 'move', id: 0 });
  if (t === T.GRASS) g.level.tiles[idx(nx, ny)] = T.FLOOR; // примяли траву
  if (t === T.WATER && p.status.burning) { p.status.burning = 0; msg(g, 'Вода гасит огонь.', 'good'); }
  const trap = trapAt(g, nx, ny);
  if (trap) triggerTrap(g, trap);
  const it = itemAt(g, nx, ny);
  if (it && !g.over) {
    if (it.dropped) msg(g, `Здесь лежит: ${itemName(g, it)}.`, 'info');
    else pickUp(g, false); // в магазине только покажет цену
  }
  if (t === T.STAIRS && !g.over) msg(g, 'Здесь лестница вниз. Нажмите «Вниз» или >.', 'hint');
  return endTurn(g);
}

function revealMimic(g, m) {
  m.disguised = false;
  m.awake = true;
  msg(g, 'Сундук распахивает пасть! Это мимик!', 'bad');
  fx(g, { type: 'shake', power: 4 });
  fx(g, { type: 'sound', name: 'roar' });
}

function playerWait(g) {
  if (g.over) return false;
  // Ожидание заодно и осмотр: шанс заметить ловушки рядом
  for (const t of g.traps) {
    if (t.hidden && dist(t, g.player) <= 1 && g.rng.chance(0.35)) {
      t.hidden = false;
      msg(g, `Вы замечаете ловушку: ${trapName(t.type)}.`, 'info');
    }
  }
  return endTurn(g);
}

function playerDescend(g) {
  if (g.over) return false;
  const p = g.player;
  if (g.level.tiles[idx(p.x, p.y)] !== T.STAIRS) {
    msg(g, 'Лестницы здесь нет.', 'info');
    return false;
  }
  enterLevel(g, g.depth + 1);
  return true;
}

function playerPickup(g) {
  if (g.over) return false;
  const it = itemAt(g, g.player.x, g.player.y);
  if (!it) { msg(g, 'Здесь ничего нет.', 'info'); return false; }
  if (pickUp(g, true)) return endTurn(g);
  return false;
}

// ---------- Ловушки ----------

function trapName(type) {
  return { spike: 'шипы', teleport: 'телепорт', alarm: 'сигнализация', gas: 'ядовитый газ' }[type];
}

function triggerTrap(g, trap) {
  const p = g.player;
  trap.hidden = false;
  fx(g, { type: 'sound', name: 'trap' });
  switch (trap.type) {
    case 'spike': {
      const d = g.rng.int(2, 4) + Math.floor(g.depth / 2);
      msg(g, 'Из пола выскакивают шипы!', 'bad');
      damage(g, p, d, 'шипы');
      break;
    }
    case 'teleport':
      msg(g, 'Пол вспыхивает, и вас куда-то переносит!', 'info');
      teleportPlayer(g);
      break;
    case 'alarm':
      msg(g, 'Раздаётся оглушительный звон! Все монстры знают, где вы.', 'bad');
      for (const a of g.actors) if (!MONSTERS[a.type].peaceful) { a.awake = true; a.lastSeen = { x: p.x, y: p.y }; }
      fx(g, { type: 'shake', power: 3 });
      break;
    case 'gas':
      msg(g, 'Из щелей валит зелёный газ. Голова кружится.', 'bad');
      p.status.confused = (p.status.confused || 0) + g.rng.int(4, 7);
      fx(g, { type: 'particles', x: p.x, y: p.y, color: '#7cd36a', n: 20 });
      break;
  }
}

function teleportPlayer(g) {
  const p = g.player;
  for (let t = 0; t < 400; t++) {
    const x = g.rng.int(1, MAP_W - 2), y = g.rng.int(1, MAP_H - 2);
    const tt = g.level.tiles[idx(x, y)];
    if (tt !== T.FLOOR || occupied(g, x, y) || trapAt(g, x, y)) continue;
    if (g.actors.some((a) => !MONSTERS[a.type].peaceful && dist(a, { x, y }) < 5)) continue;
    fx(g, { type: 'particles', x: p.x, y: p.y, color: '#a98bff', n: 16 });
    p.x = x; p.y = y;
    fx(g, { type: 'teleport', id: 0 });
    fx(g, { type: 'particles', x, y, color: '#a98bff', n: 16 });
    updateFOV(g);
    return true;
  }
  return false;
}

// ---------- Ход мира ----------

function effSpeed(a) {
  let s = a.speed;
  if (a.status.haste) s *= 2;
  if (a.status.slow) s = Math.floor(s / 2);
  return s;
}

function endTurn(g) {
  const p = g.player;
  p.energy -= 100;
  if (g.over) { updateFOV(g); return true; }
  if (p.energy >= 100) { updateFOV(g); return true; } // ускорение: ходим ещё раз
  let guard = 0;
  while (p.energy < 100 && !g.over && guard++ < 50) {
    worldTick(g);
    p.energy += effSpeed(p);
    for (const a of g.actors.slice()) {
      if (g.over) break;
      if (!g.actors.includes(a)) continue;
      a.energy += effSpeed(a);
      while (a.energy >= 100 && g.actors.includes(a) && !g.over) {
        a.energy -= 100;
        monsterAct(g, a);
      }
    }
  }
  updateFOV(g);
  return true;
}

// Раз в ход: статусы, регенерация
function worldTick(g) {
  g.turn++;
  const p = g.player;
  tickStatus(g, p);
  // Естественное восстановление
  p.regenClock++;
  const every = Math.max(6, 18 - p.level);
  if (p.regenClock >= every) {
    p.regenClock = 0;
    if (p.hp < p.maxHp && !p.status.poison) p.hp++;
  }
  for (const a of g.actors.slice()) tickStatus(g, a);
  computePlayerMaps(g);
}

function tickStatus(g, a) {
  const s = a.status;
  if (s.poison) {
    s.poison--;
    if (a === g.player) damage(g, a, 1, 'яд');
    else { a.hp -= 1; fx(g, { type: 'float', x: a.x, y: a.y, text: '1', color: '#7cd36a' }); if (a.hp <= 0) killMonster(g, a, { byPlayer: true }); }
    if (s.poison <= 0 && a === g.player) msg(g, 'Яд больше не действует.', 'good');
  }
  if (s.regen) { s.regen--; if (a.hp < a.maxHp) a.hp = Math.min(a.maxHp, a.hp + 1); }
  for (const k of ['confused', 'haste', 'slow', 'fear', 'sleep', 'distracted']) {
    if (s[k]) {
      s[k]--;
      if (!s[k] && a === g.player) {
        const t = { confused: 'Голова прояснилась.', haste: 'Вы снова двигаетесь с обычной скоростью.' }[k];
        if (t) msg(g, t, 'info');
      }
    }
  }
}

// Карты Дейкстры для преследования игрока (общие для всех монстров)
function computePlayerMaps(g) {
  const lv = g.level, p = g.player;
  const walk = (x, y) => {
    const t = lv.tiles[idx(x, y)];
    return isPassableTile(t) ? 1 : Infinity;
  };
  g._chase = dijkstraMap([{ x: p.x, y: p.y }], walk, 40);
  if (g.actors.some((a) => MONSTERS[a.type].phase)) {
    g._phase = dijkstraMap([{ x: p.x, y: p.y }], (x, y) => (x > 0 && y > 0 && x < MAP_W - 1 && y < MAP_H - 1 && lv.tiles[idx(x, y)] !== T.BARS ? 1 : Infinity), 30);
  } else g._phase = null;
}
