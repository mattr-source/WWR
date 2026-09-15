/**
 * The Field Sandbox, Season 1 test slice: a single-player loop isolated
 * from accounts.
 *
 *   The sector map shows the day's Season 1 exercises (the real exercise
 *   types, picked by the real daily picker), a Dominion patrol and a mock
 *   rival base.
 *   -> choose which robot troops and Assets of the Task Force march
 *   -> a hold site pays its exercise reward after the hold; at a battle site
 *      the Task Force attacks and the fight resolves by itself: Victory or
 *      Defeat, with the casualties the rounds really caused
 *   -> the column marches home; damaged Assets come back slower
 *   -> spend supplies: a robot level installs one visible part and raises
 *      real stats; the Field Workshop repairs robots faster
 *   -> a damaged robot is repaired with supplies and time; a destroyed one
 *      is remanufactured with supplies and time and KEEPS its level and
 *      parts; a damaged Asset is repaired by the live game's own repair bill
 *   -> Daily Operations lanes and the four-lane Cache, from season1Ops
 *
 * TEST-ONLY BALANCE comes from a SandboxSeasonConfig (shared/sandboxSeason.ts)
 * and the constants marked below. None of it is read by the Worker, the live
 * base, payments or any account.
 *
 * Pure and deterministic: no randomness, no clock, no I/O.
 *
 *   - Timers are absolute instants, settled on read (`settle`).
 *   - Every action carries an id; an id already applied changes nothing.
 *   - A reward, a lane, a Cache, a battle or a destruction is recorded under
 *     a ledger key; the same key never counts again.
 *   - Kills here are TRAINING kills against NPCs, and the rival base is a
 *     mock. `confirmedPvpDestructions` is always 0 and nothing in this file
 *     can raise it.
 */
import {ASSETS, type Asset} from './assets';
import {HP_BASE, HP_PER_ARMOUR, HP_PER_POINT, HP_SCALE} from './combat';
import {EXERCISES, type ExerciseType, exerciseReward, hashSeed, pickDailyTypes, seeded} from './exercises';
import {marchHpFactor, repairBill} from './repair';
import {LANES_FOR_CACHE, LANE_COPY, type Lane, type Reward, cacheReward, laneReward} from './season1Ops';
import {
  PART_SLOTS,
  type PartSlot,
  ROBOT_ROLES,
  type RobotRole,
  SANDBOX_SEASON_1_TEST,
  SUPPLY_KINDS,
  type SandboxSeasonConfig,
  type Supplies,
  type SupplyKind,
} from './sandboxSeason';
import {NO_PACKAGES, attributesWith} from './upgrades';

export {SUPPLY_KINDS};
export type {Supplies, SupplyKind};

export const SANDBOX_SCHEMA = 2;
export const ROLES = ROBOT_ROLES;
export type Role = RobotRole;

const MIN = 60_000;
const SEC = 1000;
/** How long the Victory / Defeat result holds at the target before the column turns for home. */
export const RESULT_MS = 2600;

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type RobotStatus = 'ready' | 'disabled' | 'destroyed' | 'repairing' | 'remanufacturing' | 'upgrading';

export interface RobotJob {
  kind: 'repair' | 'remanufacture' | 'upgrade';
  startedAt: number;
  completesAt: number;
  /** Upgrade only: the level being reached. */
  toLevel: number | null;
  /** Paid in supplies (false = the slow emergency path). */
  paid: boolean;
}

export interface Robot {
  role: Role;
  /** A new serial for every remanufactured frame; level and parts carry over. */
  serial: number;
  level: number;
  hp: number;
  status: RobotStatus;
  job: RobotJob | null;
  sorties: number;
}

export type AssetStatus = 'ready' | 'disabled' | 'repairing';

/** A starter Asset in the Task Force. Assets are never destroyed: a disabled one is repaired (the live rule). */
export interface TaskAsset {
  assetId: string;
  hp: number;
  status: AssetStatus;
  job: {startedAt: number; completesAt: number; paid: boolean} | null;
  sorties: number;
}

/** One unit on the Task Force's side of a battle. */
export type UnitRef = {kind: 'robot'; role: Role} | {kind: 'asset'; assetId: string};

export type EnemyKind = 'crawler' | 'walker';

export interface Enemy {
  id: string;
  kind: EnemyKind;
  hp: number;
  maxHp: number;
}

/** What happened in a round, in engine order. The map animates exactly these. */
export type BattleEvent =
  | {t: 'heal'; to: UnitRef; amount: number; hpAfter: number}
  | {t: 'mark'; target: string}
  | {t: 'volley'; shooters: UnitRef[]; total: number}
  | {t: 'hit'; target: string; dmg: number; hpAfter: number; destroyed: boolean}
  | {t: 'enemyHit'; from: string; to: UnitRef; dmg: number; hpAfter: number; outcome: 'hit' | 'disabled' | 'destroyed'};

export interface UnitSnapshot {
  robots: Partial<Record<Role, {hp: number; status: RobotStatus}>>;
  assets: Record<string, {hp: number; status: AssetStatus}>;
}

/** A battle, resolved the moment the Task Force arrives and played out on the map. */
export interface Encounter {
  id: string;
  marchId: string;
  siteId: string;
  siteKind: SiteKind;
  wave: number;
  enemiesStart: Enemy[];
  enemies: Enemy[];
  rounds: BattleEvent[][];
  status: 'won' | 'lost';
  /** Lost by running out of rounds rather than by every robot troop going down. */
  withdrew: boolean;
  startsAt: number;
  endsAt: number;
  before: UnitSnapshot;
  after: UnitSnapshot;
  kills: number;
  xp: number;
  reward: Reward | null;
  /** Applied to the Task Force (at `endsAt`). */
  applied: boolean;
  /** The battle report has been read. */
  seen: boolean;
}

export type SiteKind = ExerciseType | 'patrol' | 'rival_base';

export interface Site {
  id: string;
  kind: SiteKind;
  day: number;
  /** Map position, 0-360 x 0-600. */
  x: number;
  y: number;
  battle: boolean;
}

export type MarchPhase = 'outbound' | 'engaged' | 'holding' | 'returning';

export interface March {
  id: string;
  siteId: string;
  robots: Role[];
  assets: string[];
  departAt: number;
  arriveAt: number;
  phase: MarchPhase;
  /** When a hold, or a battle's rounds and result, ends and the column turns home. */
  holdUntil: number | null;
  returnAt: number | null;
  outcome: 'won' | 'lost' | 'held' | 'recalled' | null;
}

export interface Install {
  role: Role;
  fromLevel: number;
  toLevel: number;
  slot: PartSlot;
  at: number;
}

export interface SandboxState {
  schema: typeof SANDBOX_SCHEMA;
  config: {id: string; version: number};
  createdAt: number;
  clockOffsetMs: number;
  tutorial: {step: number; completed: boolean};
  company: {name: string; xp: number};
  robots: Record<Role, Robot>;
  assets: TaskAsset[];
  nextSerial: number;
  supplies: Supplies;
  credits: number;
  workshop: {level: number; job: {toLevel: number; completesAt: number} | null};
  selectedSite: string | null;
  march: March | null;
  marchesLaunched: number;
  /** The latest battle (kept after the march so its report can be read). */
  encounter: Encounter | null;
  /** Site ids finished (won or held) - one reward each. */
  cleared: string[];
  /** The most recent finished install, for the ceremony. */
  lastInstall: Install | null;
  /** `lastInstall.at` of the install whose ceremony was watched or skipped, so a reload does not replay it. */
  seenInstallAt: number | null;
  stats: {
    trainingKills: number;
    battlesWon: number;
    battlesLost: number;
    patrolWins: number;
    exercisesDone: number;
    robotsDestroyed: number;
    confirmedPvpDestructions: 0;
  };
  ledger: string[];
  applied: string[];
}

export type SandboxAction =
  | {type: 'tutorial.next'}
  | {type: 'tutorial.skip'}
  | {type: 'site.select'; siteId: string | null}
  | {type: 'march.start'; siteId: string; robots: Role[]; assets: string[]}
  | {type: 'march.recall'}
  | {type: 'battle.seen'}
  | {type: 'robot.upgrade'; role: Role}
  | {type: 'robot.repair'; role: Role}
  | {type: 'robot.remanufacture'; role: Role}
  | {type: 'asset.repair'; assetId: string}
  | {type: 'workshop.start'}
  | {type: 'ops.cache'}
  | {type: 'clock.advance'; minutes: number}
  | {type: 'clock.nextDay'}
  | {type: 'install.seen'}
  | {type: 'test.supplies'}
  | {type: 'company.rename'; name: string};

export type ActionResult = {ok: true; state: SandboxState; note: string | null} | {ok: false; state: SandboxState; error: string};

/* -------------------------------------------------------------------------- */
/* Robots: parts and real stats                                               */
/* -------------------------------------------------------------------------- */

export const SLOT_LABEL: Record<PartSlot, string> = {
  head: 'Optic head',
  torso: 'Chest plating',
  legs: 'Leg actuators',
  arms: 'Arm servos',
  gear: 'Role gear',
};

/** The part slot a level installs: head, torso, legs, arms, gear, then round again. */
export function slotForLevel(level: number): PartSlot {
  return PART_SLOTS[(Math.max(2, Math.floor(level)) - 2) % PART_SLOTS.length];
}

/** How many times each slot has been replaced at a level (0 = the frame's original part). */
export function partsAt(level: number): Record<PartSlot, number> {
  const out = {head: 0, torso: 0, legs: 0, arms: 0, gear: 0} as Record<PartSlot, number>;
  for (let l = 2; l <= level; l += 1) out[slotForLevel(l)] += 1;
  return out;
}

/** The numbers combat really uses. There is deliberately no summary "power" figure. */
export interface RobotStats {
  maxHp: number;
  /** Shown as Firepower. */
  damage: number;
  /** Support only: HP patched onto a unit each round. */
  heal: number;
}

/** Real stats at a level: the base frame plus every part installed so far. */
export function robotStats(role: Role, level: number, config: SandboxSeasonConfig = SANDBOX_SEASON_1_TEST): RobotStats {
  const spec = config.roles[role];
  const parts = partsAt(Math.min(level, config.robotMaxLevel));
  let hpPct = 0;
  let dmgPct = 0;
  let heal = spec.baseHeal;
  for (const slot of PART_SLOTS) {
    const b = config.partBonus[slot];
    hpPct += b.hpPct * parts[slot];
    dmgPct += b.damagePct * parts[slot];
    if (spec.baseHeal > 0) heal += b.heal * parts[slot];
  }
  return {maxHp: Math.round(spec.baseHp * (1 + hpPct)), damage: Math.round(spec.baseDamage * (1 + dmgPct)), heal};
}

/**
 * A part's name: the slot and a mark number, "Optic head Mk 1" for the frame's
 * original part, Mk 2 after its first replacement. Neutral on purpose - no
 * tier or rarity ladder is approved.
 */
export function partName(role: Role, slot: PartSlot, tier: number, config: SandboxSeasonConfig = SANDBOX_SEASON_1_TEST): string {
  const name = slot === 'gear' ? config.roles[role].gearName : SLOT_LABEL[slot];
  return `${name} Mk ${Math.max(0, Math.floor(tier)) + 1}`;
}

/** What the next level installs and what it really changes. Null at the cap. */
export function nextInstall(robot: Robot, config: SandboxSeasonConfig = SANDBOX_SEASON_1_TEST) {
  if (robot.level >= config.robotMaxLevel) return null;
  const toLevel = robot.level + 1;
  const slot = slotForLevel(toLevel);
  const tier = partsAt(toLevel)[slot];
  return {
    toLevel,
    slot,
    fromPart: partName(robot.role, slot, tier - 1, config),
    toPart: partName(robot.role, slot, tier, config),
    before: robotStats(robot.role, robot.level, config),
    after: robotStats(robot.role, toLevel, config),
    cost: config.upgradeCost[toLevel],
    minutes: config.upgradeMinutes[toLevel],
  };
}

/* -------------------------------------------------------------------------- */
/* Assets: real catalogue, real HP formula, real repair bill                  */
/* -------------------------------------------------------------------------- */

const ASSET_BY_ID = new Map(ASSETS.map((a) => [a.id, a]));
/** Assets in the sandbox are at Service Rank 1 with no packages: the starter hangar. */
export const SANDBOX_ASSET_RANK = 1;

export function assetOf(assetId: string): Asset | null {
  return ASSET_BY_ID.get(assetId) ?? null;
}

/**
 * An Asset's sandbox numbers. HP is the live combat formula (shared/combat.ts)
 * at rank 1 before position and drone modifiers; its volley share is its real
 * firepower attribute times the config's TEST scale.
 */
export function assetStats(assetId: string, config: SandboxSeasonConfig = SANDBOX_SEASON_1_TEST): {maxHp: number; firepower: number; volley: number} {
  const asset = assetOf(assetId);
  if (!asset) return {maxHp: 1, firepower: 0, volley: 0};
  const a = attributesWith(asset, SANDBOX_ASSET_RANK, NO_PACKAGES, 1);
  return {maxHp: Math.round(HP_SCALE * (HP_BASE + HP_PER_POINT * a.firepower + HP_PER_ARMOUR * a.armour)), firepower: a.firepower, volley: Math.round(a.firepower * config.assetFirepowerScale)};
}

/** The live game's repair bill for a damaged Asset (shared/repair.ts), at rank 1. */
export function assetRepairQuote(a: TaskAsset, config: SandboxSeasonConfig = SANDBOX_SEASON_1_TEST): {cost: Supplies; minutes: number} {
  const asset = assetOf(a.assetId);
  if (!asset) return {cost: {fuel: 0, steel: 0, munitions: 0, alloy: 0}, minutes: 0};
  const bill = repairBill(asset, SANDBOX_ASSET_RANK, NO_PACKAGES, 1, a.hp / assetStats(a.assetId, config).maxHp);
  return {cost: {fuel: bill.fuel, steel: bill.steel, munitions: bill.munitions, alloy: bill.alloy}, minutes: bill.ms / MIN};
}

export const isDrone = (assetId: string) => assetOf(assetId)?.category === 'drone';

/* -------------------------------------------------------------------------- */
/* Enemies, rewards, company (TEST-ONLY constants)                            */
/* -------------------------------------------------------------------------- */

export const ENEMY_SPEC: Record<EnemyKind, {label: string; maxHp: number; damage: number}> = {
  crawler: {label: 'Dominion Crawler', maxHp: 40, damage: 22},
  walker: {label: 'Dominion Walker', maxHp: 100, damage: 30},
};
export const WAVE_GROWTH = 0.08;
export const SCOUT_MARK_BONUS = 0.25;
export const OVERKILL_SHARE = 0.3;
export const COMPANY_DAMAGE_PER_LEVEL = 0.05;
export const XP_PER_KILL = 10;
export const XP_PER_WIN = 25;

export function companyLevel(xp: number): {level: number; into: number; need: number} {
  let level = 1;
  let floor = 0;
  let need = 100;
  while (xp >= floor + need) {
    floor += need;
    level += 1;
    need += 50;
  }
  return {level, into: xp - floor, need};
}

/** Patrol reward, test-only. Exercise rewards are the real Season 1 table. */
export function patrolReward(wave: number): Reward {
  const m = 1 + 0.25 * (Math.max(1, wave) - 1);
  return {credits: Math.round(30 * m), fuel: Math.round(420 * m), steel: Math.round(520 * m), munitions: Math.round(240 * m), alloy: Math.round(280 * m)};
}

function enemiesFor(kinds: EnemyKind[], strength: number, prefix: string): Enemy[] {
  const scale = 1 + WAVE_GROWTH * (Math.max(1, strength) - 1);
  return kinds.map((kind, i) => {
    const maxHp = Math.round(ENEMY_SPEC[kind].maxHp * scale);
    return {id: `${prefix}-e${i + 1}`, kind, hp: maxHp, maxHp};
  });
}

/** The patrol of wave N: three Crawlers first, a Walker from wave 2, a fourth robot from wave 6. */
export function patrolKinds(wave: number): EnemyKind[] {
  return wave <= 1 ? ['crawler', 'crawler', 'crawler'] : ['crawler', 'walker', 'crawler', ...(wave >= 6 ? (['crawler'] as EnemyKind[]) : [])];
}

/** Battle exercises: which Dominion robots guard them (test-only composition). */
export function exerciseKinds(kind: ExerciseType): EnemyKind[] {
  return kind === 'disabled_mech_patrol' ? ['walker', 'crawler'] : ['crawler', 'crawler'];
}

/** The mock rival base's defenders (test-only). */
export const RIVAL_BASE_KINDS: EnemyKind[] = ['walker', 'crawler', 'crawler', 'crawler'];

export const FIELD_WORKSHOP_STEPS: ReadonlyArray<{cost: Supplies; minutes: number} | null> = [
  null,
  null,
  {cost: {fuel: 400, steel: 500, munitions: 200, alloy: 250}, minutes: 3},
  {cost: {fuel: 900, steel: 1100, munitions: 450, alloy: 600}, minutes: 10},
  {cost: {fuel: 1800, steel: 2200, munitions: 900, alloy: 1200}, minutes: 30},
];
export const WORKSHOP_MAX_LEVEL = FIELD_WORKSHOP_STEPS.length - 1;
const clampWorkshop = (level: number) => Math.max(1, Math.min(WORKSHOP_MAX_LEVEL, Math.floor(level)));
export function workshopArmour(level: number): number {
  return 1 - 0.06 * (clampWorkshop(level) - 1);
}
export function workshopRepairFactor(level: number): number {
  return 1 - 0.15 * (clampWorkshop(level) - 1);
}

/* -------------------------------------------------------------------------- */
/* The sector: day, week, sites                                               */
/* -------------------------------------------------------------------------- */

/** Where things stand on the 360 x 600 sector map. */
export const BASE_AT = {x: 180, y: 520};
const SITE_SLOTS = [
  {x: 78, y: 318},
  {x: 290, y: 262},
  {x: 170, y: 176},
];
export const PATROL_AT = {x: 280, y: 410};
export const RIVAL_BASE_AT = {x: 66, y: 110};

export function sandboxDay(state: SandboxState, now: number, config: SandboxSeasonConfig = SANDBOX_SEASON_1_TEST): number {
  return Math.max(0, Math.floor((now - state.createdAt) / config.dayMs));
}

export function sandboxWeek(day: number, config: SandboxSeasonConfig = SANDBOX_SEASON_1_TEST): number {
  return Math.min(config.weeks, Math.floor(day / 7) + 1);
}

/** Today's sites: the real daily exercise picker, seeded by this sandbox and day, plus the patrol and the mock rival base. */
export function sitesFor(state: SandboxState, day: number, config: SandboxSeasonConfig = SANDBOX_SEASON_1_TEST): Site[] {
  const types = pickDailyTypes(seeded(hashSeed(`sandbox:${state.createdAt}:${day}`)), true).slice(0, config.exercisesPerDay);
  const sites: Site[] = types.map((kind, i) => ({id: `d${day}-${kind}`, kind, day, ...SITE_SLOTS[i], battle: EXERCISES[kind].kind === 'battle'}));
  sites.push({id: `d${day}-patrol-${state.stats.patrolWins + 1}`, kind: 'patrol', day, ...PATROL_AT, battle: true});
  sites.push({id: `d${day}-rival_base`, kind: 'rival_base', day, ...RIVAL_BASE_AT, battle: true});
  return sites;
}

export function siteLabel(kind: SiteKind): string {
  return kind === 'patrol' ? 'Dominion Patrol' : kind === 'rival_base' ? 'Mock Rival Base' : EXERCISES[kind].name;
}

/** What a site pays when it is won or held. The mock rival base pays nothing: base-attack loot is not decided. */
export function siteReward(site: Site, state: SandboxState, config: SandboxSeasonConfig = SANDBOX_SEASON_1_TEST): Reward | null {
  if (site.kind === 'rival_base') return null;
  return site.kind === 'patrol' ? patrolReward(state.stats.patrolWins + 1) : exerciseReward(site.kind, sandboxWeek(site.day, config));
}

export function marchSeconds(site: {x: number; y: number}, config: SandboxSeasonConfig = SANDBOX_SEASON_1_TEST): number {
  const d = Math.hypot(site.x - BASE_AT.x, site.y - BASE_AT.y);
  return Math.round(config.marchBaseSeconds + d * config.marchSecondsPerUnit);
}

/** The strength a site's enemies fight at (patrols grow per win, exercises per season week). */
export function siteStrength(site: Site, state: SandboxState, config: SandboxSeasonConfig = SANDBOX_SEASON_1_TEST): number {
  if (site.kind === 'patrol') return state.stats.patrolWins + 1;
  if (site.kind === 'rival_base') return state.stats.patrolWins + 2;
  return sandboxWeek(site.day, config) + 1;
}

/** Enemy line-up a battle site will have, for the target card (the same function the engine uses). */
export function siteEnemies(site: Site, state: SandboxState, config: SandboxSeasonConfig = SANDBOX_SEASON_1_TEST): Enemy[] {
  if (!site.battle) return [];
  const strength = siteStrength(site, state, config);
  const kinds = site.kind === 'patrol' ? patrolKinds(strength) : site.kind === 'rival_base' ? RIVAL_BASE_KINDS : exerciseKinds(site.kind as ExerciseType);
  return enemiesFor(kinds, strength, site.id);
}

/** The plain sums a target card compares: HP and per-round firepower on each side. No invented rating. */
export function forceTotals(s: SandboxState, robots: Role[], assets: string[], config: SandboxSeasonConfig = SANDBOX_SEASON_1_TEST): {hp: number; firepower: number} {
  let hp = 0;
  let firepower = 0;
  for (const r of robots) {
    hp += Math.max(0, s.robots[r].hp);
    firepower += robotStats(r, s.robots[r].level, config).damage;
  }
  for (const id of assets) {
    const a = s.assets.find((x) => x.assetId === id);
    if (!a) continue;
    hp += Math.max(0, a.hp);
    firepower += assetStats(id, config).volley;
  }
  return {hp, firepower};
}
export function enemyTotals(enemies: Enemy[], strength: number): {hp: number; firepower: number} {
  const scale = 1 + WAVE_GROWTH * (Math.max(1, strength) - 1);
  return enemies.reduce((sum, e) => ({hp: sum.hp + e.hp, firepower: sum.firepower + Math.round(ENEMY_SPEC[e.kind].damage * scale)}), {hp: 0, firepower: 0});
}

/* -------------------------------------------------------------------------- */
/* Daily Operations (the real lanes; sandbox triggers)                        */
/* -------------------------------------------------------------------------- */

/** What completes each lane in the sandbox. Cooperation needs an alliance, which the sandbox has not. */
export const SANDBOX_LANE_TRIGGER: Record<Lane, string | null> = {
  command: 'Start a Field Workshop upgrade',
  industry: 'Bring back a reward (sandbox stand-in for an hour of production)',
  mobilization: LANE_COPY.mobilization.task,
  engagement: LANE_COPY.engagement.task,
  readiness: 'Upgrade, repair or remanufacture with supplies (the free slow path does not count)',
  cooperation: null,
};

export function lanesDone(state: SandboxState, day: number): Lane[] {
  const prefix = `lane:${day}:`;
  return state.ledger.filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length) as Lane);
}

export interface SeasonObjective {
  id: 'exercises' | 'patrol' | 'lanes' | 'cache';
  label: string;
  detail: string;
  progress: number;
  target: number;
  done: boolean;
}

/**
 * Today's Season 1 objectives, read straight from state. They add no reward
 * of their own: each one points at something that already pays (the real
 * exercise, lane and Cache tables, or the test patrol reward).
 */
export function seasonObjectives(state: SandboxState, now: number, config: SandboxSeasonConfig = SANDBOX_SEASON_1_TEST): SeasonObjective[] {
  const day = sandboxDay(state, now, config);
  const prefix = `d${day}-`;
  const today = state.cleared.filter((id) => id.startsWith(prefix));
  const exercises = today.filter((id) => !id.includes('-patrol-') && !id.endsWith('-rival_base')).length;
  const patrols = today.filter((id) => id.includes('-patrol-')).length;
  const lanes = Math.min(LANES_FOR_CACHE, lanesDone(state, day).length);
  const cache = state.ledger.includes(`cache:${day}`) ? 1 : 0;
  return [
    {id: 'exercises', label: "Clear today's exercises", detail: 'The real Season 1 exercise types and reward table, picked by the real daily picker.', progress: exercises, target: config.exercisesPerDay, done: exercises >= config.exercisesPerDay},
    {id: 'patrol', label: 'Beat a Dominion Patrol', detail: 'Patrols get stronger after every win. Test-only enemies and reward.', progress: Math.min(1, patrols), target: 1, done: patrols >= 1},
    {id: 'lanes', label: 'Complete Daily Operations lanes', detail: `${LANES_FOR_CACHE} of the six lanes unlock the Cache (Season 1 rule).`, progress: lanes, target: LANES_FOR_CACHE, done: lanes >= LANES_FOR_CACHE},
    {id: 'cache', label: 'Claim the Daily Operations Cache', detail: 'Once per sandbox day, the real Season 1 Cache reward for this week.', progress: cache, target: 1, done: cache === 1},
  ];
}

/* -------------------------------------------------------------------------- */
/* Tutorial                                                                   */
/* -------------------------------------------------------------------------- */

export type TutorialEvent = 'next' | 'site.select' | 'march.start' | 'march.arrive' | 'battle.seen' | 'march.home' | 'robot.upgrade' | 'upgrade.done' | 'recover' | 'ops.cache' | 'finish';

export interface TutorialStep {
  say: string;
  objective: string;
  advance: TutorialEvent;
}

export const TUTORIAL: readonly TutorialStep[] = [
  {say: 'Commander, General Rider. This is a practice test of {season}. Nothing here touches your real base, wallet or record.', objective: 'Read the briefing.', advance: 'next'},
  {say: 'Your Task Force: three starter Assets - an Abrams, a Hind and a Global Hawk drone - and three humanoid robot troops. The robots start as salvage; every level fits a new part.', objective: 'Meet your Task Force.', advance: 'next'},
  {say: 'Dominion Crawlers are loose on the flats. Tap the Dominion Patrol on the map.', objective: 'Select the Dominion Patrol.', advance: 'site.select'},
  {say: 'Check the forces, pick who goes - a Task Force always takes its drone - and march.', objective: 'March on the patrol.', advance: 'march.start'},
  {say: 'The Task Force is on the move. Wait for contact, or use the test skip.', objective: 'Reach the target.', advance: 'march.arrive'},
  {say: 'Contact. Your Task Force attacks on its own. Watch the fight, then read the battle report.', objective: 'Read the battle report.', advance: 'battle.seen'},
  {say: 'They are heading home. Damaged Assets drive slower, and anything damaged is repaired at base.', objective: 'Bring the Task Force home.', advance: 'march.home'},
  {say: 'Open the Robot Bay. Every level installs a new part and shows exactly what it improves.', objective: 'Upgrade a robot to level 2.', advance: 'robot.upgrade'},
  {say: 'The bay is fitting the part. Wait, or use the test skip, then watch the install.', objective: 'Finish the upgrade.', advance: 'upgrade.done'},
  {say: 'Damaged robots and Assets are repaired with supplies and time. A destroyed robot is remanufactured and keeps its level and parts.', objective: 'Repair something damaged.', advance: 'recover'},
  {say: 'Four Daily Operations lanes done: open Operations and claim the Cache.', objective: 'Claim the Daily Operations Cache.', advance: 'ops.cache'},
  {say: "Task Force ready. Run the day's exercises; the test clock starts a new day with new ones.", objective: "Clear today's exercises.", advance: 'finish'},
];

/** A tutorial line with the season's real name filled in from the config. */
export function tutorialSay(step: TutorialStep, config: SandboxSeasonConfig = SANDBOX_SEASON_1_TEST): string {
  return step.say.replace('{season}', config.seasonName);
}

/* -------------------------------------------------------------------------- */
/* Creation, reading a save                                                   */
/* -------------------------------------------------------------------------- */

function newRobot(role: Role, serial: number, config: SandboxSeasonConfig): Robot {
  return {role, serial, level: 1, hp: robotStats(role, 1, config).maxHp, status: 'ready', job: null, sorties: 0};
}

export function createSandbox(now: number, config: SandboxSeasonConfig = SANDBOX_SEASON_1_TEST): SandboxState {
  return {
    schema: SANDBOX_SCHEMA,
    config: {id: config.id, version: config.version},
    createdAt: now,
    clockOffsetMs: 0,
    tutorial: {step: 0, completed: false},
    company: {name: '1st Iron Task Force', xp: 0},
    robots: {scout: newRobot('scout', 1, config), assault: newRobot('assault', 2, config), support: newRobot('support', 3, config)},
    assets: config.taskForceAssets.map((assetId) => ({assetId, hp: assetStats(assetId, config).maxHp, status: 'ready', job: null, sorties: 0})),
    nextSerial: 4,
    supplies: {...config.startSupplies},
    credits: config.startCredits,
    workshop: {level: 1, job: null},
    selectedSite: null,
    march: null,
    marchesLaunched: 0,
    encounter: null,
    cleared: [],
    lastInstall: null,
    seenInstallAt: null,
    stats: {trainingKills: 0, battlesWon: 0, battlesLost: 0, patrolWins: 0, exercisesDone: 0, robotsDestroyed: 0, confirmedPvpDestructions: 0},
    ledger: [],
    applied: [],
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const nullOrNum = (v: unknown) => v === null || isNum(v);
const STATUSES: readonly RobotStatus[] = ['ready', 'disabled', 'destroyed', 'repairing', 'remanufacturing', 'upgrading'];
const ASSET_STATUSES: readonly AssetStatus[] = ['ready', 'disabled', 'repairing'];
const PHASES: readonly MarchPhase[] = ['outbound', 'engaged', 'holding', 'returning'];

export type SandboxRejection = 'empty' | 'schema' | 'config' | 'invalid';

/**
 * Read a stored sandbox. A save from an older state format or another season
 * config is refused with a reason the screen can say out loud; a save from
 * the same config at another tuning `version` is KEPT - tuning is re-read
 * from the config, and a robot above a lowered test cap is held at the cap.
 */
export function readSandbox(raw: unknown, config: SandboxSeasonConfig = SANDBOX_SEASON_1_TEST): {state: SandboxState | null; rejected: SandboxRejection | null} {
  const no = (rejected: SandboxRejection) => ({state: null, rejected});
  if (raw === null || raw === undefined) return no('empty');
  if (!isObj(raw)) return no('invalid');
  if (raw.schema !== SANDBOX_SCHEMA) return no('schema');
  const s = raw as unknown as SandboxState;
  if (!isObj(s.config) || s.config.id !== config.id) return no('config');
  if (!isNum(s.createdAt) || !isNum(s.clockOffsetMs) || s.clockOffsetMs < 0) return no('invalid');
  if (!isObj(s.tutorial) || !Number.isInteger(s.tutorial.step) || s.tutorial.step < 0 || s.tutorial.step >= TUTORIAL.length || typeof s.tutorial.completed !== 'boolean') return no('invalid');
  if (!isObj(s.company) || typeof s.company.name !== 'string' || !isNum(s.company.xp) || s.company.xp < 0) return no('invalid');
  if (!isObj(s.robots) || !Number.isInteger(s.nextSerial)) return no('invalid');
  const robots = {} as Record<Role, Robot>;
  for (const role of ROLES) {
    const r = s.robots[role];
    if (!isObj(r) || r.role !== role || !isNum(r.hp) || r.hp < 0 || !Number.isInteger(r.level) || r.level < 1 || !STATUSES.includes(r.status) || !Number.isInteger(r.serial) || !isNum(r.sorties)) return no('invalid');
    if (r.job !== null && (!isObj(r.job) || !['repair', 'remanufacture', 'upgrade'].includes(r.job.kind) || !isNum(r.job.completesAt) || !isNum(r.job.startedAt) || !nullOrNum(r.job.toLevel))) return no('invalid');
    const level = Math.min(r.level, config.robotMaxLevel);
    const job = r.job && r.job.kind === 'upgrade' && (r.job.toLevel ?? 0) > config.robotMaxLevel ? null : r.job;
    const max = robotStats(role, level, config).maxHp;
    robots[role] = {...r, level, job, status: !job && r.status === 'upgrading' ? 'ready' : r.status, hp: Math.min(r.hp, max)};
  }
  if (!Array.isArray(s.assets)) return no('invalid');
  for (const a of s.assets) {
    if (!isObj(a) || typeof a.assetId !== 'string' || !isNum(a.hp) || a.hp < 0 || !ASSET_STATUSES.includes(a.status) || !isNum(a.sorties)) return no('invalid');
    if (a.job !== null && !(isObj(a.job) && isNum(a.job.completesAt) && isNum(a.job.startedAt))) return no('invalid');
  }
  // The Task Force's Assets follow the config; one it no longer lists is dropped, a new one joins fresh.
  const assets: TaskAsset[] = config.taskForceAssets.map((assetId) => {
    const kept = s.assets.find((a) => a.assetId === assetId);
    const max = assetStats(assetId, config).maxHp;
    return kept ? {...kept, hp: Math.min(kept.hp, max)} : {assetId, hp: max, status: 'ready', job: null, sorties: 0};
  });
  if (!isObj(s.supplies) || !SUPPLY_KINDS.every((k) => isNum(s.supplies[k]) && s.supplies[k] >= 0) || !isNum(s.credits) || s.credits < 0) return no('invalid');
  if (!isObj(s.workshop) || !Number.isInteger(s.workshop.level) || (s.workshop.job !== null && !(isObj(s.workshop.job) && isNum(s.workshop.job.completesAt) && Number.isInteger(s.workshop.job.toLevel)))) return no('invalid');
  if (!isObj(s.stats) || s.stats.confirmedPvpDestructions !== 0 || !isNum(s.stats.trainingKills)) return no('invalid');
  if (!Array.isArray(s.ledger) || !Array.isArray(s.applied) || !Array.isArray(s.cleared) || !Number.isInteger(s.marchesLaunched)) return no('invalid');
  if (s.selectedSite !== null && typeof s.selectedSite !== 'string') return no('invalid');
  const m = s.march;
  if (m !== null && (!isObj(m) || typeof m.id !== 'string' || typeof m.siteId !== 'string' || !Array.isArray(m.robots) || !m.robots.every((x) => (ROLES as readonly string[]).includes(x)) || !Array.isArray(m.assets) || !PHASES.includes(m.phase) || !isNum(m.departAt) || !isNum(m.arriveAt) || !nullOrNum(m.holdUntil) || !nullOrNum(m.returnAt))) return no('invalid');
  const e = s.encounter;
  if (e !== null && (!isObj(e) || typeof e.id !== 'string' || !Array.isArray(e.enemies) || !Array.isArray(e.enemiesStart) || !Array.isArray(e.rounds) || !['won', 'lost'].includes(e.status) || !isNum(e.startsAt) || !isNum(e.endsAt) || !isObj(e.before) || !isObj(e.after) || typeof e.applied !== 'boolean' || typeof e.seen !== 'boolean')) return no('invalid');
  if (s.lastInstall !== null && !(isObj(s.lastInstall) && isNum(s.lastInstall.at) && (ROLES as readonly string[]).includes(s.lastInstall.role))) return no('invalid');
  if (!nullOrNum(s.seenInstallAt)) return no('invalid');
  return {state: {...s, robots, assets, config: {id: config.id, version: config.version}}, rejected: null};
}

/** A stored sandbox this build can trust, or null. */
export function parseSandbox(raw: unknown, config: SandboxSeasonConfig = SANDBOX_SEASON_1_TEST): SandboxState | null {
  return readSandbox(raw, config).state;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const canPay = (have: Supplies, cost: Supplies) => SUPPLY_KINDS.every((k) => have[k] >= cost[k]);
const pay = (have: Supplies, cost: Supplies): Supplies => {
  const out = {...have};
  for (const k of SUPPLY_KINDS) out[k] -= cost[k];
  return out;
};
const scaled = (cost: Supplies, by: number): Supplies => {
  const out = {...cost};
  for (const k of SUPPLY_KINDS) out[k] = Math.ceil(cost[k] * by);
  return out;
};

const cap = (k: string) => `${k[0].toUpperCase()}${k.slice(1)}`;

function shortLine(have: Supplies, cost: Supplies, credits = 0, need = 0): string {
  const k = SUPPLY_KINDS.find((x) => have[x] < cost[x]);
  if (k) return `Need ${cost[k] - have[k]} more ${cap(k)}. Run exercises or patrols for supplies.`;
  if (credits < need) return `Need ${need - credits} more test Credits.`;
  return 'Not enough supplies.';
}

export function describeReward(r: Reward): string {
  const parts: string[] = [];
  for (const k of SUPPLY_KINDS) if (r[k]) parts.push(`${r[k]} ${cap(k)}`);
  if (r.credits) parts.push(`${r.credits} test Credits`);
  return parts.join(', ') || 'nothing';
}

export function unitLabel(u: UnitRef, config: SandboxSeasonConfig = SANDBOX_SEASON_1_TEST): string {
  return u.kind === 'robot' ? config.roles[u.role].label : (assetOf(u.assetId)?.name ?? u.assetId);
}

/** One battle event as a line for the combat log. */
export function describeEvent(ev: BattleEvent, enemies: Enemy[], config: SandboxSeasonConfig = SANDBOX_SEASON_1_TEST): string {
  const enemy = (id: string) => ENEMY_SPEC[enemies.find((x) => x.id === id)?.kind ?? 'crawler'].label;
  switch (ev.t) {
    case 'heal':
      return `Support patches ${unitLabel(ev.to, config)} (+${ev.amount}).`;
    case 'mark':
      return `Scout marks a ${enemy(ev.target)}.`;
    case 'volley':
      return `Task Force volley: ${ev.total}.`;
    case 'hit':
      return `${enemy(ev.target)} takes ${ev.dmg}${ev.destroyed ? ': destroyed' : ''}.`;
    case 'enemyHit':
      return `${enemy(ev.from)} hits ${unitLabel(ev.to, config)} for ${ev.dmg}${ev.outcome === 'hit' ? '' : ev.outcome === 'disabled' ? ': disabled' : ': DESTROYED'}.`;
  }
}

function grant(s: SandboxState, key: string, r: Reward): SandboxState {
  if (s.ledger.includes(key)) return s;
  const supplies = {...s.supplies};
  for (const k of SUPPLY_KINDS) supplies[k] += r[k];
  return {...s, supplies, credits: s.credits + r.credits, ledger: [...s.ledger, key]};
}

/** Complete a Daily Operations lane once per day, paying its real reward. `at` is when it happened, so a timer settled late still counts on its own day. */
function lane(s: SandboxState, laneId: Lane, at: number, config: SandboxSeasonConfig): SandboxState {
  if (SANDBOX_LANE_TRIGGER[laneId] === null) return s;
  const day = sandboxDay(s, at, config);
  return grant(s, `lane:${day}:${laneId}`, laneReward(laneId, sandboxWeek(day, config)));
}

export function sandboxNow(state: SandboxState, realNow: number): number {
  return realNow + state.clockOffsetMs;
}

export const repairQuote = (robot: Robot, workshopLevel: number, config: SandboxSeasonConfig = SANDBOX_SEASON_1_TEST) => {
  const max = robotStats(robot.role, robot.level, config).maxHp;
  const share = Math.max(0, Math.min(1, (max - robot.hp) / max));
  const levelFactor = 1 + 0.1 * (robot.level - 1);
  return {
    cost: scaled(config.repairCost, share * levelFactor),
    minutes: Math.max(0.25, config.repairMinutes * share * workshopRepairFactor(workshopLevel)),
  };
};

export const remanufactureQuote = (robot: Robot, workshopLevel: number, config: SandboxSeasonConfig = SANDBOX_SEASON_1_TEST) => ({
  cost: scaled(config.remanufactureCost, 1 + 0.25 * (robot.level - 1)),
  minutes: (config.remanufactureMinutes + robot.level) * workshopRepairFactor(workshopLevel),
});

export function robotNeedsRepair(robot: Robot, config: SandboxSeasonConfig = SANDBOX_SEASON_1_TEST): boolean {
  return robot.status === 'disabled' || (robot.status === 'ready' && robot.hp < robotStats(robot.role, robot.level, config).maxHp);
}
export function assetNeedsRepair(a: TaskAsset, config: SandboxSeasonConfig = SANDBOX_SEASON_1_TEST): boolean {
  return a.status === 'disabled' || (a.status === 'ready' && a.hp < assetStats(a.assetId, config).maxHp);
}

/* -------------------------------------------------------------------------- */
/* Tutorial plumbing                                                          */
/* -------------------------------------------------------------------------- */

const APPLIED_KEEP = 200;
/** Test control only: what one "grant test supplies" tap adds. Not a reward, never a real balance. */
export const TEST_SUPPLY_GRANT = 5000;
export const TEST_CREDIT_GRANT = 500;

function advanceTutorial(s: SandboxState): SandboxState {
  const step = s.tutorial.step + 1;
  return {...s, tutorial: {step: Math.min(step, TUTORIAL.length - 1), completed: step >= TUTORIAL.length - 1}};
}

/** A lost or abandoned tutorial fight sends the walkthrough back to choosing the target. */
function tutorialBack(s: SandboxState): SandboxState {
  if (s.tutorial.completed) return s;
  const select = TUTORIAL.findIndex((t) => t.advance === 'site.select');
  const seen = TUTORIAL.findIndex((t) => t.advance === 'battle.seen');
  return s.tutorial.step > select && s.tutorial.step <= seen ? {...s, tutorial: {step: select, completed: false}} : s;
}

function tutorialOn(s: SandboxState, event: TutorialEvent, now: number, config: SandboxSeasonConfig): SandboxState {
  if (s.tutorial.completed) return s;
  let next = TUTORIAL[s.tutorial.step]?.advance === event ? advanceTutorial(s) : s;
  // Objectives that cannot be done right now must not block the walkthrough.
  for (let guard = 0; guard < 3 && !next.tutorial.completed; guard += 1) {
    const want = TUTORIAL[next.tutorial.step]?.advance;
    const damaged = ROLES.some((r) => ['disabled', 'destroyed', 'repairing', 'remanufacturing'].includes(next.robots[r].status) || robotNeedsRepair(next.robots[r], config)) || next.assets.some((a) => a.status !== 'ready' || assetNeedsRepair(a, config));
    if (want === 'recover' && !damaged) next = advanceTutorial(next);
    else if (want === 'ops.cache' && next.ledger.includes(`cache:${sandboxDay(next, now, config)}`)) next = advanceTutorial(next);
    else break;
  }
  return next;
}

/* -------------------------------------------------------------------------- */
/* Battle                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Fight a battle to its end, deterministically. Robot troops and Assets fire
 * together; Crawlers go for the lightest robot troop, Walkers for the heaviest
 * Asset. A robot hit well past zero is destroyed, otherwise disabled; an Asset
 * is only ever disabled. The battle is lost when every robot troop in it is
 * down, or after the round cap (the Task Force withdraws).
 */
export function resolveBattle(s: SandboxState, m: March, site: Site, config: SandboxSeasonConfig = SANDBOX_SEASON_1_TEST): Encounter {
  const strength = siteStrength(site, s, config);
  const enemiesStart = siteEnemies(site, s, config);
  let enemies = enemiesStart.map((x) => ({...x}));
  const robotHp: Partial<Record<Role, {hp: number; status: RobotStatus}>> = {};
  for (const r of m.robots) robotHp[r] = {hp: s.robots[r].hp, status: s.robots[r].status};
  const assetHp: Record<string, {hp: number; status: AssetStatus}> = {};
  for (const id of m.assets) {
    const a = s.assets.find((x) => x.assetId === id)!;
    assetHp[id] = {hp: a.hp, status: a.status};
  }
  const before: UnitSnapshot = {robots: {...robotHp}, assets: {...assetHp}};
  const level = (r: Role) => s.robots[r].level;
  const veteran = 1 + COMPANY_DAMAGE_PER_LEVEL * (companyLevel(s.company.xp).level - 1);
  const armour = workshopArmour(s.workshop.level);
  const rounds: BattleEvent[][] = [];
  const killed = new Set<string>();
  let status: 'active' | 'won' | 'lost' = 'active';

  const readyRobots = () => m.robots.filter((r) => robotHp[r]!.status === 'ready' && robotHp[r]!.hp > 0);
  const readyAssets = () => m.assets.filter((id) => assetHp[id].status === 'ready' && assetHp[id].hp > 0);
  const alive = () => enemies.filter((x) => x.hp > 0);

  while (status === 'active' && rounds.length < config.battleRoundCap) {
    const ev: BattleEvent[] = [];
    // 1. Support patches the most damaged unit still fighting.
    if (readyRobots().includes('support')) {
      const heal = robotStats('support', level('support'), config).heal;
      const hurt = [
        ...readyRobots().map((r) => ({ref: {kind: 'robot', role: r} as UnitRef, share: robotHp[r]!.hp / robotStats(r, level(r), config).maxHp})),
        ...readyAssets().map((id) => ({ref: {kind: 'asset', assetId: id} as UnitRef, share: assetHp[id].hp / assetStats(id, config).maxHp})),
      ]
        .filter((x) => x.share < 1)
        .sort((a, b) => a.share - b.share);
      const target = hurt[0]?.ref;
      if (target && heal > 0) {
        if (target.kind === 'robot') {
          const hp = Math.min(robotStats(target.role, level(target.role), config).maxHp, robotHp[target.role]!.hp + heal);
          ev.push({t: 'heal', to: target, amount: hp - robotHp[target.role]!.hp, hpAfter: hp});
          robotHp[target.role] = {...robotHp[target.role]!, hp};
        } else {
          const hp = Math.min(assetStats(target.assetId, config).maxHp, assetHp[target.assetId].hp + heal);
          ev.push({t: 'heal', to: target, amount: hp - assetHp[target.assetId].hp, hpAfter: hp});
          assetHp[target.assetId] = {...assetHp[target.assetId], hp};
        }
      }
    }
    // 2. The volley: every robot troop and Asset still fighting.
    const shooters: UnitRef[] = [...readyRobots().map((role): UnitRef => ({kind: 'robot', role})), ...readyAssets().map((assetId): UnitRef => ({kind: 'asset', assetId}))];
    const marked = readyRobots().includes('scout');
    const raw = readyRobots().reduce((sum, r) => sum + robotStats(r, level(r), config).damage, 0) + readyAssets().reduce((sum, id) => sum + assetStats(id, config).volley, 0);
    let volley = Math.round(raw * veteran * (marked ? 1 + SCOUT_MARK_BONUS : 1));
    const order = marked ? [...alive()].sort((a, b) => a.hp - b.hp) : alive();
    if (marked && order[0]) ev.push({t: 'mark', target: order[0].id});
    ev.push({t: 'volley', shooters, total: volley});
    for (const target of order) {
      if (volley <= 0) break;
      const hit = Math.min(volley, target.hp);
      volley -= hit;
      const hp = target.hp - hit;
      enemies = enemies.map((x) => (x.id === target.id ? {...x, hp} : x));
      if (hp <= 0) killed.add(target.id);
      ev.push({t: 'hit', target: target.id, dmg: hit, hpAfter: hp, destroyed: hp <= 0});
    }
    if (alive().length === 0) status = 'won';
    // 3. The Dominion answers.
    if (status === 'active') {
      for (const enemy of alive()) {
        const robotsUp = readyRobots();
        const assetsUp = readyAssets();
        if (robotsUp.length === 0) break;
        const to: UnitRef =
          enemy.kind === 'walker' && assetsUp.length
            ? {kind: 'asset', assetId: [...assetsUp].sort((a, b) => assetStats(b, config).maxHp - assetStats(a, config).maxHp)[0]}
            : {kind: 'robot', role: [...robotsUp].sort((a, b) => robotStats(a, level(a), config).maxHp - robotStats(b, level(b), config).maxHp)[0]};
        const dmg = Math.round(ENEMY_SPEC[enemy.kind].damage * (1 + WAVE_GROWTH * (strength - 1)) * armour);
        if (to.kind === 'robot') {
          const max = robotStats(to.role, level(to.role), config).maxHp;
          const hp = robotHp[to.role]!.hp - dmg;
          const outcome = hp <= -OVERKILL_SHARE * max ? 'destroyed' : hp <= 0 ? 'disabled' : 'hit';
          robotHp[to.role] = {hp: Math.max(0, hp), status: outcome === 'hit' ? 'ready' : outcome};
          ev.push({t: 'enemyHit', from: enemy.id, to, dmg, hpAfter: Math.max(0, hp), outcome});
        } else {
          const hp = assetHp[to.assetId].hp - dmg;
          const outcome = hp <= 0 ? 'disabled' : 'hit';
          assetHp[to.assetId] = {hp: Math.max(0, hp), status: outcome === 'hit' ? 'ready' : 'disabled'};
          ev.push({t: 'enemyHit', from: enemy.id, to, dmg, hpAfter: Math.max(0, hp), outcome});
        }
      }
      if (readyRobots().length === 0) status = 'lost';
    }
    rounds.push(ev);
  }
  const final = status === 'won' ? 'won' : 'lost';
  return {
    id: `enc-${m.id}`,
    marchId: m.id,
    siteId: site.id,
    siteKind: site.kind,
    wave: strength,
    enemiesStart,
    enemies,
    rounds,
    status: final,
    withdrew: status === 'active',
    startsAt: m.arriveAt,
    endsAt: m.arriveAt + Math.round(rounds.length * config.roundSeconds * SEC) + RESULT_MS,
    before,
    after: {robots: robotHp, assets: assetHp},
    kills: killed.size,
    xp: killed.size * XP_PER_KILL + (final === 'won' ? XP_PER_WIN : 0),
    reward: final === 'won' ? siteReward(site, s, config) : null,
    applied: false,
    seen: false,
  };
}

/** Who a battle left down, read from its final snapshot. */
export function battleCasualties(e: Encounter): {destroyed: Role[]; disabled: Role[]; assetsDisabled: string[]} {
  const destroyed: Role[] = [];
  const disabled: Role[] = [];
  for (const role of ROLES) {
    const v = e.after.robots[role];
    if (v?.status === 'destroyed') destroyed.push(role);
    else if (v?.status === 'disabled') disabled.push(role);
  }
  const assetsDisabled = Object.entries(e.after.assets)
    .filter(([, v]) => v.status === 'disabled')
    .map(([id]) => id);
  return {destroyed, disabled, assetsDisabled};
}

/** Apply a resolved battle to the Task Force, once (ledger `battle:<id>`). */
function applyBattle(s: SandboxState, e: Encounter, config: SandboxSeasonConfig): SandboxState {
  const key = `battle:${e.id}`;
  if (s.ledger.includes(key)) return {...s, encounter: {...e, applied: true}};
  const robots = {...s.robots};
  for (const role of ROLES) {
    const v = e.after.robots[role];
    if (v) robots[role] = {...robots[role], hp: v.hp, status: v.status};
  }
  const assets = s.assets.map((a) => (e.after.assets[a.assetId] ? {...a, hp: e.after.assets[a.assetId].hp, status: e.after.assets[a.assetId].status} : a));
  let ledger = [...s.ledger, key];
  let kills = 0;
  for (const enemy of e.enemies) {
    const k = `destroyed:${e.id}:${enemy.id}`;
    if (enemy.hp <= 0 && !ledger.includes(k)) {
      ledger = [...ledger, k];
      kills += 1;
    }
  }
  const won = e.status === 'won';
  let next: SandboxState = {
    ...s,
    robots,
    assets,
    ledger,
    company: {...s.company, xp: s.company.xp + e.xp},
    stats: {
      ...s.stats,
      trainingKills: s.stats.trainingKills + kills,
      battlesWon: s.stats.battlesWon + (won ? 1 : 0),
      battlesLost: s.stats.battlesLost + (won ? 0 : 1),
      robotsDestroyed: s.stats.robotsDestroyed + battleCasualties(e).destroyed.length,
      patrolWins: s.stats.patrolWins + (won && e.siteKind === 'patrol' ? 1 : 0),
      exercisesDone: s.stats.exercisesDone + (won && e.siteKind !== 'patrol' && e.siteKind !== 'rival_base' ? 1 : 0),
    },
    encounter: {...e, applied: true},
  };
  if (won) {
    next = {...next, cleared: next.cleared.includes(e.siteId) ? next.cleared : [...next.cleared, e.siteId]};
    if (e.reward) next = lane(grant(next, `reward:${e.siteId}`, e.reward), 'industry', e.endsAt, config);
  }
  return next;
}

/* -------------------------------------------------------------------------- */
/* Settle on read                                                             */
/* -------------------------------------------------------------------------- */

/** Fold in every timer that has finished by `now`, in order. Idempotent. */
export function settle(state: SandboxState, now: number, config: SandboxSeasonConfig = SANDBOX_SEASON_1_TEST): SandboxState {
  let s = state;

  const job = s.workshop.job;
  if (job && job.completesAt <= now) s = {...s, workshop: {level: Math.max(s.workshop.level, job.toLevel), job: null}};

  for (const role of ROLES) {
    const r = s.robots[role];
    if (!r.job || r.job.completesAt > now) continue;
    const j = r.job;
    if (j.kind === 'upgrade' && j.toLevel) {
      const before = robotStats(role, r.level, config);
      const after = robotStats(role, j.toLevel, config);
      // Damage carried into the bay stays; the new plating adds its HP.
      const hp = Math.max(1, Math.min(after.maxHp, r.hp + (after.maxHp - before.maxHp)));
      const install: Install = {role, fromLevel: r.level, toLevel: j.toLevel, slot: slotForLevel(j.toLevel), at: j.completesAt};
      s = {...s, robots: {...s.robots, [role]: {...r, level: j.toLevel, hp, status: 'ready', job: null}}, lastInstall: install};
      s = tutorialOn(s, 'upgrade.done', now, config);
    } else {
      s = {...s, robots: {...s.robots, [role]: {...r, hp: robotStats(role, r.level, config).maxHp, status: 'ready', job: null}}};
    }
  }
  if (s.assets.some((a) => a.job && a.job.completesAt <= now)) {
    s = {...s, assets: s.assets.map((a) => (a.job && a.job.completesAt <= now ? {...a, hp: assetStats(a.assetId, config).maxHp, status: 'ready', job: null} : a))};
  }

  const m = s.march;
  if (m) {
    const site = findSite(s, m.siteId, config);
    if (m.phase === 'outbound' && m.arriveAt <= now && site) {
      if (site.battle) {
        const e = resolveBattle(s, m, site, config);
        s = {...s, encounter: e, march: {...m, phase: 'engaged', holdUntil: e.endsAt}};
        s = lane(s, 'engagement', m.arriveAt, config);
        s = tutorialOn(s, 'march.arrive', now, config);
      } else {
        s = {...s, march: {...m, phase: 'holding', holdUntil: m.arriveAt + config.holdSeconds * SEC}};
      }
    }
    const m2 = s.march!;
    if (m2.phase === 'engaged' && m2.holdUntil !== null && m2.holdUntil <= now && s.encounter && s.encounter.marchId === m2.id) {
      s = applyBattle(s, s.encounter, config);
      // Damaged Assets set the pace home (the live march rule, shared/repair.ts).
      const worst = Math.min(1, ...m2.assets.map((id) => (s.assets.find((a) => a.assetId === id)?.hp ?? 0) / assetStats(id, config).maxHp));
      const travel = Math.round((m2.arriveAt - m2.departAt) / marchHpFactor(worst));
      s = {...s, march: {...m2, phase: 'returning', returnAt: m2.holdUntil + travel, outcome: s.encounter!.status}};
    }
    const m3 = s.march!;
    if (m3.phase === 'holding' && m3.holdUntil !== null && m3.holdUntil <= now && site) {
      const reward = siteReward(site, s, config);
      if (reward) s = grant(s, `reward:${site.id}`, reward);
      s = lane(s, 'industry', m3.holdUntil, config);
      s = {
        ...s,
        cleared: s.cleared.includes(site.id) ? s.cleared : [...s.cleared, site.id],
        stats: {...s.stats, exercisesDone: s.stats.exercisesDone + 1},
        march: {...m3, phase: 'returning', returnAt: m3.holdUntil + (m3.arriveAt - m3.departAt), outcome: 'held'},
      };
    }
    const m4 = s.march!;
    if (m4.phase === 'returning' && m4.returnAt !== null && m4.returnAt <= now) {
      s = {...s, march: null};
      s = tutorialOn(s, 'march.home', now, config);
    }
  }
  return s;
}

export function findSite(s: SandboxState, siteId: string, config: SandboxSeasonConfig = SANDBOX_SEASON_1_TEST): Site | null {
  const day = Number(/^d(\d+)-/.exec(siteId)?.[1] ?? NaN);
  if (!Number.isInteger(day)) return null;
  const site = sitesFor(s, day, config).find((x) => x.id === siteId);
  if (site) return site;
  // A patrol site id carries the win count it was issued at; after that win the id is history.
  if (/^d(\d+)-patrol-(\d+)$/.test(siteId)) return {id: siteId, kind: 'patrol', day, ...PATROL_AT, battle: true};
  return null;
}

/* -------------------------------------------------------------------------- */
/* Actions                                                                    */
/* -------------------------------------------------------------------------- */

/** Apply one action, once. `realNow` is the wall clock; the test clock offset is added here. */
export function applyAction(state: SandboxState, actionId: string, action: SandboxAction, realNow: number, config: SandboxSeasonConfig = SANDBOX_SEASON_1_TEST): ActionResult {
  if (!actionId) return {ok: false, state, error: 'Missing action id.'};
  if (state.applied.includes(actionId)) return {ok: true, state, note: null};
  const now = sandboxNow(state, realNow);
  const settled = settle(state, now, config);
  const result = reduce(settled, action, now, config);
  if (!result.ok) return {...result, state: settled};
  return {...result, state: {...result.state, applied: [...result.state.applied, actionId].slice(-APPLIED_KEEP)}};
}

const robotOut = (s: SandboxState, role: Role) => !!s.march && s.march.robots.includes(role);
const assetOut = (s: SandboxState, id: string) => !!s.march && s.march.assets.includes(id);

function reduce(s: SandboxState, action: SandboxAction, now: number, config: SandboxSeasonConfig): ActionResult {
  const fail = (error: string): ActionResult => ({ok: false, state: s, error});
  const done = (state: SandboxState, note: string | null = null): ActionResult => ({ok: true, state, note});

  switch (action.type) {
    case 'tutorial.next': {
      if (s.tutorial.completed || TUTORIAL[s.tutorial.step]?.advance !== 'next') return fail('Finish the current objective first.');
      return done(advanceTutorial(s));
    }
    case 'tutorial.skip':
      return done({...s, tutorial: {step: TUTORIAL.length - 1, completed: true}});

    case 'company.rename': {
      const name = action.name.trim().replace(/\s+/g, ' ');
      if (name.length < 3 || name.length > 32) return fail('A Task Force name is 3 to 32 characters.');
      return done({...s, company: {...s.company, name}});
    }

    case 'clock.advance': {
      if (!Number.isInteger(action.minutes) || action.minutes < 1 || action.minutes > 24 * 60) return fail('Advance 1 minute to 24 hours.');
      const next = {...s, clockOffsetMs: s.clockOffsetMs + action.minutes * MIN};
      return done(settle(next, now + action.minutes * MIN, config), `Test clock +${action.minutes} min (sandbox only).`);
    }
    case 'clock.nextDay': {
      const day = sandboxDay(s, now, config);
      const target = s.createdAt + (day + 1) * config.dayMs;
      const next = {...s, clockOffsetMs: s.clockOffsetMs + (target - now), selectedSite: null};
      return done(settle(next, target, config), `Test clock: sandbox day ${day + 2} (new exercises).`);
    }

    case 'site.select': {
      if (action.siteId === null) return done({...s, selectedSite: null});
      const site = findSite(s, action.siteId, config);
      if (!site || site.day !== sandboxDay(s, now, config)) return fail("That target is not on today's map.");
      const next = {...s, selectedSite: site.id};
      return done(site.kind === 'patrol' ? tutorialOn(next, 'site.select', now, config) : next);
    }

    case 'march.start': {
      if (s.march) return fail('The Task Force is already out. One march at a time in the sandbox.');
      const site = findSite(s, action.siteId, config);
      const today = sandboxDay(s, now, config);
      if (!site || site.day !== today || !sitesFor(s, today, config).some((x) => x.id === site.id)) return fail("That target is not on today's map.");
      if (s.cleared.includes(site.id)) return fail('That target is already done today.');
      const robots = [...new Set(action.robots)].filter((r) => (ROLES as readonly string[]).includes(r));
      const assets = [...new Set(action.assets)].filter((id) => s.assets.some((a) => a.assetId === id));
      if (robots.length === 0) return fail('Pick at least one robot troop.');
      if (!assets.some(isDrone)) return fail('A Task Force marches with its drone. Add the Global Hawk.');
      for (const r of robots) if (s.robots[r].status !== 'ready' || s.robots[r].hp <= 0) return fail(`${config.roles[r].label} is not ready to deploy.`);
      for (const id of assets) {
        const a = s.assets.find((x) => x.assetId === id)!;
        if (a.status !== 'ready' || a.hp <= 0) return fail(`${assetOf(id)?.name ?? id} is ${a.status === 'repairing' ? 'under repair' : 'disabled. Repair it first'}.`);
      }
      const seconds = marchSeconds(site, config);
      const id = `m${s.marchesLaunched + 1}`;
      const march: March = {id, siteId: site.id, robots, assets, departAt: now, arriveAt: now + seconds * SEC, phase: 'outbound', holdUntil: null, returnAt: null, outcome: null};
      const next: SandboxState = {
        ...s,
        march,
        marchesLaunched: s.marchesLaunched + 1,
        selectedSite: null,
        robots: Object.fromEntries(ROLES.map((r) => [r, robots.includes(r) ? {...s.robots[r], sorties: s.robots[r].sorties + 1} : s.robots[r]])) as SandboxState['robots'],
        assets: s.assets.map((a) => (assets.includes(a.assetId) ? {...a, sorties: a.sorties + 1} : a)),
      };
      return done(tutorialOn(lane(next, 'mobilization', now, config), 'march.start', now, config), `Marching on ${siteLabel(site.kind)}: ${seconds} s.`);
    }

    case 'march.recall': {
      const m = s.march;
      if (!m || m.phase === 'returning') return fail('No march to recall.');
      if (m.phase === 'engaged') return fail('The attack is already under way. The Task Force comes home when it ends.');
      const travelled = m.phase === 'outbound' ? now - m.departAt : m.arriveAt - m.departAt;
      const next = tutorialBack({...s, march: {...m, phase: 'returning', returnAt: now + travelled, outcome: 'recalled'}});
      return done(next, m.phase === 'holding' ? 'Task Force recalled before the hold finished: no reward.' : 'Task Force recalled: no reward.');
    }

    case 'battle.seen': {
      const e = s.encounter;
      if (!e) return fail('There is no battle report.');
      if (now < e.endsAt) return fail('The battle is still being fought.');
      if (e.seen) return done(s);
      const next: SandboxState = {...s, encounter: {...e, seen: true}};
      return done(e.status === 'won' ? tutorialOn(next, 'battle.seen', now, config) : tutorialBack(next));
    }

    case 'robot.upgrade': {
      const r = s.robots[action.role];
      if (!r) return fail('No such robot.');
      if (robotOut(s, r.role)) return fail(`${config.roles[r.role].label} is out with the Task Force.`);
      if (r.status !== 'ready') return fail(`${config.roles[r.role].label} is ${r.status}.`);
      if (ROLES.some((x) => s.robots[x].status === 'upgrading')) return fail('The Robot Bay fits one robot at a time.');
      const quote = nextInstall(r, config);
      if (!quote) return fail(`${config.roles[r.role].label} is at the test cap, level ${config.robotMaxLevel}.`);
      if (!canPay(s.supplies, quote.cost) || s.credits < quote.cost.credits) return fail(shortLine(s.supplies, quote.cost, s.credits, quote.cost.credits));
      const next: SandboxState = {
        ...s,
        supplies: pay(s.supplies, quote.cost),
        credits: s.credits - quote.cost.credits,
        robots: {...s.robots, [r.role]: {...r, status: 'upgrading', job: {kind: 'upgrade', startedAt: now, completesAt: now + Math.round(quote.minutes * MIN), toLevel: quote.toLevel, paid: true}}},
      };
      return done(tutorialOn(lane(next, 'readiness', now, config), 'robot.upgrade', now, config), `Robot Bay: fitting ${quote.toPart} (${quote.minutes} min).`);
    }

    case 'robot.repair': {
      const r = s.robots[action.role];
      if (!r) return fail('No such robot.');
      if (robotOut(s, r.role)) return fail('Repairs happen at base. Bring the Task Force home first.');
      if (r.status === 'destroyed') return fail('A destroyed robot is remanufactured, not repaired.');
      if (!robotNeedsRepair(r, config)) return fail('That robot does not need repair.');
      const q = repairQuote(r, s.workshop.level, config);
      const paid = canPay(s.supplies, q.cost);
      const minutes = paid ? q.minutes : q.minutes * config.emergencySlowdown;
      const charged: SandboxState = {...s, supplies: paid ? pay(s.supplies, q.cost) : s.supplies};
      const next: SandboxState = paid ? lane(charged, 'readiness', now, config) : {...charged};
      next.robots = {...next.robots, [r.role]: {...r, status: 'repairing', job: {kind: 'repair', startedAt: now, completesAt: now + Math.round(minutes * MIN), toLevel: null, paid}}};
      return done(tutorialOn(next, 'recover', now, config), paid ? null : 'Not enough supplies: field crews repair it for free, slower.');
    }

    case 'robot.remanufacture': {
      const r = s.robots[action.role];
      if (!r) return fail('No such robot.');
      if (robotOut(s, r.role)) return fail('Remanufacturing happens at base.');
      if (r.status !== 'destroyed') return fail('Only a destroyed robot is remanufactured.');
      const q = remanufactureQuote(r, s.workshop.level, config);
      const paid = canPay(s.supplies, q.cost);
      const minutes = paid ? q.minutes : q.minutes * config.emergencySlowdown;
      const charged: SandboxState = {...s, supplies: paid ? pay(s.supplies, q.cost) : s.supplies, nextSerial: s.nextSerial + 1};
      const next: SandboxState = paid ? lane(charged, 'readiness', now, config) : {...charged};
      next.robots = {
        ...next.robots,
        [r.role]: {...r, serial: s.nextSerial, status: 'remanufacturing', sorties: 0, job: {kind: 'remanufacture', startedAt: now, completesAt: now + Math.round(minutes * MIN), toLevel: null, paid}},
      };
      return done(tutorialOn(next, 'recover', now, config), paid ? `Remanufacturing at level ${r.level}: every installed part is rebuilt.` : 'Not enough supplies: an emergency rebuild, slower. Level and parts kept.');
    }

    case 'asset.repair': {
      const a = s.assets.find((x) => x.assetId === action.assetId);
      if (!a) return fail('No such Asset.');
      if (assetOut(s, a.assetId)) return fail('Repairs happen at base. Bring the Task Force home first.');
      if (!assetNeedsRepair(a, config)) return fail(`${assetOf(a.assetId)?.name ?? a.assetId} does not need repair.`);
      const q = assetRepairQuote(a, config);
      const paid = canPay(s.supplies, q.cost);
      const minutes = Math.max(0.25, paid ? q.minutes : q.minutes * config.emergencySlowdown);
      const charged: SandboxState = {...s, supplies: paid ? pay(s.supplies, q.cost) : s.supplies};
      const next: SandboxState = paid ? lane(charged, 'readiness', now, config) : {...charged};
      next.assets = next.assets.map((x) => (x.assetId === a.assetId ? {...x, status: 'repairing', job: {startedAt: now, completesAt: now + Math.round(minutes * MIN), paid}} : x));
      return done(tutorialOn(next, 'recover', now, config), paid ? null : 'Not enough supplies: field crews repair it for free, slower.');
    }

    case 'workshop.start': {
      if (s.workshop.job) return fail('The Field Workshop is already upgrading.');
      const toLevel = s.workshop.level + 1;
      const step = FIELD_WORKSHOP_STEPS[toLevel];
      if (!step) return fail('The Field Workshop is at its sandbox maximum.');
      if (!canPay(s.supplies, step.cost)) return fail(shortLine(s.supplies, step.cost));
      const next = {...s, supplies: pay(s.supplies, step.cost), workshop: {...s.workshop, job: {toLevel, completesAt: now + step.minutes * MIN}}};
      return done(lane(next, 'command', now, config), `Field Workshop upgrading to level ${toLevel} (${step.minutes} min).`);
    }

    case 'install.seen': {
      if (!s.lastInstall || s.seenInstallAt === s.lastInstall.at) return done(s);
      return done({...s, seenInstallAt: s.lastInstall.at});
    }

    case 'test.supplies': {
      const supplies = {...s.supplies};
      for (const k of SUPPLY_KINDS) supplies[k] += TEST_SUPPLY_GRANT;
      return done({...s, supplies, credits: s.credits + TEST_CREDIT_GRANT}, `Test control: +${TEST_SUPPLY_GRANT.toLocaleString()} of each supply and +${TEST_CREDIT_GRANT} test Credits (sandbox only).`);
    }

    case 'ops.cache': {
      const day = sandboxDay(s, now, config);
      const key = `cache:${day}`;
      if (s.ledger.includes(key)) return fail("Today's Cache is already claimed.");
      const count = lanesDone(s, day).length;
      if (count < LANES_FOR_CACHE) return fail(`Complete ${LANES_FOR_CACHE - count} more lane${LANES_FOR_CACHE - count === 1 ? '' : 's'} first.`);
      const reward = cacheReward(sandboxWeek(day, config));
      return done(tutorialOn(grant(s, key, reward), 'ops.cache', now, config), `Daily Operations Cache: ${describeReward(reward)}.`);
    }
  }
}
