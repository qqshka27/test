// ===== Поведение монстров =====

function monsterCanEnter(g, m, x, y) {
  if (!inBounds(x, y)) return false;
  if (occupied(g, x, y)) return false;
  const t = g.level.tiles[idx(x, y)];
  if (MONSTERS[m.type].phase) return t !== T.BARS && x > 0 && y > 0 && x < MAP_W - 1 && y < MAP_H - 1;
  if (!isPassableTile(t)) return false;
  const it = itemAt(g, x, y);
  if (it && it.kind === 'chest') return false;
  return true;
}

function moveMonster(g, m, x, y) {
  const t = g.level.tiles[idx(x, y)];
  if (t === T.DOOR && !MONSTERS[m.type].phase) {
    g.level.tiles[idx(x, y)] = T.ODOOR; // открыл дверь — на это ушёл ход
    return;
  }
  m.x = x; m.y = y;
  if (t === T.GRASS && !MONSTERS[m.type].phase && g.rng.chance(0.3)) g.level.tiles[idx(x, y)] = T.FLOOR;
}

// Шаг по карте расстояний: dir = +1 к игроку, -1 от игрока
function stepByMap(g, m, map, dir) {
  if (!map) return false;
  const here = map[idx(m.x, m.y)];
  let best = null, bestV = dir > 0 ? here : (here === Infinity ? -1 : here);
  const opts = g.rng.shuffle(DIRS8.slice());
  for (const [dx, dy] of opts) {
    const nx = m.x + dx, ny = m.y + dy;
    if (!monsterCanEnter(g, m, nx, ny)) continue;
    const v = map[idx(nx, ny)];
    if (v === Infinity) continue;
    if (dir > 0 ? v < bestV : v > bestV) { bestV = v; best = [nx, ny]; }
  }
  if (!best) return false;
  moveMonster(g, m, best[0], best[1]);
  return true;
}

function randomStep(g, m) {
  for (const [dx, dy] of g.rng.shuffle(DIRS8.slice())) {
    const nx = m.x + dx, ny = m.y + dy;
    if (monsterCanEnter(g, m, nx, ny)) { moveMonster(g, m, nx, ny); return true; }
  }
  return false;
}

// Бродит по уровню, пока не заметит героя
function wanderStep(g, m) {
  if (!m.wander || (m.x === m.wander.x && m.y === m.wander.y) || g.rng.chance(0.03)) {
    const p = randomFloorIn(g.level.tiles, g.rng, null);
    m.wander = p;
    m.wanderMap = null;
  }
  if (!m.wander) return randomStep(g, m);
  if (!m.wanderMap) {
    m.wanderMap = dijkstraMap([m.wander], (x, y) => (isPassableTile(g.level.tiles[idx(x, y)]) ? 1 : Infinity), 80);
  }
  if (!stepByMap(g, m, m.wanderMap, 1)) { m.wander = null; return randomStep(g, m); }
  return true;
}

// Монстр видит героя, если стоит в его поле зрения (оно симметрично)
function seesPlayer(g, m) {
  return canSee(g, m.x, m.y) && dist(m, g.player) <= FOV_RADIUS;
}

function adjacentToPlayer(m, p) { return Math.max(Math.abs(m.x - p.x), Math.abs(m.y - p.y)) === 1; }

function monsterAct(g, m) {
  const def = MONSTERS[m.type];
  const p = g.player;
  if (def.peaceful) {
    if (m.type === 'cat' && canSee(g, m.x, m.y) && g.rng.chance(0.04)) {
      msg(g, g.rng.pick(['Барсик: «Мяу!»', 'Барсик смотрит на вас с упрёком.', 'Барсик зевает.', 'Барсик: «Мррр?»']), 'story');
    }
    return;
  }
  if (m.status.sleep > 0 || m.status.distracted > 0) return;
  if (m.disguised) {
    if (adjacentToPlayer(m, p) && g.rng.chance(0.25)) { revealMimic(g, m); }
    return;
  }

  const sees = seesPlayer(g, m);
  if (!m.awake) {
    // Шанс проснуться, когда герой в поле зрения
    if (sees && g.rng.chance(def.boss ? 1 : 0.35)) {
      m.awake = true;
      if (def.boss) bossIntro(g, m);
      else if (monsterVisible(g, m)) {
        fx(g, { type: 'float', x: m.x, y: m.y, text: '!', color: '#ffd34e', big: true });
        if (g.rng.chance(0.4)) msg(g, `${capitalize(def.name)} замечает вас.`, 'info');
      }
    } else {
      return; // спит
    }
  }
  if (sees) m.lastSeen = { x: p.x, y: p.y };

  if (m.status.confused) { randomStep(g, m); return; }
  if (m.status.fear) { if (!stepByMap(g, m, g._chase, -1)) randomStep(g, m); return; }

  switch (def.ai) {
    case 'erratic':
      if (g.rng.chance(0.5)) { randomStep(g, m); return; }
      return meleeAI(g, m, sees);
    case 'ranged': return rangedAI(g, m, sees);
    case 'thief': return thiefAI(g, m, sees);
    case 'caster': return casterAI(g, m, sees);
    case 'boss': return bossAI(g, m, sees);
    case 'ghost':
    case 'mimic':
    case 'melee':
    default: return meleeAI(g, m, sees);
  }
}

function meleeAI(g, m, sees) {
  const p = g.player;
  if (adjacentToPlayer(m, p)) {
    // Через угол стены бить можно — классические рогалики так и делают
    attack(g, m, p);
    return;
  }
  const map = MONSTERS[m.type].phase ? g._phase : g._chase;
  if (sees || m.lastSeen) {
    if (stepByMap(g, m, map, 1)) {
      if (m.lastSeen && m.x === m.lastSeen.x && m.y === m.lastSeen.y) m.lastSeen = null;
      return;
    }
    // Застрял за другим монстром — иногда просто ждёт
    if (g.rng.chance(0.3)) randomStep(g, m);
    return;
  }
  wanderStep(g, m);
}

function rangedAI(g, m, sees) {
  const p = g.player, def = MONSTERS[m.type];
  const d = dist(m, p);
  if (sees && d <= def.range && clearLine(g.level, m.x, m.y, p.x, p.y)) {
    if (d <= 1 && g.rng.chance(0.6) && stepByMap(g, m, g._chase, -1)) return; // отступает
    attack(g, m, p, { ranged: true, color: '#e8d9a8' });
    return;
  }
  meleeAI(g, m, sees);
}

function thiefAI(g, m, sees) {
  const p = g.player;
  if (m.gold > 0) {
    // Убегает с добычей; если оторвался — исчезает
    if (!sees) {
      m.hidden = (m.hidden || 0) + 1;
      if (m.hidden > 8) {
        g.actors = g.actors.filter((a) => a !== m);
        msg(g, 'Где-то вдалеке хихикает гоблин. Ваши монеты ушли навсегда.', 'bad');
        return;
      }
    } else m.hidden = 0;
    if (!stepByMap(g, m, g._chase, -1)) {
      if (adjacentToPlayer(m, p)) attack(g, m, p);
      else randomStep(g, m);
    }
    return;
  }
  if (adjacentToPlayer(m, p) && p.gold > 0 && g.rng.chance(0.6)) {
    const A = statsOf(g, m);
    if (g.rng.next() < clamp(A.accu / (A.accu + playerEvasion(g)), 0.15, 0.95)) {
      const amount = Math.max(1, Math.min(p.gold, Math.round(p.gold * g.rng.int(25, 50) / 100)));
      p.gold -= amount; m.gold += amount;
      msg(g, `Гоблин-воришка хватает ${amount} ${plural(amount, 'монету', 'монеты', 'монет')} и бросается наутёк!`, 'bad');
      fx(g, { type: 'float', x: p.x, y: p.y, text: `-${amount}`, color: '#ffd34e' });
      fx(g, { type: 'sound', name: 'coin' });
      return;
    }
  }
  meleeAI(g, m, sees);
}

function casterAI(g, m, sees) {
  const p = g.player;
  const d = dist(m, p);
  m.cooldown = Math.max(0, m.cooldown - 1);
  if (sees && m.cooldown === 0 && m.summons < 3) {
    for (const [dx, dy] of g.rng.shuffle(DIRS8.slice())) {
      const nx = m.x + dx, ny = m.y + dy;
      if (g.level.tiles[idx(nx, ny)] === T.FLOOR && !occupied(g, nx, ny)) {
        const s = spawnMonster(g, 'skeleton', nx, ny, { awake: true, owner: m.id });
        s.hp = s.maxHp = Math.round(s.maxHp * 0.6);
        m.summons++;
        m.cooldown = g.rng.int(6, 9);
        msg(g, 'Некромант взмахивает посохом. Из-под пола выбирается скелет!', 'bad');
        fx(g, { type: 'particles', x: nx, y: ny, color: '#b28cff', n: 14 });
        fx(g, { type: 'sound', name: 'summon' });
        return;
      }
    }
  }
  if (adjacentToPlayer(m, p)) {
    if (g.rng.chance(0.3) && stepByMap(g, m, g._chase, -1)) return;
    attack(g, m, p);
    return;
  }
  if (sees && d <= 2 && g.rng.chance(0.5) && stepByMap(g, m, g._chase, -1)) return;
  // Издалека швыряет сгусток тьмы
  if (sees && d <= 5 && g.rng.chance(0.45) && clearLine(g.level, m.x, m.y, p.x, p.y)) {
    if (canSee(g, m.x, m.y)) msg(g, 'Некромант швыряет сгусток тьмы!', 'info');
    attack(g, m, p, { ranged: true, color: '#b28cff', dmg: [2, 5] });
    return;
  }
  if (sees && d >= 3 && d <= 5) return; // держит дистанцию
  meleeAI(g, m, sees);
}

function bossIntro(g, m) {
  chron(g, 'Разбудил Древнего Пса');
  msg(g, 'Древний Пёс поднимает голову. Глаза размером с блюдца.', 'boss');
  msg(g, '«ГАВ!» — земля дрожит. Барсик в клетке шипит.', 'boss');
  fx(g, { type: 'shake', power: 7 });
  fx(g, { type: 'sound', name: 'bark' });
  fx(g, { type: 'boss' });
}

function bossAI(g, m, sees) {
  const p = g.player;
  m.cooldown = Math.max(0, m.cooldown - 1);
  m.cooldown2 = Math.max(0, m.cooldown2 - 1);
  const d = dist(m, p);
  // Лай: оглушает и путает
  if (sees && d <= 5 && m.cooldown === 0 && g.rng.chance(0.5)) {
    m.cooldown = g.rng.int(8, 11);
    msg(g, '«ГАВ-ГАВ-ГАВ!!!» У вас звенит в ушах, мир плывёт.', 'boss');
    p.status.confused = Math.max(p.status.confused || 0, 3);
    fx(g, { type: 'shake', power: 6 });
    fx(g, { type: 'bark', x: m.x, y: m.y });
    fx(g, { type: 'sound', name: 'bark' });
    return;
  }
  // Зовёт щенков
  const pups = g.actors.filter((a) => a.type === 'puppy').length;
  if (sees && m.cooldown2 === 0 && pups < 4) {
    m.cooldown2 = g.rng.int(12, 16);
    let n = 0;
    for (const [dx, dy] of g.rng.shuffle(DIRS8.slice())) {
      const nx = m.x + dx, ny = m.y + dy;
      if (n < 2 && isPassableTile(g.level.tiles[idx(nx, ny)]) && !occupied(g, nx, ny)) {
        spawnMonster(g, 'puppy', nx, ny, { awake: true });
        fx(g, { type: 'particles', x: nx, y: ny, color: '#d9b38c', n: 10 });
        n++;
      }
    }
    if (n) msg(g, 'Пёс протяжно воет. Из темноты выбегают щенки!', 'boss');
    return;
  }
  // В ярости при малом здоровье ходит быстрее
  if (m.hp < m.maxHp * 0.35 && !m.enraged) {
    m.enraged = true;
    m.speed = 130;
    msg(g, 'Пёс рычит и бросается в бешеную атаку!', 'boss');
  }
  meleeAI(g, m, sees);
}
