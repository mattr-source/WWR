/**
 * The Field Sandbox battlefield animates only what really happened
 * (src/sandbox/beats.ts): every shot, number, destruction, crate and repair
 * flare in a timeline is checked here against the engine state it replays.
 *
 *   npm test
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHASSIS_SPEC,
  ROLES,
  type SandboxAction,
  type SandboxState,
  TUTORIAL,
  applyAction,
  createSandbox,
  settle,
} from '../../shared/sandbox';
import {type Timeline, completionsFor, parseHits, roundLines, timelineFor} from '../../src/sandbox/beats';

const T0 = Date.UTC(2026, 8, 15, 12, 0, 0);
const MIN = 60_000;

function step(s: SandboxState, action: SandboxAction, id: string, now = T0) {
  const r = applyAction(s, id, action, now);
  assert.ok(r.ok, `${action.type}: ${'error' in r ? r.error : ''}`);
  return r.state;
}

const floatsOn = (tl: Timeline, id: string, tone: string) =>
  tl.fx.filter((f) => f.type === 'float' && f.tone === tone && f.to?.side === 'enemy' && f.to.id === id);

/** Check one volley's timeline against the engine's before/after. */
function checkVolley(before: SandboxState, after: SandboxState) {
  const tl = timelineFor(before, after, {type: 'encounter.fire'});
  const e0 = before.encounter!;
  const e1 = after.encounter!;

  // Shots only from chassis that were ready; none from a disabled one.
  const shooters = new Set(tl.fx.filter((f) => f.type === 'shot').map((f) => (f.from as {role: string}).role));
  for (const r of ROLES) assert.equal(shooters.has(r), before.chassis[r].status === 'ready' && tl.fx.some((f) => f.type === 'shot'), `shooter ${r}`);

  // Damage numbers on each robot add up to the engine's HP change; explosions only for new kills.
  for (const x of e0.enemies) {
    const y = e1.enemies.find((z) => z.id === x.id)!;
    const shown = floatsOn(tl, x.id, 'damage').reduce((sum, f) => sum + Number(f.text!.slice(1)), 0);
    assert.equal(shown, x.hp - Math.max(0, y.hp), `damage on ${x.id}`);
    const booms = tl.fx.filter((f) => f.type === 'explosion' && f.to?.side === 'enemy' && f.to.id === x.id).length;
    assert.equal(booms, x.hp > 0 && y.hp <= 0 ? 1 : 0, `explosion on ${x.id}`);
  }
  assert.equal(
    tl.fx.filter((f) => f.type === 'explosion' && f.to?.side === 'enemy').length,
    after.stats.trainingKills - before.stats.trainingKills,
  );

  // One robot answer per hit line; the damage shown on each chassis is what the log says.
  const hits = parseHits(roundLines(after));
  assert.equal(tl.fx.filter((f) => f.type === 'bolt').length, hits.length);
  for (const r of ROLES) {
    const shown = tl.fx
      .filter((f) => f.type === 'float' && f.tone === 'damage' && f.to?.side === 'ally' && f.to.role === r)
      .reduce((sum, f) => sum + Number(f.text!.slice(1)), 0);
    assert.equal(shown, hits.filter((h) => h.role === r).reduce((sum, h) => sum + h.dmg, 0), `hits on ${r}`);
  }
  // Bolts come only from robots still standing after the volley.
  for (const f of tl.fx.filter((x) => x.type === 'bolt')) {
    const id = (f.from as {id: string}).id;
    assert.ok(e1.enemies.find((z) => z.id === id)!.hp > 0, `bolt from wreck ${id}`);
  }

  // When the timeline ends, the view is exactly the real state.
  const last = new Map<string, unknown>();
  for (const u of [...tl.updates].sort((a, b) => a.at - b.at)) {
    if (u.kind === 'ally') last.set(`ally:${u.role}`, {hp: u.hp, status: u.status});
    if (u.kind === 'enemy') last.set(`enemy:${u.id}`, u.hp);
    assert.ok(u.at <= tl.duration, 'update after the timeline ends');
  }
  for (const r of ROLES) assert.deepEqual(last.get(`ally:${r}`), {hp: after.chassis[r].hp, status: after.chassis[r].status});
  for (const x of e1.enemies) assert.equal(last.get(`enemy:${x.id}`), x.hp);

  // Outcome banner matches the engine's outcome and XP.
  if (e1.status === 'won') assert.equal(tl.banner?.text, `Patrol ${e1.wave} won · +${after.company.xp - before.company.xp} XP`);
  else if (e1.status === 'lost') assert.equal(tl.banner?.tone, 'loss');
  else assert.equal(tl.banner, null);
  return tl;
}

test('every volley of the tutorial fight animates exactly what the engine resolved', () => {
  let s = step(createSandbox(T0), {type: 'tutorial.skip'}, 'skip');
  s = step(s, {type: 'encounter.start'}, 'start');
  let n = 0;
  while (s.encounter?.status === 'active') {
    const next = step(s, {type: 'encounter.fire'}, `fire-${n++}`);
    checkVolley(s, next);
    s = next;
  }
  assert.equal(s.encounter?.status, 'won');
  assert.equal(s.chassis.scout.status, 'disabled');
});

test('later patrols, including heals, disabled and destroyed chassis, and losses, match the engine', () => {
  // Drive many patrols with no repairs so damage, disabled, destroyed and loss all occur.
  let s = step(createSandbox(T0), {type: 'tutorial.skip'}, 'skip');
  let n = 0;
  const seen = {heal: 0, disabled: 0, destroyed: 0, lost: 0, won: 0};
  for (let patrol = 0; patrol < 14; patrol += 1) {
    if (!ROLES.some((r) => s.chassis[r].status === 'ready')) {
      for (const r of ROLES) {
        if (s.chassis[r].status === 'destroyed') s = step(s, {type: 'chassis.reinforce', role: r}, `re-${n++}`);
        else if (s.chassis[r].status === 'disabled') s = step(s, {type: 'chassis.repair', role: r}, `rep-${n++}`);
      }
      s = settle(s, T0 + 10_000 * MIN);
      s = {...s, clockOffsetMs: 0};
    }
    s = step(s, {type: 'encounter.start'}, `start-${n++}`);
    while (s.encounter?.status === 'active') {
      const next = step(s, {type: 'encounter.fire'}, `fire-${n++}`);
      const tl = checkVolley(s, next);
      if (tl.fx.some((f) => f.type === 'heal')) seen.heal += 1;
      if (tl.fx.some((f) => f.type === 'float' && f.text === 'Disabled')) seen.disabled += 1;
      if (tl.fx.some((f) => f.type === 'float' && f.text === 'DESTROYED')) seen.destroyed += 1;
      s = next;
    }
    seen[s.encounter!.status === 'won' ? 'won' : 'lost'] += 1;
    if (s.encounter!.status === 'won') s = step(s, {type: 'encounter.claim'}, `claim-${n++}`);
  }
  assert.ok(seen.heal > 0 && seen.disabled > 0 && seen.won > 0, JSON.stringify(seen));
  assert.ok(seen.destroyed > 0 || seen.lost > 0, JSON.stringify(seen));
});

test('a destroyed chassis explodes on the field exactly when the engine destroys it', () => {
  let s = step(createSandbox(T0), {type: 'tutorial.skip'}, 'skip');
  // A nearly dead Scout against patrol 1: the first Crawler hit overkills it.
  s = {...s, chassis: {...s.chassis, scout: {...s.chassis.scout, hp: 1}, support: {...s.chassis.support, status: 'disabled', hp: 0}}};
  s = step(s, {type: 'encounter.start'}, 'start');
  const after = step(s, {type: 'encounter.fire'}, 'fire');
  const tl = checkVolley(s, after);
  if (after.chassis.scout.status === 'destroyed') {
    assert.ok(tl.fx.some((f) => f.type === 'explosion' && f.to?.side === 'ally' && f.to.role === 'scout'));
  } else {
    assert.ok(!tl.fx.some((f) => f.type === 'explosion' && f.to?.side === 'ally'));
  }
});

test('collecting supplies: one crate per wreck, and the numbers are the real gain', () => {
  let s = step(createSandbox(T0), {type: 'tutorial.skip'}, 'skip');
  s = step(s, {type: 'encounter.start'}, 'start');
  let n = 0;
  while (s.encounter?.status === 'active') s = step(s, {type: 'encounter.fire'}, `f${n++}`);
  const after = step(s, {type: 'encounter.claim'}, 'claim');
  const tl = timelineFor(s, after, {type: 'encounter.claim'});
  assert.equal(tl.fx.filter((f) => f.type === 'crate').length, s.encounter!.enemies.length);
  for (const f of tl.fx.filter((x) => x.type === 'float')) {
    const k = (f.to as {supply: 'fuel' | 'steel' | 'munitions' | 'alloy'}).supply;
    assert.equal(f.text, `+${after.supplies[k] - s.supplies[k]}`);
  }
  // A refused second collect changes nothing, so nothing plays.
  const again = applyAction(after, 'claim-2', {type: 'encounter.claim'}, T0);
  assert.equal(again.ok, false);
  assert.equal(timelineFor(after, again.state, {type: 'encounter.claim'}).fx.length, 0);
});

test('a replayed action id plays nothing', () => {
  const s = step(createSandbox(T0), {type: 'tutorial.next'}, 'same');
  const r = applyAction(s, 'same', {type: 'tutorial.next'}, T0);
  assert.equal(r.state, s);
  assert.deepEqual(timelineFor(s, r.state, {type: 'tutorial.next'}), {fx: [], updates: [], banner: null, duration: 0});
});

test('timers landing: workshop level, repaired and replaced chassis flare once, only when they complete', () => {
  let s = step(createSandbox(T0), {type: 'tutorial.skip'}, 'skip');
  s = {...s, supplies: {fuel: 9999, steel: 9999, munitions: 9999, alloy: 9999}, chassis: {...s.chassis, scout: {...s.chassis.scout, hp: 0, status: 'disabled'}, assault: {...s.chassis.assault, hp: 0, status: 'destroyed'}}};
  s = step(s, {type: 'workshop.start'}, 'ws');
  s = step(s, {type: 'chassis.repair', role: 'scout'}, 'rep');
  s = step(s, {type: 'chassis.reinforce', role: 'assault'}, 'rein');
  const early = settle(s, T0 + MIN);
  assert.equal(completionsFor(s, early).fx.length, 0, 'nothing finished yet');
  const later = settle(s, T0 + 30 * MIN);
  const tl = completionsFor(s, later);
  assert.ok(tl.fx.some((f) => f.type === 'burst' && f.to?.side === 'workshop'));
  assert.ok(tl.fx.some((f) => f.type === 'float' && f.text === 'Repaired' && f.to?.side === 'ally' && f.to.role === 'scout'));
  assert.ok(tl.fx.some((f) => f.type === 'drop' && f.to?.side === 'ally' && f.to.role === 'assault'));
  assert.equal(tl.banner?.text, `Field Workshop upgraded to Lv ${later.workshop.level}`);
  // Seen once: the same state again plays nothing.
  assert.equal(completionsFor(later, settle(later, T0 + 40 * MIN)).fx.length, 0);
  // The test clock path replays the same completions.
  const clocked = step(s, {type: 'clock.advance', minutes: 30}, 'clock');
  assert.ok(timelineFor(s, clocked, {type: 'clock.advance', minutes: 30}).fx.some((f) => f.type === 'burst'));
  assert.equal(later.chassis.scout.hp, CHASSIS_SPEC.scout.maxHp);
});

test('reduced motion: the whole timeline collapses to now, text still shows', () => {
  let s = step(createSandbox(T0), {type: 'tutorial.skip'}, 'skip');
  s = step(s, {type: 'encounter.start'}, 'start');
  const after = step(s, {type: 'encounter.fire'}, 'fire');
  const tl = timelineFor(s, after, {type: 'encounter.fire'}, 0);
  assert.equal(tl.duration, 0);
  assert.ok(tl.fx.every((f) => f.at === 0));
  assert.ok(tl.updates.every((u) => u.at === 0));
  assert.ok(tl.fx.filter((f) => f.type !== 'float').every((f) => f.dur === 0));
  assert.ok(tl.fx.some((f) => f.type === 'float' && f.dur > 0));
  assert.equal(TUTORIAL.length, 10);
});
