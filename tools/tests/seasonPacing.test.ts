/**
 * The Command Center 10 pacing simulation (tools/sim/seasonPacing.ts):
 * deterministic, honest about the rules it models, and pinned to the numbers
 * docs/BALANCE-PROFILES.md reports, so a table change that moves pacing
 * fails here instead of going unnoticed.
 *
 *   npm test          npm run sim:pacing   (the full report)
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {BALANCE_PROFILES, SEASON_1_CANDIDATE_CC10, SEASON_1_SHIPPED} from '../../shared/balance';
import {LEVELLED_BUILDINGS, NO_BUILDINGS, buildingBlock, buildingStep} from '../../shared/buildings';
import {
  PLAYERS,
  PLAN_SHAPES,
  START_STOCK,
  TARGETS,
  WEEKLY_TOKEN_CAP,
  checkTargets,
  makePlan,
  simulate,
  tokenCeilingByDay,
  verdict,
  wholeBaseDays,
} from '../sim/seasonPacing';
import {migratedD1} from './support/sqliteD1';

const near = (actual: number | null, expected: number, label: string) => {
  assert.ok(actual !== null, `${label}: never reached`);
  assert.ok(Math.abs(actual - expected) < 0.05, `${label}: ${actual} (pinned ${expected})`);
};

test('starting stock matches what the schema gives a new base', async () => {
  const {raw} = migratedD1();
  raw.prepare(`INSERT INTO players (id, username, username_key, password_hash, created_at, last_seen_at) VALUES ('p', 'P', 'p', 'x', 0, 0)`).run();
  // The same columns worker/index.ts seedBase writes - no resource values.
  raw.prepare(`INSERT INTO bases (player_id, name, resources_at, created_at) VALUES ('p', 'B', 0, 0)`).run();
  const row = raw.prepare(`SELECT fuel, steel, munitions, alloy FROM bases WHERE player_id = 'p'`).get();
  assert.deepEqual({...row}, START_STOCK);
});

test('every plan obeys the game gates in order, and ends at Command Center 10', () => {
  for (const shape of PLAN_SHAPES) {
    const levels = {...NO_BUILDINGS};
    const plan = makePlan(shape);
    for (const step of plan) {
      assert.equal(step.toLevel, levels[step.building] + 1, `${JSON.stringify(shape)} ${step.building}`);
      assert.equal(buildingBlock(step.building, levels, 1), null, `${JSON.stringify(shape)} ${step.building} ${step.toLevel}`);
      levels[step.building] = step.toLevel;
    }
    assert.equal(levels.command_center, 10);
  }
  assert.equal(PLAN_SHAPES.length, 16);
});

test('the simulation is deterministic', () => {
  const shape = PLAN_SHAPES[5];
  assert.deepEqual(
    simulate(SEASON_1_CANDIDATE_CC10, PLAYERS.freeTypical, shape),
    simulate(SEASON_1_CANDIDATE_CC10, PLAYERS.freeTypical, shape),
  );
});

test('money stays inside the rulings: weekly Token cap, no Tokens for free players', () => {
  for (const profile of BALANCE_PROFILES) {
    for (const player of Object.values(PLAYERS)) {
      for (const shape of PLAN_SHAPES) {
        for (const h of [null, {depotCapMultiplier: 3}, {commandCenterSpeedupPerHour: 50}]) {
          const r = simulate(profile, player, shape, h);
          assert.ok(r.maxTokensInAWeek <= WEEKLY_TOKEN_CAP, `${profile.id} ${player.name} ${r.plan}`);
          assert.ok(r.maxTokensInAWeek <= player.tokensPerWeek);
          if (player.tokensPerWeek === 0) assert.equal(r.tokensSpent, 0);
          if (r.cc10Day !== null) assert.ok(r.tokensSpent <= tokenCeilingByDay(Math.floor(r.cc10Day)));
          assert.ok(r.creditsSpent <= r.creditsEarned * player.creditsToDepot + 1e-6);
          if (!h?.commandCenterSpeedupPerHour) assert.equal(r.speedupTokens, 0);
        }
      }
    }
  }
  assert.throws(() => simulate(SEASON_1_SHIPPED, {...PLAYERS.spenderHeavy, tokensPerWeek: WEEKLY_TOKEN_CAP + 1}, PLAN_SHAPES[0]));
});

test('the candidate never builds anything longer than 72 hours', () => {
  for (const player of Object.values(PLAYERS)) {
    for (const shape of PLAN_SHAPES) assert.ok(simulate(SEASON_1_CANDIDATE_CC10, player, shape).longestBuildHours <= 72);
  }
});

test('target verdicts read windows, not ceilings', () => {
  assert.equal(verdict(16.8, TARGETS.free), 'early');
  assert.equal(verdict(49, TARGETS.free), 'on target');
  assert.equal(verdict(56, TARGETS.free), 'on target');
  assert.equal(verdict(56.1, TARGETS.free), 'late');
  assert.equal(verdict(null, TARGETS.spender), 'not in season');
  assert.equal(verdict(14, TARGETS.spender), 'on target');
  assert.equal(verdict(21, TARGETS.spender), 'on target');
});

test('PINNED: the shipped game puts both players at CC10 far too early', () => {
  const t = checkTargets(SEASON_1_SHIPPED);
  near(t.free.cc10Day, 16.8, 'free');
  near(t.spender.cc10Day, 9.8, 'spender');
  assert.equal(t.freeVerdict, 'early');
  assert.equal(t.spenderVerdict, 'early');
  assert.ok(Math.abs(wholeBaseDays(SEASON_1_SHIPPED) - 67.1) < 0.05);
  // The first Command Center level waits on Alloy: 750 at 120/hour from 0.
  assert.equal(buildingStep('command_center', 2).cost.alloy, 750);
  assert.ok(LEVELLED_BUILDINGS.length === 16);
});

test('PINNED: the candidate puts the spender on target and the free player still early', () => {
  const t = checkTargets(SEASON_1_CANDIDATE_CC10);
  near(t.free.cc10Day, 33.7, 'free');
  near(t.spender.cc10Day, 20.7, 'spender');
  assert.equal(t.spenderVerdict, 'on target');
  assert.equal(t.freeVerdict, 'early');
  assert.equal(t.bothOnTarget, false);
  assert.equal(t.spender.hypothetical, null);
});

test('hypothetical options are labelled and change only the runs that ask for them', () => {
  const actual = checkTargets(SEASON_1_CANDIDATE_CC10);
  const what = checkTargets(SEASON_1_CANDIDATE_CC10, {commandCenterSpeedupPerHour: 50});
  assert.deepEqual(what.spender.hypothetical, {commandCenterSpeedupPerHour: 50});
  assert.ok(what.spender.speedupTokens > 0);
  assert.ok((what.spender.cc10Day ?? Infinity) < (actual.spender.cc10Day ?? 0));
  // A free player has no Tokens, so a Token-priced cut changes nothing for them.
  assert.equal(what.free.cc10Day, actual.free.cc10Day);
  assert.deepEqual(checkTargets(SEASON_1_CANDIDATE_CC10), actual);
});
