/**
 * The Field Sandbox's season configuration: every tunable number the
 * sandbox engine (shared/sandbox.ts) plays by, in one typed, versioned,
 * validated object.
 *
 *   TEST-ONLY BALANCE. Nothing here is an economy ruling, a price, a timer
 *   ruling or a live-game number. It exists so a private test build can be
 *   played in one sitting and retuned without touching engine code. The
 *   live game never imports this file.
 *
 * What is NOT invented here, and is read from the real Season 1 modules
 * instead: the season's name and length, the exercise types and their
 * rewards (shared/exercises.ts), how many exercises a day, the Daily
 * Operations lanes, lane and Cache rewards and the four-lane Cache rule
 * (shared/season1Ops.ts), and the week multiplier those rewards grow by.
 *
 * A second config (a later season, an event) is another object passed to
 * the engine; `validateSandboxSeason` refuses one that cannot be played.
 */
import {EXERCISES_PER_DAY} from './exercises';
import {SEASON_WEEKS} from './season';
import {SEASON_1_ID, SEASON_1_NAME} from './season1Ops';

export const SANDBOX_SEASON_SCHEMA = 1;

export const ROBOT_ROLES = ['scout', 'assault', 'support'] as const;
export type RobotRole = (typeof ROBOT_ROLES)[number];

/** Where a part is installed. Every robot level installs exactly one. */
export const PART_SLOTS = ['head', 'torso', 'legs', 'arms', 'gear'] as const;
export type PartSlot = (typeof PART_SLOTS)[number];

export type SupplyKind = 'fuel' | 'steel' | 'munitions' | 'alloy';
export type Supplies = Record<SupplyKind, number>;
export const SUPPLY_KINDS: readonly SupplyKind[] = ['fuel', 'steel', 'munitions', 'alloy'];

export interface RoleSpec {
  label: string;
  blurb: string;
  /** Level-1 values: a salvaged frame. */
  baseHp: number;
  baseDamage: number;
  baseHeal: number;
  /** What each role calls its gear slot. */
  gearName: string;
}

export interface PartBonus {
  /** Share of the role's base value added by ONE install of this slot. */
  hpPct: number;
  damagePct: number;
  /** Flat heal added per install (only a Support chassis heals). */
  heal: number;
}

export interface SandboxSeasonConfig {
  schema: typeof SANDBOX_SEASON_SCHEMA;
  id: string;
  version: number;
  testOnly: true;
  label: string;
  seasonId: string;
  seasonName: string;
  weeks: number;
  /** Length of a sandbox day. The test clock can jump to the next one. */
  dayMs: number;
  exercisesPerDay: number;
  startSupplies: Supplies;
  startCredits: number;

  robotMaxLevel: number;
  roles: Record<RobotRole, RoleSpec>;
  partBonus: Record<PartSlot, PartBonus>;
  /** Index = the level being reached (2..max). Index 0 and 1 unused. */
  upgradeCost: ReadonlyArray<Supplies & {credits: number}>;
  upgradeMinutes: readonly number[];

  /** Repair: this cost and time for a fully disabled robot, scaled by damage share and level. */
  repairCost: Supplies;
  repairMinutes: number;
  /** Remanufacture a destroyed robot: base cost and minutes, scaled by level. */
  remanufactureCost: Supplies;
  remanufactureMinutes: number;
  /** With too few supplies the work still happens for free, this many times slower. */
  emergencySlowdown: number;

  /** March time = base + distance x per unit (map units, 360 wide), in seconds. */
  marchBaseSeconds: number;
  marchSecondsPerUnit: number;
  holdSeconds: number;
}

const r = (fuel: number, steel: number, munitions: number, alloy: number): Supplies => ({fuel, steel, munitions, alloy});
const c = (fuel: number, steel: number, munitions: number, alloy: number, credits: number) => ({fuel, steel, munitions, alloy, credits});

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const nonNeg = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const positive = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0;
const supplies = (v: unknown) => isObj(v) && SUPPLY_KINDS.every((k) => nonNeg(v[k]));

/** Every problem with a season config, or an empty list. Takes `unknown`, so JSON is checked the same way. */
export function validateSandboxSeason(value: unknown): string[] {
  if (!isObj(value)) return ['config must be an object'];
  const p = value;
  const errors: string[] = [];
  if (p.schema !== SANDBOX_SEASON_SCHEMA) errors.push(`schema must be ${SANDBOX_SEASON_SCHEMA}`);
  if (typeof p.id !== 'string' || !/^[a-z0-9][a-z0-9-]{2,63}$/.test(p.id)) errors.push('id must be 3-64 characters of a-z, 0-9 and hyphens');
  if (!Number.isInteger(p.version) || (p.version as number) < 1) errors.push('version must be an integer >= 1');
  if (p.testOnly !== true) errors.push('testOnly must be true: sandbox configs are never live balance');
  for (const k of ['label', 'seasonId', 'seasonName'] as const) if (typeof p[k] !== 'string' || !(p[k] as string).trim()) errors.push(`${k} is required`);
  if (!Number.isInteger(p.weeks) || (p.weeks as number) < 1 || (p.weeks as number) > 52) errors.push('weeks must be 1-52');
  if (!Number.isInteger(p.dayMs) || (p.dayMs as number) < 60_000) errors.push('dayMs must be a whole number of ms, at least one minute');
  if (!Number.isInteger(p.exercisesPerDay) || (p.exercisesPerDay as number) < 1 || (p.exercisesPerDay as number) > 3) errors.push('exercisesPerDay must be 1-3 (the exercise picker offers three)');
  if (!supplies(p.startSupplies)) errors.push('startSupplies must list four non-negative supplies');
  if (!nonNeg(p.startCredits)) errors.push('startCredits must be >= 0');

  const max = p.robotMaxLevel;
  if (!Number.isInteger(max) || (max as number) < 2 || (max as number) > 50) errors.push('robotMaxLevel must be 2-50');
  if (!isObj(p.roles)) errors.push('roles must be an object');
  else {
    for (const role of ROBOT_ROLES) {
      const s = p.roles[role];
      if (!isObj(s)) {
        errors.push(`roles.${role} is required`);
        continue;
      }
      if (typeof s.label !== 'string' || typeof s.gearName !== 'string' || typeof s.blurb !== 'string') errors.push(`roles.${role} needs label, blurb and gearName`);
      if (!positive(s.baseHp)) errors.push(`roles.${role}.baseHp must be > 0`);
      if (!nonNeg(s.baseDamage) || !nonNeg(s.baseHeal)) errors.push(`roles.${role} damage and heal must be >= 0`);
    }
  }
  if (!isObj(p.partBonus)) errors.push('partBonus must be an object');
  else {
    for (const slot of PART_SLOTS) {
      const b = p.partBonus[slot];
      if (!isObj(b) || !nonNeg(b.hpPct) || !nonNeg(b.damagePct) || !nonNeg(b.heal)) {
        errors.push(`partBonus.${slot} needs non-negative hpPct, damagePct and heal`);
      } else if ((b.hpPct as number) + (b.damagePct as number) + (b.heal as number) <= 0) {
        errors.push(`partBonus.${slot} must improve something: every level shows a real before/after`);
      }
    }
  }
  if (Number.isInteger(max)) {
    const n = (max as number) + 1;
    if (!Array.isArray(p.upgradeCost) || p.upgradeCost.length !== n) errors.push(`upgradeCost must list ${n} rows (index = level reached)`);
    else for (let l = 2; l < n; l += 1) if (!supplies(p.upgradeCost[l]) || !nonNeg((p.upgradeCost[l] as Record<string, unknown>).credits)) errors.push(`upgradeCost level ${l} is invalid`);
    if (!Array.isArray(p.upgradeMinutes) || p.upgradeMinutes.length !== n) errors.push(`upgradeMinutes must list ${n} rows`);
    else
      for (let l = 2; l < n; l += 1) {
        if (!positive(p.upgradeMinutes[l])) errors.push(`upgradeMinutes level ${l} must be > 0`);
        else if (l > 2 && (p.upgradeMinutes[l] as number) < (p.upgradeMinutes[l - 1] as number)) errors.push(`upgradeMinutes level ${l} is shorter than level ${l - 1}`);
        else if ((p.upgradeMinutes[l] as number) > 72 * 60) errors.push(`upgradeMinutes level ${l} is over the 72 h build cap`);
      }
  }
  if (!supplies(p.repairCost) || !positive(p.repairMinutes)) errors.push('repairCost and repairMinutes are required');
  if (!supplies(p.remanufactureCost) || !positive(p.remanufactureMinutes)) errors.push('remanufactureCost and remanufactureMinutes are required');
  if (!(typeof p.emergencySlowdown === 'number' && p.emergencySlowdown >= 1)) errors.push('emergencySlowdown must be >= 1');
  if (!nonNeg(p.marchBaseSeconds) || !nonNeg(p.marchSecondsPerUnit) || !positive(p.holdSeconds)) errors.push('march and hold times must be non-negative (hold > 0)');
  return errors;
}

export function defineSandboxSeason(config: SandboxSeasonConfig): SandboxSeasonConfig {
  const errors = validateSandboxSeason(config);
  if (errors.length) throw new Error(`Invalid sandbox season ${String(config.id)}: ${errors.join('; ')}`);
  return Object.freeze(config);
}

/* -------------------------------------------------------------------------- */
/* Season 1, test build                                                       */
/* -------------------------------------------------------------------------- */

/** TEST cap: level 50 is the powered-armour milestone Matt described, not a confirmed game cap. */
const MAX = 50;
const scaleCost = (base: Supplies & {credits: number}, level: number) => {
  const m = 1 + 0.55 * (level - 2);
  return c(Math.round(base.fuel * m), Math.round(base.steel * m), Math.round(base.munitions * m), Math.round(base.alloy * m), Math.round(base.credits * m));
};

/**
 * Season 1 as a private test slice. Real: the season's name, ten weeks,
 * three exercises a day. TEST-ONLY: robot stats, the level-50 test cap, every
 * cost and every timer below - short enough to play on a phone, with the
 * sandbox's own test clock for the long ones.
 */
export const SANDBOX_SEASON_1_TEST = defineSandboxSeason({
  schema: SANDBOX_SEASON_SCHEMA,
  id: 'season-1-sandbox-test',
  version: 1,
  testOnly: true,
  label: 'Season 1 test slice (test-only balance)',
  seasonId: SEASON_1_ID,
  seasonName: SEASON_1_NAME,
  weeks: SEASON_WEEKS,
  dayMs: 24 * 3_600_000,
  exercisesPerDay: EXERCISES_PER_DAY,
  startSupplies: r(600, 700, 400, 400),
  startCredits: 150,

  robotMaxLevel: MAX,
  roles: {
    scout: {label: 'Scout', blurb: 'Marks a target: the whole Task Force hits it 25% harder. Light frame.', baseHp: 50, baseDamage: 10, baseHeal: 0, gearName: 'Sensor mast and carbine'},
    assault: {label: 'Assault', blurb: 'Heavy frame and the main gun. Draws the big robots onto its armour.', baseHp: 120, baseDamage: 30, baseHeal: 0, gearName: 'Shoulder cannon'},
    support: {label: 'Support', blurb: 'Patches the most damaged robot in the fight each round.', baseHp: 70, baseDamage: 6, baseHeal: 10, gearName: 'Repair arm and drone pack'},
  },
  partBonus: {
    head: {hpPct: 0, damagePct: 0.12, heal: 0},
    torso: {hpPct: 0.15, damagePct: 0, heal: 0},
    legs: {hpPct: 0.1, damagePct: 0.04, heal: 0},
    arms: {hpPct: 0, damagePct: 0.15, heal: 1},
    gear: {hpPct: 0.08, damagePct: 0.08, heal: 2},
  },
  upgradeCost: [c(0, 0, 0, 0, 0), c(0, 0, 0, 0, 0), ...Array.from({length: MAX - 1}, (_, i) => scaleCost(c(220, 280, 120, 160, 40), i + 2))],
  // 1 min to level 2, 30 min to level 10, then +3 min a level: 150 min to level 50.
  upgradeMinutes: [0, 0, 1, 2, 3, 5, 8, 12, 16, 20, 30, ...Array.from({length: MAX - 10}, (_, i) => 30 + 3 * (i + 1))],

  repairCost: r(80, 110, 0, 30),
  repairMinutes: 3,
  remanufactureCost: r(160, 260, 60, 110),
  remanufactureMinutes: 4,
  emergencySlowdown: 4,

  marchBaseSeconds: 8,
  marchSecondsPerUnit: 0.09,
  holdSeconds: 45,
});
