/**
 * Balance profiles (shared/balance.ts): the default is the shipped game, bad
 * profiles are refused, selection is explicit, and a running timer never
 * moves when the profile does.
 *
 *   npm test
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {RANK_GROWTH} from '../../shared/assets';
import {
  BALANCE_PROFILES,
  BALANCE_SCHEMA,
  type BalanceProfile,
  CC_COST_MULTIPLIER_MAX,
  CC_COST_MULTIPLIER_MIN,
  DEFAULT_BALANCE_PROFILE,
  MAX_BUILD_MINUTES,
  SEASON_1_CANDIDATE_CC10,
  SEASON_1_SHIPPED,
  balanceProfileById,
  defineBalanceProfile,
  selectBalanceProfile,
  validateBalanceProfile,
  validateBalanceRegistry,
} from '../../shared/balance';
import {
  DAILY_RESOURCE_CAP,
  LEVELLED_BUILDINGS,
  RESOURCE_PER_UNIT,
  SHIPPED_BUILDING_MINUTES,
  TIMER_GROUPS,
  buildingStep,
  engineerMultiplier,
} from '../../shared/buildings';
import {COMBAT_SYSTEM_COST_BASE, COMBAT_SYSTEM_COST_GROWTH} from '../../shared/combatSystems';
import {readBase, startLevel} from '../../worker/buildings';
import {migratedD1} from './support/sqliteD1';

const MIN = 60_000;

/** A structurally valid profile to break one field at a time. */
function sample(over: Partial<Record<keyof BalanceProfile, unknown>> = {}): Record<string, unknown> {
  return {
    schema: BALANCE_SCHEMA,
    id: 'test-profile',
    version: 1,
    status: 'candidate',
    label: 'Test',
    notes: '',
    timers: {...SHIPPED_BUILDING_MINUTES},
    commandCenterCostMultiplier: [1, 1, 1, 1, 1, 1, 1, 1, 1],
    maxBuildMinutes: MAX_BUILD_MINUTES,
    ...over,
  };
}

const withTimer = (group: string, rows: unknown) => sample({timers: {...SHIPPED_BUILDING_MINUTES, [group]: rows}});

/* -------------------------------------------------------------------------- */
/* Default and backward compatibility                                         */
/* -------------------------------------------------------------------------- */

test('the default profile is the shipped game, row for row, levels 2-50', () => {
  assert.equal(DEFAULT_BALANCE_PROFILE, SEASON_1_SHIPPED);
  assert.equal(DEFAULT_BALANCE_PROFILE.status, 'default');
  assert.equal(DEFAULT_BALANCE_PROFILE.maxBuildMinutes, null);
  for (const b of LEVELLED_BUILDINGS) {
    for (let level = 2; level <= 50; level += 1) {
      assert.deepEqual(buildingStep(b, level, DEFAULT_BALANCE_PROFILE), buildingStep(b, level), `${b} ${level}`);
    }
  }
});

test('shipped numbers are pinned, so a table edit cannot pass as "same as default"', () => {
  // Index = the level being BUILT. Command Center 2 reads row 2, not row 1.
  assert.deepEqual(buildingStep('command_center', 2), {cost: {fuel: 1350, steel: 1050, munitions: 900, alloy: 750}, ms: 120 * MIN});
  assert.deepEqual(buildingStep('command_center', 5), {cost: {fuel: 4400, steel: 3400, munitions: 3000, alloy: 2500}, ms: 720 * MIN});
  assert.deepEqual(buildingStep('command_center', 10), {cost: {fuel: 24000, steel: 21600, munitions: 19000, alloy: 16200}, ms: 3600 * MIN});
  assert.equal(buildingStep('quartermaster_warehouse', 2).ms, 40 * MIN);
  assert.equal(buildingStep('recovery_yard', 2).ms, 30 * MIN);
  assert.equal(buildingStep('armour_hub', 10).ms, 2160 * MIN);
  // Past 10 the shipped extrapolation is unclamped, as it always was.
  assert.equal(buildingStep('command_center', 11).ms, 5400 * MIN);
  assert.deepEqual(SHIPPED_BUILDING_MINUTES.commandCenter, [120, 240, 480, 720, 1080, 1440, 2160, 2880, 3600]);
});

test('selecting nothing selects the default', () => {
  for (const setting of [undefined, null, '', '   ']) {
    const sel = selectBalanceProfile(setting);
    assert.ok(sel.ok);
    assert.equal(sel.profile, DEFAULT_BALANCE_PROFILE, String(setting));
  }
});

/* -------------------------------------------------------------------------- */
/* Registry and candidate                                                     */
/* -------------------------------------------------------------------------- */

test('the registry validates: unique ids, one default', () => {
  assert.deepEqual(validateBalanceRegistry(BALANCE_PROFILES), []);
  assert.match(validateBalanceRegistry([SEASON_1_SHIPPED, SEASON_1_SHIPPED]).join(), /duplicate id/);
  assert.match(validateBalanceRegistry([SEASON_1_CANDIDATE_CC10]).join(), /exactly one default/);
  assert.match(
    validateBalanceRegistry([SEASON_1_SHIPPED, {...SEASON_1_CANDIDATE_CC10, status: 'default'}]).join(),
    /found 2/,
  );
});

test('profiles are frozen', () => {
  assert.ok(Object.isFrozen(SEASON_1_CANDIDATE_CC10));
  assert.ok(Object.isFrozen(SEASON_1_CANDIDATE_CC10.timers.commandCenter));
  assert.throws(() => {
    (SEASON_1_CANDIDATE_CC10.timers.commandCenter as number[])[0] = 1;
  });
});

test('the candidate keeps every build under 72 h, and touches only Command Center rows', () => {
  const c = SEASON_1_CANDIDATE_CC10;
  assert.equal(c.status, 'candidate');
  for (const b of LEVELLED_BUILDINGS) {
    for (let level = 2; level <= 50; level += 1) {
      const step = buildingStep(b, level, c);
      assert.ok(step.ms <= MAX_BUILD_MINUTES * MIN, `${b} ${level}: ${step.ms / MIN} min`);
      if (b !== 'command_center' && level <= 10) assert.deepEqual(step, buildingStep(b, level), `${b} ${level}`);
    }
  }
  for (const g of TIMER_GROUPS) if (g !== 'commandCenter') assert.deepEqual(c.timers[g], SHIPPED_BUILDING_MINUTES[g]);
});

test('what no profile can reach: Depot rates and caps, rank growth, Combat Systems curve', () => {
  assert.deepEqual(RESOURCE_PER_UNIT, {fuel: 100, steel: 80, munitions: 70, alloy: 60});
  assert.deepEqual(DAILY_RESOURCE_CAP, {fuel: 20000, steel: 16000, munitions: 14000, alloy: 12000});
  assert.equal(RANK_GROWTH, 1.045);
  assert.equal(COMBAT_SYSTEM_COST_BASE, 50);
  assert.equal(COMBAT_SYSTEM_COST_GROWTH, 1.1);
  for (const p of BALANCE_PROFILES) {
    assert.deepEqual(
      Object.keys(p).sort(),
      ['commandCenterCostMultiplier', 'id', 'label', 'maxBuildMinutes', 'notes', 'schema', 'status', 'timers', 'version'],
    );
  }
});

/* -------------------------------------------------------------------------- */
/* Rejection and boundaries                                                   */
/* -------------------------------------------------------------------------- */

test('a valid sample passes, so each rejection below is about its one field', () => {
  assert.deepEqual(validateBalanceProfile(sample()), []);
});

test('invalid profiles are rejected with a reason', () => {
  const cases: Array<[string, unknown, RegExp]> = [
    ['not an object', 'season', /must be an object/],
    ['array', [], /must be an object/],
    ['schema', sample({schema: 2}), /schema must be 1/],
    ['id uppercase', sample({id: 'Season-1'}), /id must be/],
    ['id too short', sample({id: 'ab'}), /id must be/],
    ['id leading hyphen', sample({id: '-abc'}), /id must be/],
    ['version 0', sample({version: 0}), /version/],
    ['version fraction', sample({version: 1.5}), /version/],
    ['status', sample({status: 'live'}), /status/],
    ['label blank', sample({label: '  '}), /label/],
    ['timers missing', sample({timers: undefined}), /timers must be an object/],
    ['unknown group', sample({timers: {...SHIPPED_BUILDING_MINUTES, naval: [1]}}), /unknown groups: naval/],
    ['group missing', sample({timers: {commandCenter: SHIPPED_BUILDING_MINUTES.commandCenter}}), /timers.hub must list 9/],
    ['8 rows', withTimer('commandCenter', [1, 2, 3, 4, 5, 6, 7, 8]), /must list 9 rows/],
    ['10 rows', withTimer('commandCenter', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), /must list 9 rows/],
    ['zero minutes', withTimer('hub', [0, 1, 2, 3, 4, 5, 6, 7, 8]), /hub level 2 must be a whole number/],
    ['fractional minutes', withTimer('hub', [1.5, 2, 3, 4, 5, 6, 7, 8, 9]), /whole number/],
    ['NaN minutes', withTimer('producer', [NaN, 2, 3, 4, 5, 6, 7, 8, 9]), /whole number/],
    ['string minutes', withTimer('producer', ['60', 2, 3, 4, 5, 6, 7, 8, 9]), /whole number/],
    ['over 72 h', withTimer('commandCenter', [1, 2, 3, 4, 5, 6, 7, 8, 4321]), /level 10 is 4321 min, over/],
    ['decreasing', withTimer('department', [10, 20, 19, 30, 40, 50, 60, 70, 80]), /level 4 \(19 min\) is shorter than level 3/],
    ['multiplier rows', sample({commandCenterCostMultiplier: [1, 1]}), /commandCenterCostMultiplier must list 9/],
    ['multiplier NaN', sample({commandCenterCostMultiplier: [1, 1, NaN, 1, 1, 1, 1, 1, 1]}), /level 4 must be a number/],
    ['multiplier Infinity', sample({commandCenterCostMultiplier: [1, 1, 1, 1, 1, 1, 1, 1, Infinity]}), /level 10/],
    ['multiplier below', sample({commandCenterCostMultiplier: [CC_COST_MULTIPLIER_MIN - 0.01, 1, 1, 1, 1, 1, 1, 1, 1]}), /level 2/],
    ['multiplier above', sample({commandCenterCostMultiplier: [1, 1, 1, 1, 1, 1, 1, 1, CC_COST_MULTIPLIER_MAX + 0.01]}), /level 10/],
    ['max build 0', sample({maxBuildMinutes: 0}), /maxBuildMinutes/],
    ['max build over 72 h', sample({maxBuildMinutes: MAX_BUILD_MINUTES + 1}), /maxBuildMinutes/],
    ['max build fraction', sample({maxBuildMinutes: 60.5}), /maxBuildMinutes/],
    ['max build missing', sample({maxBuildMinutes: undefined}), /maxBuildMinutes/],
  ];
  for (const [name, profile, pattern] of cases) {
    const errors = validateBalanceProfile(profile);
    assert.ok(errors.length > 0, `${name}: accepted`);
    assert.match(errors.join('\n'), pattern, name);
  }
  assert.throws(() => defineBalanceProfile(sample({version: 0}) as unknown as BalanceProfile), /Invalid balance profile test-profile/);
});

test('boundaries are inclusive: 1 min, 72 h exactly, equal rows, multiplier band ends', () => {
  assert.deepEqual(validateBalanceProfile(withTimer('commandCenter', [1, 1, 1, 1, 1, 1, 1, 1, MAX_BUILD_MINUTES])), []);
  assert.deepEqual(validateBalanceProfile(sample({maxBuildMinutes: 1})), []);
  assert.deepEqual(validateBalanceProfile(sample({maxBuildMinutes: MAX_BUILD_MINUTES})), []);
  assert.deepEqual(validateBalanceProfile(sample({maxBuildMinutes: null})), []);
  assert.deepEqual(
    validateBalanceProfile(sample({commandCenterCostMultiplier: [CC_COST_MULTIPLIER_MIN, 1, 1, 1, 1, 1, 1, 1, CC_COST_MULTIPLIER_MAX]})),
    [],
  );
});

test('a profile clamp holds past level 10, where the extrapolation would exceed it', () => {
  const clamped = defineBalanceProfile(sample({maxBuildMinutes: 600}) as unknown as BalanceProfile);
  assert.equal(buildingStep('command_center', 5, clamped).ms, 600 * MIN); // shipped 720
  assert.equal(buildingStep('command_center', 4, clamped).ms, 480 * MIN); // under the clamp, unchanged
  assert.equal(buildingStep('command_center', 30, clamped).ms, 600 * MIN);
  assert.equal(buildingStep('command_center', 30, SEASON_1_CANDIDATE_CC10).ms, MAX_BUILD_MINUTES * MIN);
});

test('the Command Center cost multiplier scales only its own level', () => {
  const p = defineBalanceProfile(sample({commandCenterCostMultiplier: [1, 1, 2.5, 1, 1, 1, 1, 1, 1]}) as unknown as BalanceProfile);
  assert.deepEqual(buildingStep('command_center', 4, p).cost, {fuel: 7500, steel: 5750, munitions: 5000, alloy: 4125});
  assert.deepEqual(buildingStep('command_center', 3, p).cost, buildingStep('command_center', 3).cost);
  assert.deepEqual(buildingStep('fuel_point', 4, p).cost, buildingStep('fuel_point', 4).cost);
});

/* -------------------------------------------------------------------------- */
/* Selection                                                                  */
/* -------------------------------------------------------------------------- */

test('selection: by id, by pinned version, and loud refusals', () => {
  const byId = selectBalanceProfile('season-1-candidate-cc10');
  assert.ok(byId.ok);
  assert.equal(byId.profile, SEASON_1_CANDIDATE_CC10);
  const pinned = selectBalanceProfile(` season-1-candidate-cc10@${SEASON_1_CANDIDATE_CC10.version} `);
  assert.ok(pinned.ok);
  assert.equal(pinned.profile, SEASON_1_CANDIDATE_CC10);
  const shipped = selectBalanceProfile('season-1-shipped@1');
  assert.ok(shipped.ok);
  assert.equal(shipped.profile, SEASON_1_SHIPPED);

  const refusals: Array<[string, RegExp]> = [
    ['season-1-candidate-cc10@99', /is version 1, not 99/],
    ['season-9-nope', /No balance profile "season-9-nope"/],
    ['Season-1-Shipped', /is not "id" or "id@version"/],
    ['season-1-shipped@', /is not "id"/],
    ['season-1-shipped@v1', /is not "id"/],
    ['candidate; drop table', /is not "id"/],
  ];
  for (const [setting, pattern] of refusals) {
    const sel = selectBalanceProfile(setting);
    assert.equal(sel.ok, false, setting);
    if (!sel.ok) assert.match(sel.error, pattern, setting);
  }
  assert.equal(balanceProfileById('season-9-nope'), undefined);
  assert.equal(balanceProfileById(undefined), undefined);
});

/* -------------------------------------------------------------------------- */
/* The Worker: timers are priced at start and never move after                */
/* -------------------------------------------------------------------------- */

const T0 = Date.UTC(2026, 8, 14, 15, 0, 0);
const plenty = {fuel: 10_000_000, steel: 10_000_000, munitions: 10_000_000, alloy: 10_000_000};

function freshBase(stock = plenty) {
  const {db, raw} = migratedD1();
  raw
    .prepare(`INSERT INTO players (id, username, username_key, password_hash, created_at, last_seen_at) VALUES ('p1', 'Tester', 'tester', 'x', ?, ?)`)
    .run(T0, T0);
  raw
    .prepare(`INSERT INTO bases (player_id, name, fuel, steel, munitions, alloy, resources_at, created_at) VALUES ('p1', 'Base', ?, ?, ?, ?, ?, ?)`)
    .run(stock.fuel, stock.steel, stock.munitions, stock.alloy, T0, T0);
  return {db, raw};
}

const name = (b: string) => b;
const fast = defineBalanceProfile(
  sample({id: 'test-fast', timers: {...SHIPPED_BUILDING_MINUTES, commandCenter: [5, 5, 5, 5, 5, 5, 5, 5, 5]}}) as unknown as BalanceProfile,
);

test('worker: startLevel with no profile prices from the shipped tables', async () => {
  const {db} = freshBase();
  const res = await startLevel(db, 'p1', 'command_center', 1, T0, name);
  assert.ok(res.ok);
  if (!res.ok) return;
  assert.equal(res.base.jobs.length, 1);
  assert.equal(res.base.jobs[0].completesAt, T0 + 120 * MIN);
  assert.equal(res.base.resources.alloy, plenty.alloy - 750);
});

test('worker: a timer started under one profile is not moved by switching to another', async () => {
  const {db} = freshBase();
  const res = await startLevel(db, 'p1', 'command_center', 1, T0, name, SEASON_1_SHIPPED);
  assert.ok(res.ok);
  const completesAt = T0 + 120 * MIN;

  // The server now runs the fast profile: the running job must not restart, shorten or finish early.
  const again = await startLevel(db, 'p1', 'command_center', 1, T0 + 10 * MIN, name, fast);
  assert.equal(again.ok, false);
  const mid = await readBase(db, 'p1', T0 + 10 * MIN);
  assert.equal(mid.levels.command_center, 1);
  assert.deepEqual(mid.jobs.map((j) => j.completesAt), [completesAt]);
  const justBefore = await readBase(db, 'p1', completesAt - 1);
  assert.equal(justBefore.levels.command_center, 1);
  const at = await readBase(db, 'p1', completesAt);
  assert.equal(at.levels.command_center, 2);
  assert.deepEqual(at.jobs, []);

  // And the other way: a short timer keeps its instant after the long profile returns.
  const next = await startLevel(db, 'p1', 'command_center', 1, completesAt, name, fast);
  assert.ok(next.ok);
  const done = await readBase(db, 'p1', completesAt + 5 * MIN);
  assert.equal(done.levels.command_center, 3);
});

test('worker: the Engineer Yard still applies on top of the profile timer', async () => {
  const {db, raw} = freshBase();
  raw.prepare(`INSERT INTO base_levels (player_id, building, level) VALUES ('p1', 'engineer_support_yard', 4)`).run();
  const res = await startLevel(db, 'p1', 'command_center', 1, T0, name, SEASON_1_CANDIDATE_CC10);
  assert.ok(res.ok);
  if (!res.ok) return;
  const expected = Math.round(buildingStep('command_center', 2, SEASON_1_CANDIDATE_CC10).ms * engineerMultiplier(4));
  assert.equal(res.base.jobs[0].completesAt, T0 + expected);
});

test('worker: a candidate cost multiplier is what the debit takes, and a short stock is refused', async () => {
  const {db, raw} = freshBase();
  raw.prepare(`INSERT INTO base_levels (player_id, building, level) VALUES ('p1', 'command_center', 3), ('p1', 'quartermaster_warehouse', 2)`).run();
  const step = buildingStep('command_center', 4, SEASON_1_CANDIDATE_CC10);
  assert.ok(step.cost.alloy > buildingStep('command_center', 4).cost.alloy);
  const res = await startLevel(db, 'p1', 'command_center', 1, T0, name, SEASON_1_CANDIDATE_CC10);
  assert.ok(res.ok);
  if (!res.ok) return;
  assert.equal(res.base.resources.alloy, plenty.alloy - step.cost.alloy);

  // Exactly the shipped price in stock: enough under the default, short under the candidate.
  const shipped = buildingStep('command_center', 4).cost;
  const poor = freshBase(shipped);
  poor.raw.prepare(`INSERT INTO base_levels (player_id, building, level) VALUES ('p1', 'command_center', 3), ('p1', 'quartermaster_warehouse', 2)`).run();
  const refused = await startLevel(poor.db, 'p1', 'command_center', 1, T0, name, SEASON_1_CANDIDATE_CC10);
  assert.equal(refused.ok, false);
  const allowed = await startLevel(poor.db, 'p1', 'command_center', 1, T0, name);
  assert.ok(allowed.ok);
});
