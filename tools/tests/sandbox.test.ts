/**
 * The Field Sandbox (shared/sandbox.ts, src/sandbox/store.ts): the whole
 * tutorial loop plays through, state survives a reload, rewards and
 * destructions count once, NPC kills never become PvP, and the sandbox is
 * sealed off from the live game.
 *
 *   npm test
 */
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import test from 'node:test';
import {
  CHASSIS_SPEC,
  ROLES,
  type SandboxAction,
  type SandboxState,
  TUTORIAL,
  applyAction,
  createSandbox,
  encounterReward,
  parseSandbox,
  settle,
} from '../../shared/sandbox';
import {type KeyValue, SANDBOX_STORAGE_KEY, dispatchSandbox, loadSandbox, resetSandbox} from '../../src/sandbox/store';

const T0 = Date.UTC(2026, 8, 15, 12, 0, 0);
const MIN = 60_000;

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
  return {kv, run, ok, wait: (ms: number) => (clock += ms), now: () => clock, state: () => loadSandbox(kv, clock)};
}

function fightToEnd(p: ReturnType<typeof player>): SandboxState {
  let s = p.state();
  for (let i = 0; i < 30 && s.encounter?.status === 'active'; i += 1) s = p.ok({type: 'encounter.fire'});
  return s;
}

test('the tutorial loop plays end to end: encounter, supplies, upgrade, damage, recovery', () => {
  const p = player();
  assert.equal(p.state().tutorial.step, 0);
  p.ok({type: 'tutorial.next'});
  p.ok({type: 'tutorial.next'});
  assert.equal(TUTORIAL[p.state().tutorial.step].advance, 'encounter.start');
  p.ok({type: 'encounter.start'});
  let s = p.ok({type: 'encounter.fire'});
  assert.equal(TUTORIAL[s.tutorial.step].advance, 'encounter.won');
  s = fightToEnd(p);
  assert.equal(s.encounter?.status, 'won');
  assert.equal(s.stats.trainingKills, 3);
  // The tutorial fight always leaves damage to recover from.
  assert.equal(s.chassis.scout.status, 'disabled');
  assert.ok(s.company.xp > 0);

  const before = s.supplies;
  s = p.ok({type: 'encounter.claim'});
  const reward = encounterReward(1);
  assert.equal(s.supplies.steel, before.steel + reward.steel);

  s = p.ok({type: 'workshop.start'});
  assert.ok(s.workshop.job);
  s = p.ok({type: 'chassis.repair', role: 'scout'});
  assert.equal(s.chassis.scout.status, 'repairing');
  assert.equal(TUTORIAL[s.tutorial.step].advance, 'recovery.done');

  p.wait(2 * MIN);
  s = p.state();
  assert.equal(s.chassis.scout.status, 'ready');
  assert.equal(s.chassis.scout.hp, CHASSIS_SPEC.scout.maxHp);
  assert.equal(s.workshop.level, 1, 'the upgrade is still running');
  p.wait(1 * MIN);
  s = p.state();
  assert.equal(s.workshop.level, 2);
  assert.equal(s.tutorial.completed, true);
});

test('reload resumes mid-encounter and timers keep running while the page is closed', () => {
  const kv = memory();
  const a = player(kv);
  a.ok({type: 'tutorial.skip'});
  a.ok({type: 'encounter.start'});
  a.ok({type: 'encounter.fire'});
  const saved = a.state();

  // A new page load: nothing but what storage holds.
  const b = loadSandbox(kv, a.now());
  assert.deepEqual(b, saved);
  assert.equal(b.encounter?.status, 'active');
  assert.equal(b.encounter?.round, 1);

  const p = player(kv);
  fightToEnd(p);
  p.ok({type: 'encounter.claim'});
  const started = p.ok({type: 'workshop.start'});
  const done = started.workshop.job!.completesAt;
  // Closed for an hour; opened again: the upgrade has landed, once.
  const later = loadSandbox(kv, done + 60 * MIN);
  assert.equal(later.workshop.level, 2);
  assert.equal(later.workshop.job, null);
  assert.deepEqual(loadSandbox(kv, done + 61 * MIN), later);
});

test('an action id applies once: a double tap or replay pays nothing twice', () => {
  const p = player();
  p.ok({type: 'tutorial.skip'});
  p.ok({type: 'encounter.start'});
  const once = p.run({type: 'encounter.fire'}, 'same-tap');
  const twice = p.run({type: 'encounter.fire'}, 'same-tap');
  assert.ok(once.ok && twice.ok);
  assert.deepEqual(twice.state, once.state);
  assert.equal(twice.state.encounter?.round, 1);
});

test('a reward is collected once, even with fresh action ids', () => {
  const p = player();
  p.ok({type: 'tutorial.skip'});
  p.ok({type: 'encounter.start'});
  fightToEnd(p);
  const claimed = p.ok({type: 'encounter.claim'});
  const again = p.run({type: 'encounter.claim'});
  assert.equal(again.ok, false);
  assert.deepEqual(p.state().supplies, claimed.supplies);
  assert.equal(claimed.ledger.filter((k) => k.startsWith('reward:')).length, 1);

  // Even a state whose flag was lost cannot collect a ledgered reward again.
  const tampered: SandboxState = {...claimed, encounter: {...claimed.encounter!, claimed: false}};
  const r = applyAction(tampered, 'x', {type: 'encounter.claim'}, T0);
  assert.equal(r.ok, false);
});

test('each destroyed robot counts once, and training kills never become PvP', () => {
  const p = player();
  p.ok({type: 'tutorial.skip'});
  p.ok({type: 'encounter.start'});
  const s = fightToEnd(p);
  const keys = s.ledger.filter((k) => k.startsWith('destroyed:'));
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(keys.length, s.stats.trainingKills);
  assert.equal(s.stats.confirmedPvpDestructions, 0);
  // Firing at a finished encounter is refused, so nothing is re-counted.
  assert.equal(p.run({type: 'encounter.fire'}).ok, false);
  assert.equal(p.state().stats.trainingKills, s.stats.trainingKills);

  // A stored state claiming PvP destructions is not trusted at all.
  assert.equal(parseSandbox({...s, stats: {...s.stats, confirmedPvpDestructions: 5}}), null);
});

test('destroyed chassis are replaced; the company keeps its experience', () => {
  let s = createSandbox(T0);
  s = {...s, tutorial: {step: TUTORIAL.length - 1, completed: true}, company: {...s.company, xp: 180}, chassis: {...s.chassis, scout: {...s.chassis.scout, hp: 0, status: 'destroyed'}}};
  const r = applyAction(s, 'r1', {type: 'chassis.reinforce', role: 'scout'}, T0);
  assert.ok(r.ok);
  assert.equal(r.state.chassis.scout.status, 'reinforcing');
  assert.notEqual(r.state.chassis.scout.serial, s.chassis.scout.serial);
  const back = settle(r.state, T0 + 60 * MIN);
  assert.equal(back.chassis.scout.status, 'ready');
  assert.equal(back.company.xp, 180);
  // Destroyed cannot be repaired; disabled cannot be "replaced".
  assert.equal(applyAction(s, 'r2', {type: 'chassis.repair', role: 'scout'}, T0).ok, false);
});

test('nobody is stuck: with no supplies, repairs and replacements still come, slower', () => {
  let s = createSandbox(T0);
  s = {
    ...s,
    supplies: {fuel: 0, steel: 0, munitions: 0, alloy: 0},
    chassis: {
      scout: {...s.chassis.scout, hp: 0, status: 'destroyed'},
      assault: {...s.chassis.assault, hp: 0, status: 'disabled'},
      support: {...s.chassis.support, hp: 0, status: 'disabled'},
    },
  };
  for (const [id, action] of [
    ['a', {type: 'chassis.reinforce', role: 'scout'}],
    ['b', {type: 'chassis.repair', role: 'assault'}],
    ['c', {type: 'chassis.repair', role: 'support'}],
  ] as const) {
    const r = applyAction(s, id, action, T0);
    assert.ok(r.ok, action.type);
    s = r.state;
  }
  const later = settle(s, T0 + 24 * 60 * MIN);
  assert.ok(ROLES.every((role) => later.chassis[role].status === 'ready'));
  assert.equal(applyAction(later, 'd', {type: 'encounter.start'}, T0 + 24 * 60 * MIN).ok, true);
});

test('a lost patrol is retried at the same strength', () => {
  let s = createSandbox(T0);
  s = {...s, tutorial: {step: TUTORIAL.length - 1, completed: true}};
  s = applyAction(s, 'start', {type: 'encounter.start'}, T0).state;
  s = applyAction(s, 'retreat', {type: 'encounter.retreat'}, T0).state;
  const retry = applyAction(s, 'again', {type: 'encounter.start'}, T0);
  assert.ok(retry.ok);
  assert.equal(retry.state.encounter?.wave, 1);
  assert.notEqual(retry.state.encounter?.id, s.encounter?.id);
});

test('the test clock moves only the sandbox and is bounded', () => {
  const p = player();
  p.ok({type: 'tutorial.skip'});
  const r = p.ok({type: 'clock.advance', minutes: 30});
  assert.equal(r.clockOffsetMs, 30 * MIN);
  assert.equal(p.run({type: 'clock.advance', minutes: 0}).ok, false);
  assert.equal(p.run({type: 'clock.advance', minutes: 24 * 60 + 1}).ok, false);
  assert.equal(p.run({type: 'clock.advance', minutes: 1.5}).ok, false);
});

test('corrupt or foreign storage starts a fresh sandbox instead of crashing', () => {
  for (const junk of ['{', 'null', '[]', JSON.stringify({schema: 99}), JSON.stringify({...createSandbox(T0), supplies: {fuel: -1}})]) {
    const kv = memory();
    kv.setItem(SANDBOX_STORAGE_KEY, junk);
    const s = loadSandbox(kv, T0);
    assert.deepEqual(s, createSandbox(T0), junk);
  }
  const kv = memory();
  player(kv).ok({type: 'tutorial.skip'});
  assert.equal(resetSandbox(kv, T0).tutorial.step, 0);
});

test('isolation: the sandbox writes one storage key and cannot reach the API or the Worker', () => {
  const p = player();
  p.ok({type: 'tutorial.skip'});
  p.ok({type: 'encounter.start'});
  assert.deepEqual([...p.kv.map.keys()], [SANDBOX_STORAGE_KEY]);

  const root = join(import.meta.dirname, '..', '..');
  const files = ['shared/sandbox.ts', ...readdirSync(join(root, 'src/sandbox')).map((f) => `src/sandbox/${f}`)];
  for (const file of files) {
    const src = readFileSync(join(root, file), 'utf8');
    assert.doesNotMatch(src, /\bfetch\s*\(|\/api\/|net\/api|from ['"][./]*worker|XMLHttpRequest|WebSocket|sendBeacon/, file);
    const imports = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    for (const spec of imports) {
      assert.ok(['react', '../../shared/sandbox', './store', './flag', './beats', './Battlefield'].includes(spec), `${file} imports ${spec}`);
    }
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
  const actions: SandboxAction[] = [
    {type: 'tutorial.next'},
    {type: 'tutorial.next'},
    {type: 'encounter.start'},
    {type: 'encounter.fire'},
    {type: 'encounter.fire'},
    {type: 'encounter.fire'},
    {type: 'encounter.claim'},
    {type: 'workshop.start'},
    {type: 'chassis.repair', role: 'scout'},
    {type: 'clock.advance', minutes: 5},
  ];
  actions.forEach((a, i) => {
    s = deepFreeze(applyAction(s, `f${i}`, a, T0).state);
  });
  assert.equal(s.workshop.level, 2);
});
