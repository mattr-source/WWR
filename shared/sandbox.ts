/**
 * The Field Sandbox, Season 1 test slice: a single-player loop isolated
 * from accounts.
 *
 *   The sector map shows the day's Season 1 exercises (the real exercise
 *   types, picked by the real daily picker) and a Dominion patrol.
 *   -> choose which robots of the Task Force deploy, and march
 *   -> hold a site for its exercise reward, or fight round by round
 *   -> collect, march home
 *   -> spend supplies: a robot level installs one visible part and raises
 *      real stats; the Field Workshop repairs faster
 *   -> a damaged robot is repaired with supplies and time; a destroyed one
 *      is remanufactured with supplies and time and KEEPS its level
 *   -> Daily Operations lanes and the four-lane Cache, from season1Ops
 *
 * TEST-ONLY BALANCE comes from a SandboxSeasonConfig (shared/sandboxSeason.ts).
 * None of it is read by the Worker, the live base, payments or any account.
 *
 * Pure and deterministic: no randomness, no clock, no I/O.
 *
 *   - Timers are absolute instants, settled on read (`settle`).
 *   - Every action carries an id; an id already applied changes nothing.
 *   - A reward, a lane, a Cache or a destruction is recorded under a ledger
 *     key; the same key never counts again.
 *   - Kills here are TRAINING kills against NPCs. `confirmedPvpDestructions`
 *     is always 0 and nothing in this file can raise it.
 */
import {EXERCISES, type ExerciseType, exerciseReward, hashSeed, pickDailyTypes, seeded} from './exercises';
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

export {SUPPLY_KINDS};
export type {Supplies, SupplyKind};

export const SANDBOX_SCHEMA = 2;
export const ROLES = ROBOT_ROLES;
export type Role = RobotRole;

const MIN = 60_000;
const SEC = 1000;

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

export type EnemyKind = 'crawler' | 'walker';

export interface Enemy {
  id: string;
  kind: EnemyKind;
  hp: number;
  maxHp: number;
}

export interface Encounter {
  id: string;
  marchId: string;
  siteId: string;
  wave: number;
  enemies: Enemy[];
  round: number;
  status: 'active' | 'won' | 'lost';
  log: string[];
  claimed: boolean;
}

export type SiteKind = ExerciseType | 'patrol';

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
  departAt: number;
  arriveAt: number;
  phase: MarchPhase;
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
  nextSerial: number;
  supplies: Supplies;
  credits: number;
  workshop: {level: number; job: {toLevel: number; completesAt: number} | null};
  selectedSite: string | null;
  march: March | null;
  marchesLaunched: number;
  encounter: Encounter | null;
  /** Site ids finished (cleared or held) - one reward each. */
  cleared: string[];
  /** The most recent finished install, for the ceremony. */
  lastInstall: Install | null;
  stats: {
    trainingKills: number;
    battlesWon: number;
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
  | {type: 'march.start'; siteId: string; robots: Role[]}
  | {type: 'march.recall'}
  | {type: 'encounter.fire'}
  | {type: 'encounter.claim'}
  | {type: 'robot.upgrade'; role: Role}
  | {type: 'robot.repair'; role: Role}
  | {type: 'robot.remanufacture'; role: Role}
  | {type: 'workshop.start'}
  | {type: 'ops.cache'}
  | {type: 'clock.advance'; minutes: number}
  | {type: 'clock.nextDay'}
  | {type: 'company.rename'; name: string};

export type ActionResult = {ok: true; state: SandboxState; note: string | null} | {ok: false; state: SandboxState; error: string};

/* -------------------------------------------------------------------------- */
/* Robots: parts and real stats                                               */
/* -------------------------------------------------------------------------- */

export const TIER_NAMES = ['Salvaged', 'Refitted', 'Advanced', 'Prototype'] as const;

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

/** Tier of every slot at a level: how many times it has been replaced (0 = salvaged original). */
export function partsAt(level: number): Record<PartSlot, number> {
  const out = {head: 0, torso: 0, legs: 0, arms: 0, gear: 0} as Record<PartSlot, number>;
  for (let l = 2; l <= level; l += 1) out[slotForLevel(l)] += 1;
  return out;
}

export interface RobotStats {
  maxHp: number;
  damage: number;
  heal: number;
  /** A single readable figure: HP + 3 x damage + 4 x heal. Shown, never used in combat. */
  power: number;
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
  const maxHp = Math.round(spec.baseHp * (1 + hpPct));
  const damage = Math.round(spec.baseDamage * (1 + dmgPct));
  return {maxHp, damage, heal, power: maxHp + damage * 3 + heal * 4};
}

export function partName(role: Role, slot: PartSlot, tier: number, config: SandboxSeasonConfig = SANDBOX_SEASON_1_TEST): string {
  const name = slot === 'gear' ? config.roles[role].gearName : SLOT_LABEL[slot];
  return `${TIER_NAMES[Math.min(tier, TIER_NAMES.length - 1)]} ${name.toLowerCase()}`;
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
/* Enemies, rewards, company (test-only)                                      */
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
  {x: 78, y: 300},
  {x: 290, y: 250},
  {x: 176, y: 150},
];
const PATROL_AT = {x: 286, y: 400};

export function sandboxDay(state: SandboxState, now: number, config: SandboxSeasonConfig = SANDBOX_SEASON_1_TEST): number {
  return Math.max(0, Math.floor((now - state.createdAt) / config.dayMs));
}

export function sandboxWeek(day: number, config: SandboxSeasonConfig = SANDBOX_SEASON_1_TEST): number {
  return Math.min(config.weeks, Math.floor(day / 7) + 1);
}

/** Today's sites: the real daily exercise picker, seeded by this sandbox and day, plus the patrol. */
export function sitesFor(state: SandboxState, day: number, config: SandboxSeasonConfig = SANDBOX_SEASON_1_TEST): Site[] {
  const types = pickDailyTypes(seeded(hashSeed(`sandbox:${state.createdAt}:${day}`)), true).slice(0, config.exercisesPerDay);
  const sites: Site[] = types.map((kind, i) => ({id: `d${day}-${kind}`, kind, day, ...SITE_SLOTS[i], battle: EXERCISES[kind].kind === 'battle'}));
  sites.push({id: `d${day}-patrol-${state.stats.patrolWins + 1}`, kind: 'patrol', day, ...PATROL_AT, battle: true});
  return sites;
}

export function siteLabel(kind: SiteKind): string {
  return kind === 'patrol' ? 'Dominion Patrol' : EXERCISES[kind].name;
}

export function siteReward(site: Site, state: SandboxState): Reward {
  const week = sandboxWeek(site.day);
  return site.kind === 'patrol' ? patrolReward(state.stats.patrolWins + 1) : exerciseReward(site.kind, week);
}

export function marchSeconds(site: {x: number; y: number}, config: SandboxSeasonConfig = SANDBOX_SEASON_1_TEST): number {
  const d = Math.hypot(site.x - BASE_AT.x, site.y - BASE_AT.y);
  return Math.round(config.marchBaseSeconds + d * config.marchSecondsPerUnit);
}

/** Enemy line-up a battle site will have, for the target card (same function the engine uses). */
export function siteEnemies(site: Site, state: SandboxState): Enemy[] {
  if (!site.battle) return [];
  return site.kind === 'patrol'
    ? enemiesFor(patrolKinds(state.stats.patrolWins + 1), state.stats.patrolWins + 1, site.id)
    : enemiesFor(exerciseKinds(site.kind as ExerciseType), sandboxWeek(site.day) + 1, site.id);
}

/** Readable, honest strength comparison: total HP + 3 x damage per side. A forecast, not a promise. */
export function forceRating(robots: Robot[], config: SandboxSeasonConfig = SANDBOX_SEASON_1_TEST): number {
  return robots.reduce((sum, r) => {
    const s = robotStats(r.role, r.level, config);
    return sum + Math.max(0, r.hp) + s.damage * 3 + s.heal * 4;
  }, 0);
}
export function enemyRating(enemies: Enemy[], strength: number): number {
  const scale = 1 + WAVE_GROWTH * (Math.max(1, strength) - 1);
  return enemies.reduce((sum, e) => sum + e.hp + Math.round(ENEMY_SPEC[e.kind].damage * scale) * 3, 0);
}

/* -------------------------------------------------------------------------- */
/* Daily Operations (the real lanes; sandbox triggers)                        */
/* -------------------------------------------------------------------------- */

/** What completes each lane in the sandbox. Cooperation needs an alliance, which the sandbox has not. */
export const SANDBOX_LANE_TRIGGER: Record<Lane, string | null> = {
  command: 'Start a Field Workshop upgrade',
  industry: 'Collect a reward (sandbox stand-in for an hour of production)',
  mobilization: LANE_COPY.mobilization.task,
  engagement: LANE_COPY.engagement.task,
  readiness: 'Upgrade, repair or remanufacture a robot',
  cooperation: null,
};

export function lanesDone(state: SandboxState, day: number): Lane[] {
  const prefix = `lane:${day}:`;
  return state.ledger.filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length) as Lane);
}

/* -------------------------------------------------------------------------- */
/* Tutorial                                                                   */
/* -------------------------------------------------------------------------- */

export type TutorialEvent =
  | 'next'
  | 'site.select'
  | 'march.start'
  | 'march.arrive'
  | 'encounter.fire'
  | 'encounter.won'
  | 'encounter.claim'
  | 'march.home'
  | 'robot.upgrade'
  | 'upgrade.done'
  | 'robot.repair'
  | 'ops.cache'
  | 'finish';

export interface TutorialStep {
  say: string;
  objective: string;
  advance: TutorialEvent;
}

export const TUTORIAL: readonly TutorialStep[] = [
  {say: 'Commander, General Rider. This is the Season 1 test slice: Mech Uprising. Practice ground, nothing here touches your real base.', objective: 'Read the briefing.', advance: 'next'},
  {say: 'Your Task Force: three humanoid robots and a recon drone. A wrecked robot is rebuilt with its upgrades intact.', objective: 'Meet your Task Force.', advance: 'next'},
  {say: 'Dominion Crawlers are loose on the flats. Tap the Dominion Patrol target on the map.', objective: 'Select the Dominion Patrol.', advance: 'site.select'},
  {say: 'Check the forecast, pick who goes, and march.', objective: 'March on the patrol.', advance: 'march.start'},
  {say: 'The Task Force is marching. Wait for contact, or use the test skip.', objective: 'Reach the target.', advance: 'march.arrive'},
  {say: 'Contact. Your Scout marks a target and everyone hits it harder. Fire.', objective: 'Fire one volley.', advance: 'encounter.fire'},
  {say: 'Keep firing until every robot is down. Crawlers go for light frames.', objective: 'Win the fight.', advance: 'encounter.won'},
  {say: 'Recover what they were carrying.', objective: 'Collect the reward.', advance: 'encounter.claim'},
  {say: 'The Task Force is heading home. Upgrades and repairs happen at base.', objective: 'Bring the Task Force home.', advance: 'march.home'},
  {say: 'Open the Robot Bay. Every level installs a new part and shows exactly what it improves.', objective: 'Upgrade a robot to level 2.', advance: 'robot.upgrade'},
  {say: 'The bay is fitting the part. Wait, or use the test skip, then watch the install.', objective: 'Finish the upgrade.', advance: 'upgrade.done'},
  {say: 'A damaged robot is repaired with supplies and time. A destroyed one is remanufactured and keeps its level.', objective: 'Repair a damaged robot.', advance: 'robot.repair'},
  {say: 'Four Daily Operations lanes done: open the Operations panel and claim the Cache.', objective: 'Claim the Daily Operations Cache.', advance: 'ops.cache'},
  {say: 'Task Force ready. Run the day\'s exercises; the test clock starts a new day with new ones.', objective: 'Clear today\'s exercises.', advance: 'finish'},
];

/* -------------------------------------------------------------------------- */
/* Creation, parsing                                                          */
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
    stats: {trainingKills: 0, battlesWon: 0, patrolWins: 0, exercisesDone: 0, robotsDestroyed: 0, confirmedPvpDestructions: 0},
    ledger: [],
    applied: [],
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A stored sandbox this build can trust, or null (older schema, other config, hand edit, truncation). */
export function parseSandbox(raw: unknown, config: SandboxSeasonConfig = SANDBOX_SEASON_1_TEST): SandboxState | null {
  if (!isObj(raw) || raw.schema !== SANDBOX_SCHEMA) return null;
  const s = raw as unknown as SandboxState;
  if (!isObj(s.config) || s.config.id !== config.id || s.config.version !== config.version) return null;
  if (!isNum(s.createdAt) || !isNum(s.clockOffsetMs) || s.clockOffsetMs < 0) return null;
  if (!isObj(s.tutorial) || !isNum(s.tutorial.step) || typeof s.tutorial.completed !== 'boolean') return null;
  if (!isObj(s.company) || typeof s.company.name !== 'string' || !isNum(s.company.xp)) return null;
  if (!isObj(s.robots)) return null;
  for (const role of ROLES) {
    const r = s.robots[role];
    if (!isObj(r) || r.role !== role || !isNum(r.hp) || !Number.isInteger(r.level) || r.level < 1 || r.level > config.robotMaxLevel) return null;
  }
  if (!isObj(s.supplies) || !SUPPLY_KINDS.every((k) => isNum(s.supplies[k]) && s.supplies[k] >= 0) || !isNum(s.credits) || s.credits < 0) return null;
  if (!isObj(s.workshop) || !isNum(s.workshop.level)) return null;
  if (!isObj(s.stats) || s.stats.confirmedPvpDestructions !== 0) return null;
  if (!Array.isArray(s.ledger) || !Array.isArray(s.applied) || !Array.isArray(s.cleared)) return null;
  return s;
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
const withLog = (e: Encounter, ...lines: string[]): Encounter => ({...e, log: [...e.log, ...lines].slice(-14)});

function shortLine(have: Supplies, cost: Supplies, credits = 0, need = 0): string {
  const k = SUPPLY_KINDS.find((x) => have[x] < cost[x]);
  if (k) return `Need ${cost[k] - have[k]} more ${k[0].toUpperCase()}${k.slice(1)}. Run exercises or patrols for supplies.`;
  if (credits < need) return `Need ${need - credits} more test Credits.`;
  return 'Not enough supplies.';
}

export function describeReward(r: Reward): string {
  const parts: string[] = [];
  for (const k of SUPPLY_KINDS) if (r[k]) parts.push(`${r[k]} ${k[0].toUpperCase()}${k.slice(1)}`);
  if (r.credits) parts.push(`${r.credits} Credits`);
  return parts.join(', ') || 'nothing';
}

function grant(s: SandboxState, key: string, r: Reward): SandboxState {
  if (s.ledger.includes(key)) return s;
  const supplies = {...s.supplies};
  for (const k of SUPPLY_KINDS) supplies[k] += r[k];
  return {...s, supplies, credits: s.credits + r.credits, ledger: [...s.ledger, key]};
}

/** Complete a Daily Operations lane once per day, paying its real reward. */
function lane(s: SandboxState, laneId: Lane, now: number, config: SandboxSeasonConfig): SandboxState {
  if (SANDBOX_LANE_TRIGGER[laneId] === null) return s;
  const day = sandboxDay(s, now, config);
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

/* -------------------------------------------------------------------------- */
/* Tutorial plumbing                                                          */
/* -------------------------------------------------------------------------- */

const APPLIED_KEEP = 200;

function advanceTutorial(s: SandboxState): SandboxState {
  const step = s.tutorial.step + 1;
  return {...s, tutorial: {step: Math.min(step, TUTORIAL.length - 1), completed: step >= TUTORIAL.length - 1}};
}

function tutorialOn(s: SandboxState, event: TutorialEvent, now: number, config: SandboxSeasonConfig): SandboxState {
  if (s.tutorial.completed) return s;
  let next = TUTORIAL[s.tutorial.step]?.advance === event ? advanceTutorial(s) : s;
  // Objectives that cannot be done right now must not block the walkthrough.
  for (let guard = 0; guard < 3 && !next.tutorial.completed; guard += 1) {
    const want = TUTORIAL[next.tutorial.step]?.advance;
    const damaged = ROLES.some((r) => {
      const robot = next.robots[r];
      return robot.status === 'disabled' || robot.status === 'destroyed' || robot.status === 'repairing' || robot.status === 'remanufacturing' || (robot.status === 'ready' && robot.hp < robotStats(r, robot.level, config).maxHp);
    });
    if (want === 'robot.repair' && !damaged) next = advanceTutorial(next);
    else if (want === 'ops.cache' && next.ledger.includes(`cache:${sandboxDay(next, now, config)}`)) next = advanceTutorial(next);
    else break;
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

  const m = s.march;
  if (m) {
    const site = findSite(s, m.siteId, config);
    if (m.phase === 'outbound' && m.arriveAt <= now && site) {
      if (site.battle) {
        if (!s.encounter || s.encounter.marchId !== m.id) {
          const strength = site.kind === 'patrol' ? s.stats.patrolWins + 1 : sandboxWeek(site.day, config) + 1;
          const enemies = siteEnemies(site, s);
          const encounter: Encounter = {id: `enc-${m.id}`, marchId: m.id, siteId: site.id, wave: strength, enemies, round: 0, status: 'active', log: [`${siteLabel(site.kind)}: contact.`], claimed: false};
          s = {...s, encounter, march: {...m, phase: 'engaged'}};
          s = lane(s, 'engagement', now, config);
          s = tutorialOn(s, 'march.arrive', now, config);
        }
      } else {
        s = {...s, march: {...m, phase: 'holding', holdUntil: m.arriveAt + config.holdSeconds * SEC}};
      }
    }
    const m2 = s.march!;
    if (m2.phase === 'holding' && m2.holdUntil !== null && m2.holdUntil <= now && site) {
      const key = `reward:${site.id}`;
      s = grant(s, key, siteReward(site, s));
      s = lane(s, 'industry', now, config);
      const back = m2.holdUntil + (m2.arriveAt - m2.departAt);
      s = {
        ...s,
        cleared: s.cleared.includes(site.id) ? s.cleared : [...s.cleared, site.id],
        stats: {...s.stats, exercisesDone: s.stats.exercisesDone + 1},
        march: {...m2, phase: 'returning', returnAt: back, outcome: 'held'},
      };
    }
    const m3 = s.march!;
    if (m3.phase === 'returning' && m3.returnAt !== null && m3.returnAt <= now) {
      s = {...s, march: null, encounter: s.encounter && s.encounter.marchId === m3.id ? null : s.encounter};
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
  const m = /^d(\d+)-patrol-(\d+)$/.exec(siteId);
  if (m) return {id: siteId, kind: 'patrol', day, x: 286, y: 400, battle: true};
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

function atBase(s: SandboxState, role: Role): boolean {
  return !s.march || !s.march.robots.includes(role);
}

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
      if (!site || site.day !== sandboxDay(s, now, config)) return fail('That target is not on today\'s map.');
      return done(tutorialOn({...s, selectedSite: site.id}, action.siteId.includes('-patrol-') ? 'site.select' : ('none' as TutorialEvent), now, config));
    }

    case 'march.start': {
      if (s.march) return fail('The Task Force is already out. One march at a time in the sandbox.');
      const site = findSite(s, action.siteId, config);
      const today = sandboxDay(s, now, config);
      if (!site || site.day !== today || !sitesFor(s, today, config).some((x) => x.id === site.id)) return fail('That target is not on today\'s map.');
      if (s.cleared.includes(site.id)) return fail('That target is already done today.');
      const robots = [...new Set(action.robots)].filter((r) => (ROLES as readonly string[]).includes(r));
      if (robots.length === 0) return fail('Pick at least one robot.');
      for (const r of robots) if (s.robots[r].status !== 'ready' || s.robots[r].hp <= 0) return fail(`${config.roles[r].label} is not ready to deploy.`);
      const seconds = marchSeconds(site, config);
      const id = `m${s.marchesLaunched + 1}`;
      const march: March = {id, siteId: site.id, robots, departAt: now, arriveAt: now + seconds * SEC, phase: 'outbound', holdUntil: null, returnAt: null, outcome: null};
      const next: SandboxState = {
        ...s,
        march,
        marchesLaunched: s.marchesLaunched + 1,
        selectedSite: null,
        robots: Object.fromEntries(ROLES.map((r) => [r, robots.includes(r) ? {...s.robots[r], sorties: s.robots[r].sorties + 1} : s.robots[r]])) as SandboxState['robots'],
      };
      return done(tutorialOn(lane(next, 'mobilization', now, config), 'march.start', now, config), `Marching on ${siteLabel(site.kind)}: ${seconds} s.`);
    }

    case 'march.recall': {
      const m = s.march;
      if (!m || m.phase === 'returning') return fail('No march to recall.');
      const travelled = m.phase === 'outbound' ? now - m.departAt : m.arriveAt - m.departAt;
      let next: SandboxState = {...s, march: {...m, phase: 'returning', returnAt: now + travelled, outcome: 'recalled'}};
      if (s.encounter && s.encounter.marchId === m.id && s.encounter.status === 'active') {
        next = {...next, encounter: withLog({...s.encounter, status: 'lost'}, 'Task Force withdrew. No reward recovered.')};
      }
      return done(next, 'Task Force recalled.');
    }

    case 'encounter.fire':
      return fire(s, now, config);

    case 'encounter.claim': {
      const e = s.encounter;
      if (!e || e.status !== 'won') return fail('There is nothing to collect.');
      const key = `reward:${e.siteId}`;
      if (e.claimed || s.ledger.includes(key)) return fail('Already collected.');
      const site = findSite(s, e.siteId, config);
      if (!site) return fail('That target is gone.');
      const reward = siteReward(site, s);
      let next = grant(s, key, reward);
      const m = s.march!;
      next = {
        ...next,
        encounter: {...e, claimed: true},
        cleared: next.cleared.includes(site.id) ? next.cleared : [...next.cleared, site.id],
        stats: {
          ...next.stats,
          patrolWins: next.stats.patrolWins + (site.kind === 'patrol' ? 1 : 0),
          exercisesDone: next.stats.exercisesDone + (site.kind === 'patrol' ? 0 : 1),
        },
        march: {...m, phase: 'returning', returnAt: now + (m.arriveAt - m.departAt), outcome: 'won'},
      };
      next = lane(next, 'industry', now, config);
      return done(tutorialOn(next, 'encounter.claim', now, config), `Recovered ${describeReward(reward)}.`);
    }

    case 'robot.upgrade': {
      const r = s.robots[action.role];
      if (!r) return fail('No such robot.');
      if (!atBase(s, r.role)) return fail(`${config.roles[r.role].label} is out with the Task Force.`);
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
      if (!atBase(s, r.role)) return fail('Repairs happen at base. Bring the Task Force home first.');
      const max = robotStats(r.role, r.level, config).maxHp;
      if (r.status === 'destroyed') return fail('A destroyed robot is remanufactured, not repaired.');
      if (!(r.status === 'disabled' || (r.status === 'ready' && r.hp < max))) return fail('That robot does not need repair.');
      const q = repairQuote(r, s.workshop.level, config);
      const paid = canPay(s.supplies, q.cost);
      const minutes = paid ? q.minutes : q.minutes * config.emergencySlowdown;
      const next: SandboxState = {
        ...lane(s, 'readiness', now, config),
        supplies: paid ? pay(s.supplies, q.cost) : s.supplies,
      };
      next.robots = {...next.robots, [r.role]: {...r, status: 'repairing', job: {kind: 'repair', startedAt: now, completesAt: now + Math.round(minutes * MIN), toLevel: null, paid}}};
      return done(tutorialOn(next, 'robot.repair', now, config), paid ? null : 'Not enough supplies: field crews repair it for free, slower.');
    }

    case 'robot.remanufacture': {
      const r = s.robots[action.role];
      if (!r) return fail('No such robot.');
      if (!atBase(s, r.role)) return fail('Remanufacturing happens at base.');
      if (r.status !== 'destroyed') return fail('Only a destroyed robot is remanufactured.');
      const q = remanufactureQuote(r, s.workshop.level, config);
      const paid = canPay(s.supplies, q.cost);
      const minutes = paid ? q.minutes : q.minutes * config.emergencySlowdown;
      const next: SandboxState = {...lane(s, 'readiness', now, config), supplies: paid ? pay(s.supplies, q.cost) : s.supplies, nextSerial: s.nextSerial + 1};
      next.robots = {
        ...next.robots,
        [r.role]: {...r, serial: s.nextSerial, status: 'remanufacturing', sorties: 0, job: {kind: 'remanufacture', startedAt: now, completesAt: now + Math.round(minutes * MIN), toLevel: null, paid}},
      };
      return done(tutorialOn(next, 'robot.repair', now, config), paid ? `Remanufacturing at level ${r.level}: all installed parts are rebuilt.` : 'Not enough supplies: an emergency rebuild, slower. Level kept.');
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

    case 'ops.cache': {
      const day = sandboxDay(s, now, config);
      const key = `cache:${day}`;
      if (s.ledger.includes(key)) return fail('Today\'s Cache is already claimed.');
      const count = lanesDone(s, day).length;
      if (count < LANES_FOR_CACHE) return fail(`Complete ${LANES_FOR_CACHE - count} more lane${LANES_FOR_CACHE - count === 1 ? '' : 's'} first.`);
      const reward = cacheReward(sandboxWeek(day, config));
      return done(tutorialOn(grant(s, key, reward), 'ops.cache', now, config), `Daily Operations Cache: ${describeReward(reward)}.`);
    }
  }
}

/** One volley and the robots' answer. Deterministic. Only robots on the march fight. */
function fire(s: SandboxState, now: number, config: SandboxSeasonConfig): ActionResult {
  const e0 = s.encounter;
  const m = s.march;
  if (!e0 || e0.status !== 'active' || !m || m.phase !== 'engaged') return {ok: false, state: s, error: 'There is no fight under way.'};
  const round = e0.round + 1;
  const robots = {...s.robots};
  const ready = () => m.robots.filter((r) => robots[r].status === 'ready');
  if (ready().length === 0) return {ok: false, state: s, error: 'No robot can fire.'};

  let enemies = e0.enemies.map((x) => ({...x}));
  const lines: string[] = [`Round ${round}.`];
  let ledger = s.ledger;
  let kills = 0;

  if (m.robots.includes('support') && robots.support.status === 'ready') {
    const heal = robotStats('support', robots.support.level, config).heal;
    const hurt = ready()
      .filter((r) => robots[r].hp < robotStats(r, robots[r].level, config).maxHp)
      .sort((a, b) => robots[a].hp / robotStats(a, robots[a].level, config).maxHp - robots[b].hp / robotStats(b, robots[b].level, config).maxHp)[0];
    if (hurt && heal > 0) {
      const hp = Math.min(robotStats(hurt, robots[hurt].level, config).maxHp, robots[hurt].hp + heal);
      lines.push(`Support patches ${config.roles[hurt].label} (+${hp - robots[hurt].hp}).`);
      robots[hurt] = {...robots[hurt], hp};
    }
  }

  const marked = m.robots.includes('scout') && robots.scout.status === 'ready';
  const veteran = 1 + COMPANY_DAMAGE_PER_LEVEL * (companyLevel(s.company.xp).level - 1);
  let volley = ready().reduce((sum, r) => sum + robotStats(r, robots[r].level, config).damage, 0) * veteran;
  volley = Math.round(marked ? volley * (1 + SCOUT_MARK_BONUS) : volley);
  const alive = () => enemies.filter((x) => x.hp > 0);
  const order = marked ? [...alive()].sort((a, b) => a.hp - b.hp) : alive();
  lines.push(`${marked ? 'Scout marks. ' : ''}Task Force volley: ${volley}.`);
  for (const target of order) {
    if (volley <= 0) break;
    const hit = Math.min(volley, target.hp);
    volley -= hit;
    enemies = enemies.map((x) => (x.id === target.id ? {...x, hp: x.hp - hit} : x));
    if (target.hp - hit <= 0) {
      const key = `destroyed:${e0.id}:${target.id}`;
      if (!ledger.includes(key)) {
        ledger = [...ledger, key];
        kills += 1;
        lines.push(`${ENEMY_SPEC[target.kind].label} destroyed.`);
      }
    }
  }

  let status: Encounter['status'] = alive().length === 0 ? 'won' : 'active';
  let lost = 0;
  if (status === 'active') {
    const armour = workshopArmour(s.workshop.level);
    for (const enemy of alive()) {
      const targets = ready();
      if (targets.length === 0) break;
      const pick =
        enemy.kind === 'walker' && targets.includes('assault')
          ? 'assault'
          : [...targets].sort((a, b) => robotStats(a, robots[a].level, config).maxHp - robotStats(b, robots[b].level, config).maxHp)[0];
      const dmg = Math.round(ENEMY_SPEC[enemy.kind].damage * (1 + WAVE_GROWTH * (e0.wave - 1)) * armour);
      const max = robotStats(pick, robots[pick].level, config).maxHp;
      const hp = robots[pick].hp - dmg;
      const label = config.roles[pick].label;
      if (hp <= -OVERKILL_SHARE * max) {
        robots[pick] = {...robots[pick], hp: 0, status: 'destroyed'};
        lost += 1;
        lines.push(`${ENEMY_SPEC[enemy.kind].label} hits ${label} for ${dmg}: DESTROYED.`);
      } else if (hp <= 0) {
        robots[pick] = {...robots[pick], hp: 0, status: 'disabled'};
        lines.push(`${ENEMY_SPEC[enemy.kind].label} hits ${label} for ${dmg}: disabled.`);
      } else {
        robots[pick] = {...robots[pick], hp};
        lines.push(`${ENEMY_SPEC[enemy.kind].label} hits ${label} for ${dmg}.`);
      }
    }
    if (ready().length === 0) status = 'lost';
  }

  const xp = kills * XP_PER_KILL + (status === 'won' ? XP_PER_WIN : 0);
  if (status === 'won') lines.push(`Target won. +${xp} Task Force XP.`);
  else if (status === 'lost') lines.push('Every robot is down. The Task Force falls back; recover it at base.');

  let next: SandboxState = {
    ...s,
    robots,
    ledger,
    encounter: withLog({...e0, round, enemies, status}, ...lines),
    company: {...s.company, xp: s.company.xp + xp},
    stats: {...s.stats, trainingKills: s.stats.trainingKills + kills, battlesWon: s.stats.battlesWon + (status === 'won' ? 1 : 0), robotsDestroyed: s.stats.robotsDestroyed + lost},
  };
  if (status === 'lost') next = {...next, march: {...m, phase: 'returning', returnAt: now + (m.arriveAt - m.departAt), outcome: 'lost'}};
  next = tutorialOn(next, 'encounter.fire', now, config);
  if (status === 'won') next = tutorialOn(next, 'encounter.won', now, config);
  return {ok: true, state: next, note: null};
}
