/**
 * The Field Sandbox, Season 1 test slice (shared/sandbox.ts,
 * shared/sandboxSeason.ts, src/sandbox/store.ts): the whole loop plays
 * through - march, battle, results, repair and remanufacture, a robot level
 * that installs a part - state survives a reload, rewards and destructions
 * count once, NPC kills never become PvP, and the sandbox is sealed off from
 * the live game.
 *
 *   npm test
 */
import assert from 'node:assert/strict';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {dirname, join, normalize, relative} from 'node:path';
import test from 'node:test';
import {cacheReward, laneReward} from '../../shared/season1Ops';
import {exerciseReward} from '../../shared/exercises';
import {
  type Role,
  ROLES,
  assetNeedsRepair,
  assetRepairQuote,
  assetStats,
  battleCasualties,
  robotNeedsRepair,
  SANDBOX_SCHEMA,
  type SandboxAction,
  type SandboxState,
  TUTORIAL,
  applyAction,
  createSandbox,
  describeReward,
  lanesDone,
  marchSeconds,
  nextInstall,
  parseSandbox,
  partName,
  partsAt,
  readSandbox,
  remanufactureQuote,
  repairQuote,
  robotStats,
  sandboxDay,
  sandboxNow,
  seasonObjectives,
  settle,
  siteReward,
  sitesFor,
  slotForLevel,
  tutorialSay,
} from '../../shared/sandbox';
import {PART_SLOTS, SANDBOX_SEASON_1_TEST, defineSandboxSeason, validateSandboxSeason} from '../../shared/sandboxSeason';
import {type KeyValue, SANDBOX_STORAGE_KEY, dispatchSandbox, loadSandbox, openSandbox, resetSandbox} from '../../src/sandbox/store';

const T0 = Date.UTC(2026, 8, 15, 12, 0, 0);
const MIN = 60_000;
const CONFIG = SANDBOX_SEASON_1_TEST;

function memory(): KeyValue & {map: Map<string, string>} {
  const map = new Map<string, string>();
  return {map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k)};
}

/** A player driving the sandbox through storage, the way the screen does. */
function player(kv = memory()) {
  let n = 0;
  let clock = T0;
  const run = (action: SandboxAction, id = `act-${n++}`) => dispatchSandbox(kv, id, action, clock);
  const ok = (action: SandboxAction) => {
    const r = run(action);
    assert.ok(r.ok, `${action.type}: ${'error' in r ? r.error : ''}`);
    return r.state;
  };
  const state = () => loadSandbox(kv, clock);
  return {kv, run, ok, wait: (ms: number) => (clock += ms), now: () => clock, state, simNow: () => sandboxNow(state(), clock)};
}

type Player = ReturnType<typeof player>;

const ALL_ASSETS = CONFIG.taskForceAssets as string[];

/** Wait until the battle at the target has been fought out and applied. */
function fightToEnd(p: Player): SandboxState {
  const s = p.state();
  if (s.march?.phase === 'engaged' && s.march.holdUntil) p.wait(s.march.holdUntil - p.simNow() + 1);
  return p.state();
}

const todaySites = (p: Player) => {
  const s = p.state();
  return sitesFor(s, sandboxDay(s, p.simNow()));
};
const patrolSite = (p: Player) => todaySites(p).find((x) => x.kind === 'patrol')!;

/** March on a site with these robots and wait until it arrives. */
function marchTo(p: Player, siteId: string, robots: Role[] = [...ROLES], assets: string[] = ALL_ASSETS): SandboxState {
  p.ok({type: 'march.start', siteId, robots, assets});
  const s = p.state();
  p.wait(s.march!.arriveAt - p.simNow() + 1);
  return p.state();
}

function waitHome(p: Player): SandboxState {
  const s = p.state();
  if (s.march?.returnAt) p.wait(s.march.returnAt - p.simNow() + 1);
  return p.state();
}

const skipped = () => {
  const p = player();
  p.ok({type: 'tutorial.skip'});
  return p;
};

test('the season config is valid, test-only and refuses one that cannot be played', () => {
  assert.deepEqual(validateSandboxSeason(CONFIG), []);
  assert.equal(CONFIG.testOnly, true);
  assert.equal(CONFIG.robotMaxLevel, 50);
  assert.ok(validateSandboxSeason({...CONFIG, testOnly: false}).some((e) => e.includes('testOnly')));
  assert.ok(validateSandboxSeason({...CONFIG, upgradeMinutes: CONFIG.upgradeMinutes.slice(0, 5)}).length > 0);
  assert.ok(validateSandboxSeason({...CONFIG, partBonus: {...CONFIG.partBonus, head: {hpPct: 0, damagePct: 0, heal: 0}}}).some((e) => e.includes('before/after')));
  assert.throws(() => defineSandboxSeason({...CONFIG, id: 'X'}));
});

test('the tutorial loop plays end to end: march, attack, report, return, upgrade, repair, Cache', () => {
  const p = player();
  assert.match(tutorialSay(TUTORIAL[0]), new RegExp(CONFIG.seasonName));
  p.ok({type: 'tutorial.next'});
  p.ok({type: 'tutorial.next'});
  const patrol = patrolSite(p);
  let s = p.ok({type: 'site.select', siteId: patrol.id});
  assert.equal(TUTORIAL[s.tutorial.step].advance, 'march.start');
  assert.equal(p.run({type: 'march.start', siteId: patrol.id, robots: [...ROLES], assets: ['m1a2']}).ok, false, 'no drone, no march');
  s = p.ok({type: 'march.start', siteId: patrol.id, robots: [...ROLES], assets: ALL_ASSETS});
  assert.equal(TUTORIAL[s.tutorial.step].advance, 'march.arrive');
  assert.equal((s.march!.arriveAt - s.march!.departAt) / 1000, marchSeconds(patrol));
  assert.deepEqual(lanesDone(s, 0), ['mobilization']);
  assert.equal(p.run({type: 'battle.seen'}).ok, false, 'no report before contact');

  // Contact: the fight is resolved at arrival and plays out for its rounds.
  p.wait(s.march!.arriveAt - p.simNow() + 1);
  s = p.state();
  assert.equal(s.march?.phase, 'engaged');
  const e = s.encounter!;
  assert.equal(e.status, 'won');
  assert.equal(e.applied, false);
  assert.ok(e.rounds.length >= 1 && e.endsAt > e.startsAt);
  assert.equal(s.stats.trainingKills, 0, 'nothing is counted until the fight has played out');
  assert.equal(p.run({type: 'march.recall'}).ok, false, 'an attack under way cannot be recalled');
  assert.equal(p.run({type: 'battle.seen'}).ok, false, 'the report waits for the fight');

  const before = s;
  s = fightToEnd(p);
  assert.equal(s.encounter?.applied, true);
  assert.equal(s.march?.phase, 'returning');
  assert.equal(s.stats.trainingKills, 3);
  assert.equal(s.stats.confirmedPvpDestructions, 0);
  assert.equal(s.stats.patrolWins, 1);
  assert.ok(s.company.xp > 0);
  const reward = siteReward(patrol, before)!;
  const industry = laneReward('industry', 1);
  assert.equal(s.supplies.steel, before.supplies.steel + reward.steel + industry.steel);
  // The tutorial fight leaves damage to recover from.
  assert.ok(ROLES.some((r) => robotNeedsRepair(s.robots[r])) || s.assets.some((a) => assetNeedsRepair(a)));

  s = p.ok({type: 'battle.seen'});
  assert.equal(s.encounter?.seen, true);
  assert.equal(TUTORIAL[s.tutorial.step].advance, 'march.home');
  s = waitHome(p);
  assert.equal(s.march, null);
  assert.equal(TUTORIAL[s.tutorial.step].advance, 'robot.upgrade');

  // A robot level: pay, wait, one part installed, real stats up.
  const quote = nextInstall(s.robots.assault)!;
  assert.equal(quote.slot, 'head');
  assert.equal(quote.cost.credits, 0, 'robot upgrades cost supplies only');
  const paid = s;
  s = p.ok({type: 'robot.upgrade', role: 'assault'});
  assert.equal(s.robots.assault.status, 'upgrading');
  assert.equal(s.supplies.steel, paid.supplies.steel - quote.cost.steel);
  p.wait(quote.minutes * MIN + 1);
  s = p.state();
  assert.equal(s.robots.assault.level, 2);
  assert.deepEqual(s.lastInstall && {role: s.lastInstall.role, from: s.lastInstall.fromLevel, to: s.lastInstall.toLevel, slot: s.lastInstall.slot}, {role: 'assault', from: 1, to: 2, slot: 'head'});
  assert.ok(robotStats('assault', 2).damage > robotStats('assault', 1).damage);
  assert.notEqual(s.seenInstallAt, s.lastInstall!.at, 'the ceremony has not been watched yet');
  s = p.ok({type: 'install.seen'});
  assert.equal(s.seenInstallAt, s.lastInstall!.at);
  assert.equal(TUTORIAL[s.tutorial.step].advance, 'recover');

  // Repair what the fight damaged, with supplies and time.
  const robot = ROLES.find((r) => robotNeedsRepair(s.robots[r]));
  const asset = s.assets.find((a) => assetNeedsRepair(a));
  if (robot) {
    const rq = repairQuote(s.robots[robot], s.workshop.level);
    const b = s;
    s = p.ok({type: 'robot.repair', role: robot});
    assert.equal(s.robots[robot].status, 'repairing');
    assert.equal(s.supplies.fuel, b.supplies.fuel - rq.cost.fuel);
    p.wait(rq.minutes * MIN + 1);
    assert.equal(p.state().robots[robot].hp, robotStats(robot, s.robots[robot].level).maxHp);
  } else {
    const aq = assetRepairQuote(asset!);
    s = p.ok({type: 'asset.repair', assetId: asset!.assetId});
    p.wait(aq.minutes * MIN + 1);
  }
  s = p.state();
  assert.equal(TUTORIAL[s.tutorial.step].advance, 'ops.cache');

  // Four lanes: mobilization, engagement, industry, readiness.
  assert.equal(lanesDone(s, 0).length, 4);
  const cache = cacheReward(1);
  const beforeCache = s;
  s = p.ok({type: 'ops.cache'});
  assert.equal(s.supplies.alloy, beforeCache.supplies.alloy + cache.alloy);
  assert.equal(p.run({type: 'ops.cache'}).ok, false, 'one Cache a day');
  assert.equal(s.tutorial.completed, true);
  assert.deepEqual(
    seasonObjectives(s, p.simNow()).map((o) => [o.id, o.progress, o.done]),
    [
      ['exercises', 0, false],
      ['patrol', 1, true],
      ['lanes', 4, true],
      ['cache', 1, true],
    ],
  );
});

test('Assets use the live HP formula and repair bill, are never destroyed, and damaged ones slow the march home', () => {
  const s0 = createSandbox(T0);
  assert.deepEqual(s0.assets.map((a) => a.assetId), ALL_ASSETS);
  // HP_SCALE x (HP_BASE + 0.3 x firepower + 0.4 x armour) at rank 1: Abrams F9 A10.
  assert.equal(assetStats('m1a2').maxHp, Math.round(8 * (3 + 0.3 * 9 + 0.4 * 10)));
  const p = skipped();
  let s = p.state();
  const hurt: SandboxState = {...s, assets: s.assets.map((a) => (a.assetId === 'm1a2' ? {...a, hp: 20} : a))};
  p.kv.setItem(SANDBOX_STORAGE_KEY, JSON.stringify(hurt));
  const q = assetRepairQuote(hurt.assets[0]);
  assert.ok(q.cost.fuel > 0 && q.minutes > 0);
  s = p.ok({type: 'asset.repair', assetId: 'm1a2'});
  assert.equal(s.assets[0].status, 'repairing');
  assert.equal(s.supplies.fuel, hurt.supplies.fuel - q.cost.fuel);
  assert.equal(p.run({type: 'march.start', siteId: patrolSite(p).id, robots: ['assault'], assets: ['m1a2', 'rq4']}).ok, false, 'an Asset under repair does not march');
  p.wait(q.minutes * MIN + 1);
  assert.equal(p.state().assets[0].hp, assetStats('m1a2').maxHp);

  // A long campaign: Assets go down but never become "destroyed"; a battered column comes home slower.
  const c = skipped();
  let slowerHome = false;
  for (let i = 0; i < 16; i += 1) {
    let st = c.state();
    const robots = ROLES.filter((r) => st.robots[r].status === 'ready');
    const assets = st.assets.filter((a) => a.status === 'ready').map((a) => a.assetId);
    if (robots.length && assets.includes('rq4')) {
      marchTo(c, patrolSite(c).id, robots, assets);
      const m = c.state().march!;
      st = fightToEnd(c);
      for (const a of Object.values(st.encounter!.after.assets)) assert.ok(a.status === 'ready' || a.status === 'disabled');
      if (st.march && st.march.returnAt! - st.march.holdUntil! > m.arriveAt - m.departAt) slowerHome = true;
      c.ok({type: 'battle.seen'});
      waitHome(c);
    }
    st = c.state();
    for (const r of ROLES) {
      if (st.robots[r].status === 'destroyed') c.ok({type: 'robot.remanufacture', role: r});
      else if (robotNeedsRepair(st.robots[r])) c.ok({type: 'robot.repair', role: r});
    }
    for (const a of c.state().assets) if (assetNeedsRepair(a)) c.ok({type: 'asset.repair', assetId: a.assetId});
    c.ok({type: 'test.supplies'});
    c.wait(60 * MIN);
  }
  assert.ok(slowerHome, 'at least one return was slowed by damaged Assets');
});

test('battle events account for every point of damage and every casualty', () => {
  const c = skipped();
  let checked = 0;
  for (let i = 0; i < 14; i += 1) {
    let st = c.state();
    const robots = ROLES.filter((r) => st.robots[r].status === 'ready');
    const assets = st.assets.filter((a) => a.status === 'ready').map((a) => a.assetId);
    if (robots.length && assets.includes('rq4')) {
      marchTo(c, patrolSite(c).id, robots, assets);
      const e = c.state().encounter!;
      for (const enemy of e.enemiesStart) {
        const dealt = e.rounds.flat().filter((ev) => ev.t === 'hit' && ev.target === enemy.id).reduce((sum, ev) => sum + (ev.t === 'hit' ? ev.dmg : 0), 0);
        assert.equal(enemy.maxHp - dealt, e.enemies.find((x) => x.id === enemy.id)!.hp);
      }
      assert.equal(e.kills, e.enemies.filter((x) => x.hp <= 0).length);
      const cas = battleCasualties(e);
      const last = new Map<string, string>();
      for (const ev of e.rounds.flat()) if (ev.t === 'enemyHit') last.set(ev.to.kind === 'robot' ? ev.to.role : ev.to.assetId, ev.outcome);
      for (const r of cas.destroyed) assert.equal(last.get(r), 'destroyed');
      for (const r of cas.disabled) assert.equal(last.get(r), 'disabled');
      if (e.status === 'lost' && !e.withdrew) assert.ok(robots.every((r) => e.after.robots[r]!.status !== 'ready'), 'a loss means every robot troop is down');
      checked += 1;
      st = fightToEnd(c);
      c.ok({type: 'battle.seen'});
      waitHome(c);
    }
    st = c.state();
    for (const r of ROLES) {
      if (st.robots[r].status === 'destroyed') c.ok({type: 'robot.remanufacture', role: r});
      else if (robotNeedsRepair(st.robots[r])) c.ok({type: 'robot.repair', role: r});
    }
    for (const a of c.state().assets) if (assetNeedsRepair(a)) c.ok({type: 'asset.repair', assetId: a.assetId});
    c.wait(90 * MIN);
  }
  assert.ok(checked >= 8);
});

test('every robot level installs exactly one part and really improves the robot, levels 1 to 50', () => {
  for (const role of ROLES) {
    for (let level = 1; level < CONFIG.robotMaxLevel; level += 1) {
      const robot = {...createSandbox(T0).robots[role], level};
      const q = nextInstall(robot)!;
      const a = partsAt(level);
      const b = partsAt(level + 1);
      const changed = PART_SLOTS.filter((slot) => b[slot] !== a[slot]);
      assert.deepEqual(changed, [slotForLevel(level + 1)], `${role} ${level}`);
      assert.equal(b[q.slot], a[q.slot] + 1);
      assert.notEqual(q.fromPart, q.toPart);
      assert.equal(q.toPart, partName(role, q.slot, b[q.slot]));
      assert.doesNotMatch(q.toPart, /Salvaged|Refitted|Advanced|Prototype|Rare|Epic|Legendary/, 'no tier ladder in part names');
      const up = (['maxHp', 'damage', 'heal'] as const).filter((k) => q.after[k] > q.before[k]);
      const down = (['maxHp', 'damage', 'heal'] as const).filter((k) => q.after[k] < q.before[k]);
      assert.ok(up.length > 0, `${role} ${level}->${level + 1} shows a real gain`);
      assert.deepEqual(down, []);
      assert.ok(q.minutes > 0 && q.minutes <= 72 * 60);
    }
    assert.equal(nextInstall({...createSandbox(T0).robots[role], level: CONFIG.robotMaxLevel}), null);
    assert.equal('power' in robotStats(role, 10), false, 'no invented summary power figure');
  }
});

test('a destroyed robot is remanufactured with a new serial and keeps its level and parts', () => {
  const p = skipped();
  let s = p.state();
  const seeded: SandboxState = {...s, robots: {...s.robots, assault: {...s.robots.assault, level: 7, hp: 0, status: 'destroyed'}}};
  p.kv.setItem(SANDBOX_STORAGE_KEY, JSON.stringify(seeded));
  assert.equal(p.run({type: 'robot.repair', role: 'assault'}).ok, false, 'destroyed is not repaired');
  const q = remanufactureQuote(seeded.robots.assault, 1);
  s = p.ok({type: 'robot.remanufacture', role: 'assault'});
  assert.equal(s.robots.assault.status, 'remanufacturing');
  assert.notEqual(s.robots.assault.serial, seeded.robots.assault.serial);
  assert.equal(s.supplies.steel, seeded.supplies.steel - q.cost.steel);
  assert.equal(s.robots.assault.level, 7);
  p.wait(q.minutes * MIN + 1);
  s = p.state();
  assert.equal(s.robots.assault.status, 'ready');
  assert.equal(s.robots.assault.level, 7);
  assert.equal(s.robots.assault.hp, robotStats('assault', 7).maxHp);
  assert.equal(s.stats.confirmedPvpDestructions, 0);
});

test('nobody is stuck: with no supplies, repair and remanufacture still happen, slower, and pay no lane', () => {
  let s = createSandbox(T0);
  s = {
    ...s,
    tutorial: {step: TUTORIAL.length - 1, completed: true},
    supplies: {fuel: 0, steel: 0, munitions: 0, alloy: 0},
    robots: {
      scout: {...s.robots.scout, hp: 0, status: 'destroyed'},
      assault: {...s.robots.assault, hp: 0, status: 'disabled'},
      support: {...s.robots.support, hp: 10, status: 'ready'},
    },
  };
  const credits = s.credits;
  for (const [id, action] of [
    ['a', {type: 'robot.remanufacture', role: 'scout'}],
    ['b', {type: 'robot.repair', role: 'assault'}],
    ['c', {type: 'robot.repair', role: 'support'}],
  ] as const) {
    const r = applyAction(s, id, action, T0);
    assert.ok(r.ok, action.type);
    assert.equal(r.state.robots[action.role].job?.paid, false);
    s = r.state;
  }
  assert.equal(s.credits, credits, 'the free path completes no Readiness lane');
  assert.deepEqual(lanesDone(s, 0), []);
  const later = settle(s, T0 + 24 * 60 * MIN);
  assert.ok(ROLES.every((role) => later.robots[role].status === 'ready'));
});

test('a hold exercise pays its real reward once, on the day it finished, even if read the next day', () => {
  const p = skipped();
  const hold = todaySites(p).find((x) => !x.battle)!;
  assert.ok(hold, 'the daily picker always offers at least one hold');
  const start = p.state();
  marchTo(p, hold.id, ['scout'], ['rq4']);
  let s = p.state();
  assert.equal(s.march?.phase, 'holding');
  assert.equal(p.run({type: 'march.start', siteId: hold.id, robots: ['assault'], assets: ['rq4']}).ok, false, 'one march at a time');
  // Close the page for a whole day.
  p.wait(CONFIG.dayMs);
  s = p.state();
  const reward = exerciseReward(hold.kind as Parameters<typeof exerciseReward>[0], 1);
  assert.equal(s.supplies.fuel, start.supplies.fuel + reward.fuel + laneReward('mobilization', 1).fuel + laneReward('industry', 1).fuel);
  assert.deepEqual(lanesDone(s, 0).sort(), ['industry', 'mobilization']);
  assert.deepEqual(lanesDone(s, 1), []);
  assert.equal(s.stats.exercisesDone, 1);
  assert.equal(s.march, null);
  assert.ok(s.cleared.includes(hold.id));
  assert.equal(s.ledger.filter((k) => k === `reward:${hold.id}`).length, 1);
  assert.equal(p.run({type: 'march.start', siteId: hold.id, robots: ['scout'], assets: ['rq4']}).ok, false, 'yesterday is not on the map');
});

test('reload resumes mid-march and mid-battle, and timers keep running while the page is closed', () => {
  const kv = memory();
  const a = player(kv);
  a.ok({type: 'tutorial.skip'});
  a.ok({type: 'march.start', siteId: patrolSite(a).id, robots: [...ROLES], assets: ALL_ASSETS});
  const saved = a.state();
  assert.deepEqual(loadSandbox(kv, a.now()), saved);
  a.wait(saved.march!.arriveAt - a.simNow() + 1000);
  const mid = a.state();
  assert.equal(mid.march?.phase, 'engaged');
  const reopened = openSandbox(kv, a.now());
  assert.deepEqual(reopened.state, mid, 'a reload mid-fight shows the same fight');
  assert.equal(reopened.notice, null);
  // Closed for a day: the fight, the return and the reward have all landed, once.
  const later = loadSandbox(kv, a.now() + CONFIG.dayMs);
  assert.equal(later.march, null);
  assert.equal(later.encounter?.applied, true);
  assert.deepEqual(loadSandbox(kv, a.now() + CONFIG.dayMs + MIN), later);
});

test('an action id applies once: a double tap or replay pays nothing twice', () => {
  const p = skipped();
  const site = patrolSite(p).id;
  const once = p.run({type: 'march.start', siteId: site, robots: [...ROLES], assets: ALL_ASSETS}, 'same-tap');
  const twice = p.run({type: 'march.start', siteId: site, robots: [...ROLES], assets: ALL_ASSETS}, 'same-tap');
  assert.ok(once.ok && twice.ok);
  assert.deepEqual(twice.state, once.state);
  assert.equal(twice.state.marchesLaunched, 1);
});

test('a battle and its reward count once, however often the state is read or replayed', () => {
  const p = skipped();
  marchTo(p, patrolSite(p).id);
  const won = fightToEnd(p);
  assert.equal(won.encounter?.status, 'won');
  assert.equal(won.ledger.filter((k) => k.startsWith('reward:')).length, 1);
  assert.equal(won.ledger.filter((k) => k.startsWith('battle:')).length, 1);
  // Settling the same instant again, or later, changes nothing about the fight.
  const again = settle(won, p.simNow());
  assert.deepEqual(again.supplies, won.supplies);
  // Even a stored state whose applied flag was lost cannot pay twice.
  const tampered: SandboxState = {...won, encounter: {...won.encounter!, applied: false}, march: {...won.march!, phase: 'engaged'}};
  const replay = settle(tampered, p.simNow());
  assert.deepEqual(replay.supplies, won.supplies);
  assert.equal(replay.stats.trainingKills, won.stats.trainingKills);
});

test('each destroyed enemy counts once, and training kills never become PvP', () => {
  const p = skipped();
  marchTo(p, patrolSite(p).id);
  const s = fightToEnd(p);
  const keys = s.ledger.filter((k) => k.startsWith('destroyed:'));
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(keys.length, s.stats.trainingKills);
  // The mock rival base is a practice target: training kills, never PvP, no loot.
  const rival = todaySites(p).find((x) => x.kind === 'rival_base')!;
  assert.equal(siteReward(rival, s), null);
  assert.match(describeReward({credits: 0, fuel: 0, steel: 0, munitions: 0, alloy: 0}), /nothing/);
  assert.equal(parseSandbox({...s, stats: {...s.stats, confirmedPvpDestructions: 5}}), null);
});

test('a lost or abandoned fight pays nothing, brings the survivors home to recover, and can be retried', () => {
  const p = player();
  p.ok({type: 'tutorial.next'});
  p.ok({type: 'tutorial.next'});
  const patrol = patrolSite(p);
  p.ok({type: 'site.select', siteId: patrol.id});
  // A Scout and the drone alone against the tutorial patrol lose.
  marchTo(p, patrol.id, ['scout'], ['rq4']);
  let s = p.state();
  assert.equal(s.encounter?.status, 'lost');
  s = fightToEnd(p);
  assert.equal(s.march?.phase, 'returning');
  assert.notEqual(s.robots.scout.status, 'ready');
  assert.equal(s.ledger.some((k) => k.startsWith('reward:')), false);
  assert.equal(s.stats.battlesLost, 1);
  s = p.ok({type: 'battle.seen'});
  assert.equal(TUTORIAL[s.tutorial.step].advance, 'site.select', 'the walkthrough goes back to choosing a target');
  const home = waitHome(p);
  assert.equal(home.march, null);
  assert.ok(!home.cleared.includes(patrol.id));
  // Retry at the same strength with the others.
  const again = marchTo(p, patrol.id, ['assault', 'support'], ALL_ASSETS);
  assert.equal(again.encounter?.wave, 1);
  // Recall on the way out: no fight, no reward.
  const hold = todaySites(p).find((x) => !x.battle)!;
  fightToEnd(p);
  waitHome(p);
  p.ok({type: 'march.start', siteId: hold.id, robots: ['assault'], assets: ['rq4']});
  const r = p.ok({type: 'march.recall'});
  assert.equal(r.march?.outcome, 'recalled');
  assert.equal(waitHome(p).ledger.includes(`reward:${hold.id}`), false);
});

test('old or foreign saves start over WITH a notice; a tuning version bump keeps progress', () => {
  const v1 = {schema: 1, createdAt: T0, clockOffsetMs: 0, chassis: {}};
  for (const [raw, expectNotice] of [
    [JSON.stringify(v1), true],
    ['{', true],
    [JSON.stringify({...createSandbox(T0), config: {id: 'another-season', version: 1}}), true],
    [JSON.stringify({...createSandbox(T0), supplies: {fuel: -1}}), true],
  ] as const) {
    const kv = memory();
    kv.setItem(SANDBOX_STORAGE_KEY, raw);
    const opened = openSandbox(kv, T0);
    assert.deepEqual(opened.state, createSandbox(T0), raw);
    assert.equal(!!opened.notice, expectNotice, raw);
  }
  assert.equal(openSandbox(memory(), T0).notice, null, 'a first visit is not a reset');

  const p = skipped();
  p.ok({type: 'test.supplies'});
  const s = p.state();
  assert.equal(readSandbox({...s, assets: 'x'}).rejected, 'invalid');
  const retuned = {...s, config: {id: CONFIG.id, version: CONFIG.version + 7}, robots: {...s.robots, scout: {...s.robots.scout, level: 99}}};
  const read = readSandbox(JSON.parse(JSON.stringify(retuned)));
  assert.equal(read.rejected, null);
  assert.equal(read.state!.supplies.fuel, s.supplies.fuel, 'progress kept across a tuning change');
  assert.equal(read.state!.robots.scout.level, CONFIG.robotMaxLevel, 'held at the current test cap');
  assert.equal(read.state!.schema, SANDBOX_SCHEMA);
});

test('the test clock and test supplies move only the sandbox and are bounded', () => {
  const p = skipped();
  const r = p.ok({type: 'clock.advance', minutes: 30});
  assert.equal(r.clockOffsetMs, 30 * MIN);
  assert.equal(p.run({type: 'clock.advance', minutes: 0}).ok, false);
  assert.equal(p.run({type: 'clock.advance', minutes: 24 * 60 + 1}).ok, false);
  assert.equal(p.run({type: 'clock.advance', minutes: 1.5}).ok, false);
  const day0 = todaySites(p).map((x) => x.id);
  const next = p.ok({type: 'clock.nextDay'});
  assert.equal(sandboxDay(next, p.simNow()), 1);
  assert.notDeepEqual(todaySites(p).map((x) => x.id), day0);
  const beforeGrant = p.state();
  const granted = p.ok({type: 'test.supplies'});
  assert.equal(granted.supplies.steel - beforeGrant.supplies.steel, 5000);
  assert.equal(granted.ledger.length, beforeGrant.ledger.length, 'a test grant is not a reward');
});

test('sandbox currency is always labelled as test currency, never as real Credits or Tokens', () => {
  assert.match(describeReward({credits: 40, fuel: 1, steel: 0, munitions: 0, alloy: 0}), /40 test Credits/);
  const root = join(import.meta.dirname, '..', '..');
  for (const f of readdirSync(join(root, 'src/sandbox'))) {
    if (!/\.tsx?$/.test(f)) continue;
    const src = readFileSync(join(root, 'src/sandbox', f), 'utf8');
    assert.doesNotMatch(src, /Command Credits|\bTokens?\b/, f);
    // Any on-screen "Credits" word must say "test Credits".
    for (const m of src.matchAll(/(\w+\s)?Credits\b/g)) assert.equal(m[1]?.trim(), 'test', `${f}: "${m[0]}"`);
  }
});

/** Every module a file imports, followed through relative imports. */
function importClosure(root: string, entry: string): string[] {
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(join(root, file), 'utf8');
    for (const m of src.matchAll(/(?:from|import)\s+'(\.[^']+)'/g)) {
      const base = normalize(join(dirname(file), m[1]));
      const hit = ['.ts', '.tsx', '/index.ts'].map((ext) => base + ext).find((c) => existsSync(join(root, c)));
      if (hit) visit(hit);
    }
  };
  visit(entry);
  return [...seen];
}

test('isolation: one storage key, a strict import allow-list, and no path to the API, wallet or Worker', () => {
  const p = skipped();
  marchTo(p, patrolSite(p).id);
  assert.deepEqual([...p.kv.map.keys()], [SANDBOX_STORAGE_KEY]);

  const root = join(import.meta.dirname, '..', '..');
  const ALLOWED: Record<string, readonly string[]> = {
    'shared/sandbox.ts': ['./assets', './combat', './exercises', './repair', './season1Ops', './sandboxSeason', './upgrades'],
    'shared/sandboxSeason.ts': ['./assets', './exercises', './season', './season1Ops'],
  };
  const SANDBOX_UI = ['react', '../../shared/sandbox', '../../shared/sandboxSeason', './store', './flag', './beats', './Battlefield', './SectorMap', './RobotFigure', './RobotBay', './InstallCeremony', './ui', './sandbox.css', './robotFigure.css'];
  const files = ['shared/sandbox.ts', 'shared/sandboxSeason.ts', ...readdirSync(join(root, 'src/sandbox')).filter((f) => /\.tsx?$/.test(f)).map((f) => `src/sandbox/${f}`)];
  for (const file of files) {
    const src = readFileSync(join(root, file), 'utf8');
    const imports = [...src.matchAll(/(?:from|import)\s+'([^']+)'/g)].map((m) => m[1]);
    for (const spec of imports) assert.ok((ALLOWED[file] ?? SANDBOX_UI).includes(spec), `${file} imports ${spec}`);
  }
  // Follow every import the sandbox reaches: data modules only.
  const closure = new Set(files.flatMap((f) => importClosure(root, f)));
  for (const file of closure) {
    const rel = relative(root, join(root, file));
    assert.doesNotMatch(rel, /^(src\/live|src\/net|worker)\//, `sandbox reaches ${rel}`);
    const src = readFileSync(join(root, file), 'utf8');
    assert.doesNotMatch(src, /\bfetch\s*\(|['"`]\/api\/|XMLHttpRequest|WebSocket|sendBeacon|localStorage\.setItem\((?!SANDBOX)/, rel);
    assert.doesNotMatch(src, /from '[^']*(wallet|economy|payments?)'/, `${rel} imports a wallet/payment module`);
  }
  // And nothing in the live game or the Worker reads sandbox state.
  for (const dir of ['worker', 'src/live', 'src/net']) {
    for (const f of readdirSync(join(root, dir), {recursive: true}) as string[]) {
      if (!/\.tsx?$/.test(f)) continue;
      const src = readFileSync(join(root, dir, f), 'utf8');
      assert.doesNotMatch(src, /shared\/sandbox|sandbox\/store|wwr\.sandbox/, `${dir}/${f}`);
    }
  }
});

test('the engine never mutates the state it is given', () => {
  const deepFreeze = <T,>(o: T): T => {
    if (o && typeof o === 'object') {
      Object.values(o).forEach(deepFreeze);
      Object.freeze(o);
    }
    return o;
  };
  let s = deepFreeze(createSandbox(T0));
  let t = T0;
  const go = (a: SandboxAction, id: string) => {
    const r = applyAction(s, id, a, t);
    s = deepFreeze(r.state);
    return r;
  };
  go({type: 'tutorial.skip'}, 'a');
  const patrol = sitesFor(s, 0).find((x) => x.kind === 'patrol')!;
  go({type: 'march.start', siteId: patrol.id, robots: [...ROLES], assets: [...CONFIG.taskForceAssets]}, 'b');
  t += 5 * MIN;
  go({type: 'battle.seen'}, 'c');
  t += 5 * MIN;
  go({type: 'robot.upgrade', role: 'support'}, 'd');
  go({type: 'clock.advance', minutes: 5}, 'e');
  assert.equal(s.robots.support.level, 2);
});
