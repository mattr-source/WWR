/**
 * The battle timeline (src/sandbox/beats.ts) against the engine it animates:
 * every frame is built only from the resolved battle, HP only moves when an
 * event lands, the floating numbers add up to the real damage, explosions
 * appear only for real kills and destructions, every event lands inside its
 * round, and the last frame equals the battle's real outcome.
 *
 *   npm test
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {type Encounter, ROLES, type SandboxState, applyAction, assetNeedsRepair, createSandbox, robotNeedsRepair, sandboxDay, sandboxNow, settle, sitesFor} from '../../shared/sandbox';
import {SANDBOX_SEASON_1_TEST} from '../../shared/sandboxSeason';
import {battleFrame, roundLength, roundSchedule} from '../../src/sandbox/beats';

const T0 = Date.UTC(2026, 8, 15, 12, 0, 0);
const MIN = 60_000;
const ROUND_MS = SANDBOX_SEASON_1_TEST.roundSeconds * 1000;

/** A campaign of patrol and rival-base battles with repairs between, collecting every encounter. */
function campaign(count: number): Encounter[] {
  let s: SandboxState = createSandbox(T0);
  let t = T0;
  let n = 0;
  const go = (a: Parameters<typeof applyAction>[2]) => {
    const r = applyAction(s, `x${n++}`, a, t);
    s = r.state;
    return r.ok;
  };
  go({type: 'tutorial.skip'});
  const out: Encounter[] = [];
  for (let i = 0; i < count; i += 1) {
    const day = sandboxDay(s, sandboxNow(s, t));
    const sites = sitesFor(s, day);
    const site = i % 4 === 3 ? sites.find((x) => x.kind === 'rival_base' && !s.cleared.includes(x.id)) ?? sites.find((x) => x.kind === 'patrol')! : sites.find((x) => x.kind === 'patrol')!;
    const robots = ROLES.filter((r) => s.robots[r].status === 'ready');
    const assets = s.assets.filter((a) => a.status === 'ready').map((a) => a.assetId);
    if (robots.length && assets.includes('rq4') && go({type: 'march.start', siteId: site.id, robots, assets})) {
      t += 5 * MIN;
      s = settle(s, sandboxNow(s, t));
      out.push(s.encounter!);
      t += 10 * MIN;
      go({type: 'battle.seen'});
      s = settle(s, sandboxNow(s, t));
    }
    for (const r of ROLES) {
      if (s.robots[r].status === 'destroyed') go({type: 'robot.remanufacture', role: r});
      else if (robotNeedsRepair(s.robots[r])) go({type: 'robot.repair', role: r});
    }
    for (const a of s.assets) if (assetNeedsRepair(a)) go({type: 'asset.repair', assetId: a.assetId});
    if (i % 2 === 0) go({type: 'test.supplies'});
    t += 60 * MIN;
    s = settle(s, sandboxNow(s, t));
  }
  return out;
}

const BATTLES = campaign(18);

test('the campaign covers wins, losses, disabled and destroyed robots and knocked-out Assets', () => {
  assert.ok(BATTLES.length >= 12);
  const all = BATTLES.flatMap((e) => e.rounds.flat());
  assert.ok(BATTLES.some((e) => e.status === 'won'));
  assert.ok(BATTLES.some((e) => e.status === 'lost'));
  assert.ok(all.some((ev) => ev.t === 'enemyHit' && ev.outcome === 'disabled' && ev.to.kind === 'robot'));
  assert.ok(all.some((ev) => ev.t === 'enemyHit' && ev.outcome === 'destroyed'));
  assert.ok(all.some((ev) => ev.t === 'enemyHit' && ev.outcome === 'disabled' && ev.to.kind === 'asset'));
  assert.ok(all.some((ev) => ev.t === 'heal'));
  assert.ok(BATTLES.some((e) => e.siteKind === 'rival_base'));
});

test('the last frame is exactly the battle the engine resolved', () => {
  for (const e of BATTLES) {
    const end = battleFrame(e, e.endsAt, ROUND_MS);
    assert.equal(end.over, true);
    assert.equal(end.result, false);
    assert.deepEqual(end.robots, e.after.robots);
    assert.deepEqual(end.assets, e.after.assets);
    for (const x of e.enemies) assert.equal(end.enemies[x.id], x.hp);
    const start = battleFrame(e, e.startsAt, ROUND_MS);
    assert.deepEqual(start.robots, e.before.robots);
    assert.equal(start.round, 0);
    // The result banner is up between the last round and the end.
    assert.equal(battleFrame(e, e.startsAt + e.rounds.length * ROUND_MS + 10, ROUND_MS).result, true);
  }
});

test('every event lands inside its round, and HP only moves when an event lands', () => {
  for (const e of BATTLES) {
    for (const events of e.rounds) assert.ok(roundLength(events) < ROUND_MS, `round of ${events.length} events fits`);
    let prev = battleFrame(e, e.startsAt, ROUND_MS);
    for (let t = e.startsAt; t <= e.endsAt; t += 40) {
      const f = battleFrame(e, t, ROUND_MS);
      for (const x of e.enemiesStart) assert.ok(f.enemies[x.id] <= prev.enemies[x.id], 'enemy HP never recovers');
      for (const role of ROLES) {
        const a = f.robots[role];
        const b = prev.robots[role];
        if (a && b && b.status !== 'ready') assert.equal(a.status, b.status, 'a downed robot stays down');
      }
      prev = f;
    }
  }
});

test('floating numbers equal the real damage and heals; blasts only for real kills and destructions', () => {
  for (const e of BATTLES) {
    for (const events of e.rounds) {
      const {fx} = roundSchedule(events);
      const dealt = events.reduce((sum, ev) => sum + (ev.t === 'hit' || ev.t === 'enemyHit' ? ev.dmg : 0), 0);
      const shown = fx.filter((f) => f.tone === 'damage').reduce((sum, f) => sum + Number(f.text!.slice(1)), 0);
      assert.equal(shown, dealt);
      const healed = events.reduce((sum, ev) => sum + (ev.t === 'heal' ? ev.amount : 0), 0);
      assert.equal(fx.filter((f) => f.tone === 'heal').reduce((sum, f) => sum + Number(f.text!.slice(1)), 0), healed);
      const blasts = fx.filter((f) => f.type === 'explosion').length;
      const real = events.filter((ev) => (ev.t === 'hit' && ev.destroyed) || (ev.t === 'enemyHit' && ev.outcome === 'destroyed')).length;
      assert.equal(blasts, real);
      // Shooters are exactly the units the engine says fired.
      const volley = events.find((ev) => ev.t === 'volley');
      const hits = events.filter((ev) => ev.t === 'hit').length;
      if (volley && volley.t === 'volley' && hits) assert.equal(fx.filter((f) => f.type === 'shot').length, volley.shooters.length);
    }
  }
});
