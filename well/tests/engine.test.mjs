// Тесты движка: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from './engine.mjs';
import { playOne } from './bot.mjs';

const E = loadEngine();

test('ГСЧ детерминирован и сериализуем', () => {
  const a = E.makeRNG(123), b = E.makeRNG(123);
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
  const s = a.state;
  const x = a.next();
  a.state = s;
  assert.equal(a.next(), x);
});

test('все уровни связны: со старта достижима каждая проходимая клетка', () => {
  for (let seed = 1; seed <= 150; seed++) {
    for (const depth of [1, 4, 7, 9, 10]) {
      const lv = E.generateLevel(depth, E.makeRNG(seed * 31 + depth));
      // Клетка Барсика закрыта решёткой до победы над Псом — её не считаем
      if (lv.cat) lv.tiles[E.idx(lv.cat.x, lv.cat.y)] = E.T.WALL;
      assert.ok(E.levelConnected(lv.tiles, lv.start), `сид ${seed}, глубина ${depth}`);
      if (lv.stairs) {
        const d = E.bfsDistances(lv.tiles, lv.start.x, lv.start.y);
        assert.ok(d[E.idx(lv.stairs.x, lv.stairs.y)] > 5, `лестница слишком близко: сид ${seed}`);
      }
    }
  }
});

test('поле зрения: стены закрывают обзор, соседи всегда видны', () => {
  const g = E.newGame(7);
  const p = g.player;
  for (const [dx, dy] of E.DIRS8) assert.ok(E.canSee(g, p.x + dx, p.y + dy));
  // Ни одна видимая клетка не лежит дальше радиуса
  for (let i = 0; i < g.level.visible.length; i++) {
    if (!g.level.visible[i]) continue;
    const x = i % E.MAP_W, y = Math.floor(i / E.MAP_W);
    assert.ok(Math.hypot(x - p.x, y - p.y) <= 9.5);
  }
});

test('сохранение и загрузка не меняют игру', () => {
  const g = E.newGame(99);
  for (let i = 0; i < 60; i++) if (E.exploreStep(g) !== 'moved') E.playerWait(g);
  const json = E.serializeGame(g);
  const h = E.deserializeGame(json);
  assert.equal(E.serializeGame(h), json);
  assert.equal(h.player.weapon && h.player.weapon.id, g.player.weapon && g.player.weapon.id);
  // Продолжение одинаково в обеих копиях
  for (let i = 0; i < 40; i++) { E.playerWait(g); E.playerWait(h); }
  assert.equal(E.serializeGame(h), E.serializeGame(g));
});

test('русские окончания', () => {
  assert.equal(E.plural(1, 'монета', 'монеты', 'монет'), 'монета');
  assert.equal(E.plural(3, 'монета', 'монеты', 'монет'), 'монеты');
  assert.equal(E.plural(11, 'монета', 'монеты', 'монет'), 'монет');
  assert.equal(E.plural(22, 'монета', 'монеты', 'монет'), 'монеты');
  assert.equal(E.plural(25, 'монета', 'монеты', 'монет'), 'монет');
});

test('неопознанные предметы скрывают название, опознанные — нет', () => {
  const g = E.newGame(5);
  const it = E.makeItem('potion', 'haste');
  assert.ok(!E.itemName(g, it).includes('ускорения'));
  E.drinkPotion(g, 'haste');
  assert.ok(E.itemName(g, it).includes('ускорения'));
});

test('победа над Псом открывает клетку, Барсик спасён', () => {
  const g = E.newGame(11);
  E.enterLevel(g, E.MAX_DEPTH);
  const dog = g.actors.find((a) => a.type === 'dog');
  const cat = g.actors.find((a) => a.type === 'cat');
  dog.hp = 1;
  // Ставим героя рядом с Псом и бьём, пока не попадём
  g.player.x = dog.x; g.player.y = dog.y + 1;
  for (let i = 0; i < 50 && g.actors.includes(dog); i++) {
    g.player.hp = g.player.maxHp;
    g.player.x = dog.x; g.player.y = dog.y + 1;
    E.playerMove(g, 0, -1);
  }
  assert.ok(!g.actors.includes(dog), 'Пёс повержен');
  assert.ok(g.level.cageOpen, 'клетка открыта');
  g.player.status = {}; // Пёс мог успеть оглушить лаем
  g.actors = g.actors.filter((a) => a === cat); // убираем щенков и стражу
  g.player.x = cat.x; g.player.y = cat.y + 1;
  E.playerMove(g, 0, -1);
  assert.ok(g.over && g.over.won, 'победа');
});

test('бот доигрывает партии без ошибок', () => {
  for (let seed = 1000; seed < 1012; seed++) {
    const g = playOne(seed, 6000);
    assert.ok(g.turn > 0);
    assert.ok(g.player.hp >= 0);
  }
});
