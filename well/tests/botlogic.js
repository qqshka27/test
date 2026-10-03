// Логика бота без зависимостей: работает и в Node, и в браузере.
// E — движок игры (объект с функциями или window).
function makeBot(E) {
  function avgDmg(g, it) { const w = E.WEAPONS[it.type]; return (w.dmg[0] + w.dmg[1]) / 2 + it.ench + w.accu * 0.3; }
  function armVal(g, it) { const a = E.ARMORS[it.type]; return a.arm + it.ench + a.eva * 0.5; }

  function manageGear(g) {
    const p = g.player;
    if (p.inv.length >= 17) {
      const junk = p.inv.find((o) => (o.kind === 'weapon' || o.kind === 'armor') && o !== p.weapon && o !== p.armor)
        || p.inv.find((o) => o.kind === 'wand' && o.charges === 0 && E.isKnown(g, o))
        || p.inv.find((o) => o.kind === 'scroll' && o.type === 'summon' && E.isKnown(g, o));
      if (junk) return E.dropFromInv(g, junk);
    }
    for (const it of p.inv) {
      if (it.kind === 'weapon' && (!p.weapon || avgDmg(g, it) > avgDmg(g, p.weapon))) return E.equipItem(g, it);
      if (it.kind === 'armor' && (!p.armor || armVal(g, it) > armVal(g, p.armor))) return E.equipItem(g, it);
    }
    // Пробуем неизвестное, когда безопасно и здоровье полное
    if (p.hp >= p.maxHp * 0.9) {
      const unk = p.inv.find((o) => (o.kind === 'scroll' || o.kind === 'potion') && !E.isKnown(g, o));
      if (unk) {
        const r = E.useItem(g, unk);
        if (r && r.select) return E.useItem(g, unk, null);
        return r;
      }
      const ench = p.inv.find((o) => o.kind === 'scroll' && o.type === 'enchant' && E.isKnown(g, o));
      if (ench) return E.useItem(g, ench, p.weapon || p.armor);
    }
    return false;
  }

  function findItem(g, pred) { return g.player.inv.find(pred); }

  function fight(g, enemies) {
    const p = g.player;
    const heal = findItem(g, (o) => o.kind === 'potion' && o.type === 'heal');
    if (p.hp < p.maxHp * 0.35 && heal) return E.useItem(g, heal);
    const food = findItem(g, (o) => o.kind === 'food');
    enemies.sort((a, b) => E.dist(a, p) - E.dist(b, p));
    const t = enemies[0];
    const d = E.dist(t, p);
    if (p.hp < p.maxHp * 0.3 && !heal) {
      const tele = findItem(g, (o) => o.kind === 'scroll' && o.type === 'teleport' && E.isKnown(g, o));
      if (tele) return E.useItem(g, tele);
      if (food && d > 1) return E.useItem(g, food);
    }
    if (d > 1) {
      const sausage = findItem(g, (o) => o.kind === 'food' && o.type === 'sausage');
      if (sausage && t.type === 'dog' && !t.status.distracted && d <= 5 && E.throwItem(g, sausage, t.x, t.y)) return true;
      const wand = findItem(g, (o) => o.kind === 'wand' && o.charges > 0 && (o.type === 'bolt' || o.type === 'sleep' || o.type === 'slow' || !E.isKnown(g, o)));
      if (wand && d <= 6 && (t.hp > 10 || t.type === 'dog') && E.zapWand(g, wand, t.x, t.y)) return true;
      const knife = findItem(g, (o) => o.kind === 'knife');
      if (knife && d <= 5 && E.throwItem(g, knife, t.x, t.y)) return true;
      const bad = findItem(g, (o) => o.kind === 'potion' && (o.type === 'poison' || o.type === 'confuse') && E.isKnown(g, o));
      if (bad && d <= 5 && E.throwItem(g, bad, t.x, t.y)) return true;
    }
    if (d === 1) return E.playerMove(g, Math.sign(t.x - p.x), Math.sign(t.y - p.y));
    // Лучники и некроманты сами не подойдут — идём к ним; остальных ждём на месте
    if (['archer', 'necro', 'dog'].includes(t.type) || t.gold > 0 || t.status.fear || d > 2 || g.turn % 3 === 0) {
      const step = E.travelStep(g, t.x, t.y);
      if (step) return E.playerMove(g, step[0], step[1]);
    }
    return E.playerWait(g);
  }

  function botTurn(g) {
    const p = g.player;
    const enemies = E.visibleEnemies(g);
    if (enemies.length) return fight(g, enemies);
    if (manageGear(g)) return true;
    if (p.hp < p.maxHp * 0.7) {
      const food = findItem(g, (o) => o.kind === 'food');
      if (p.hp < p.maxHp * 0.4 && food) return E.useItem(g, food);
      return E.playerWait(g);
    }
    // Ловушки и магазин бот игнорирует
    if (g.depth === E.MAX_DEPTH) {
      const dog = g.actors.find((a) => a.type === 'dog');
      const cat = g.actors.find((a) => a.type === 'cat');
      const target = dog || cat;
      if (target) {
        const step = E.travelStep(g, target.x, target.y);
        if (step) return E.playerMove(g, step[0], step[1]);
      }
    }
    const r = E.exploreStep(g);
    if (r === 'moved') return true;
    const lv = g.level;
    if (lv.stairs) {
      if (p.x === lv.stairs.x && p.y === lv.stairs.y) return E.playerDescend(g);
      // Лестница могла быть не найдена — тогда идём в неизвестность
      if (lv.seen[E.idx(lv.stairs.x, lv.stairs.y)]) {
        const step = E.travelStep(g, lv.stairs.x, lv.stairs.y);
        if (step) return E.playerMove(g, step[0], step[1]);
      }
    }
    return E.playerWait(g);
  }

  return { botTurn };
}
