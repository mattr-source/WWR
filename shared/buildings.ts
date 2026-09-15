/**
 * The base: sixteen buildings that level, and the four resources they cost.
 *
 * Decided in docs/ASSET-BUILDING-UPGRADES-v1.md and docs/BUILDING-RESOURCES-v1.md
 * with the owner's rulings on top:
 *
 *   Every building starts at level 1, like every asset. The first thing a
 *   player buys is level 2. Ten levels a season, cap +10 per season, levels
 *   carry across seasons.
 *
 *   The Command Center is the ceiling for everything. It must FINISH level N
 *   before any building or Service Rank may START level N.
 *
 *   Buildings cost RESOURCES only - Fuel, Steel, Munitions, Alloy - never
 *   Tokens. Tokens and Command Credits buy resources at the Depot, at equal
 *   value, under a daily cap. Timers are absolute and cannot be bought down.
 *
 *   The Quartermaster Warehouse must be at least floor(N/2) to start level N
 *   of anything else, so a cost can never exceed what the base can hold.
 *
 * Each asset building lifts every attribute of every asset in its category
 * by BUILDING_STEP per level above the first, compounding: level 10 is
 * x1.02^9. That sits on top of Service Rank and under packages.
 */
import type {AssetCategory} from './assets';
import type {BuildingBalance} from './balance';

/* -------------------------------------------------------------------------- */
/* Buildings                                                                  */
/* -------------------------------------------------------------------------- */

export const LEVELLED_BUILDINGS = [
  'command_center',
  'armour_hub',
  'artillery_hub',
  'fixed_wing_hub',
  'rotary_hub',
  'drone_hub',
  'tactical_operations_center',
  'signals_center',
  'fuel_point',
  'fabrication_shop',
  'garrison_barracks',
  'recovery_yard',
  'quartermaster_warehouse',
  'engineer_support_yard',
  'depot',
  'alliance_trading_post',
] as const;
export type LevelledBuilding = (typeof LEVELLED_BUILDINGS)[number];

export function isLevelledBuilding(id: string): id is LevelledBuilding {
  return (LEVELLED_BUILDINGS as readonly string[]).includes(id);
}

/** The asset building for a category; naval has none until Season 3. */
export const HUB_OF_CATEGORY: Record<AssetCategory, LevelledBuilding | null> = {
  armour: 'armour_hub',
  artillery: 'artillery_hub',
  fixed_wing: 'fixed_wing_hub',
  rotary: 'rotary_hub',
  drone: 'drone_hub',
  naval: null,
};

export const CATEGORY_OF_HUB: Partial<Record<LevelledBuilding, AssetCategory>> = {
  armour_hub: 'armour',
  artillery_hub: 'artillery',
  fixed_wing_hub: 'fixed_wing',
  rotary_hub: 'rotary',
  drone_hub: 'drone',
};

export type BuildingLevels = Record<LevelledBuilding, number>;

export const BUILDING_START_LEVEL = 1;
export const BUILDING_LEVELS_PER_SEASON = 10;
export const BUILDING_MAX_LEVEL = 50;

/** A fresh base: everything at level 1, like every asset. */
export const NO_BUILDINGS: BuildingLevels = Object.fromEntries(
  LEVELLED_BUILDINGS.map((b) => [b, BUILDING_START_LEVEL]),
) as BuildingLevels;

export function buildingCapForSeason(season: number): number {
  return Math.min(BUILDING_MAX_LEVEL, Math.max(0, season) * BUILDING_LEVELS_PER_SEASON);
}

/* -------------------------------------------------------------------------- */
/* Resources                                                                  */
/* -------------------------------------------------------------------------- */

export const RESOURCE_KINDS = ['fuel', 'steel', 'munitions', 'alloy'] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];
export type Resources = Record<ResourceKind, number>;

export const RESOURCE_LABEL: Record<ResourceKind, string> = {
  fuel: 'Fuel',
  steel: 'Steel',
  munitions: 'Munitions',
  alloy: 'Alloy',
};

/** Which building makes each resource - named in the "need more" message. */
export const PRODUCER_OF: Record<ResourceKind, LevelledBuilding> = {
  fuel: 'fuel_point',
  steel: 'fabrication_shop',
  munitions: 'garrison_barracks',
  alloy: 'recovery_yard',
};

export const NO_RESOURCES: Resources = {fuel: 0, steel: 0, munitions: 0, alloy: 0};

const r = (fuel: number, steel: number, munitions: number, alloy: number): Resources => ({
  fuel,
  steel,
  munitions,
  alloy,
});

/**
 * Production per hour by the producer's level (index = level, row 0 unused).
 * Level 1 is what a fresh base makes.
 */
const PRODUCTION: Record<ResourceKind, readonly number[]> = {
  fuel: [0, 250, 400, 600, 900, 1300, 1800, 2400, 3200, 4200, 5500],
  steel: [0, 180, 300, 450, 650, 950, 1300, 1750, 2300, 3000, 3900],
  munitions: [0, 150, 250, 375, 550, 800, 1100, 1500, 2000, 2600, 3400],
  alloy: [0, 120, 200, 300, 450, 650, 900, 1200, 1600, 2100, 2800],
};

/** Storage per resource by Warehouse level, and the share a raid cannot take. */
const WAREHOUSE_CAP = [0, 6000, 10000, 16000, 24000, 36000, 50000, 68000, 90000, 116000, 150000];
const WAREHOUSE_PROTECTED = [0, 0.08, 0.16, 0.24, 0.32, 0.4, 0.48, 0.56, 0.64, 0.72, 0.8];

/** Past level 10 the last row grows by a fixed ratio until a later table lands. */
function row(table: readonly number[], level: number, growth: number): number {
  const l = Math.max(1, Math.floor(level));
  if (l < table.length) return table[l];
  return Math.round(table[table.length - 1] * growth ** (l - (table.length - 1)));
}

export function productionPerHour(levels: BuildingLevels): Resources {
  const out = {...NO_RESOURCES};
  for (const k of RESOURCE_KINDS) out[k] = row(PRODUCTION[k], levels[PRODUCER_OF[k]], 1.3);
  return out;
}

export function storageCap(levels: BuildingLevels): number {
  return row(WAREHOUSE_CAP, levels.quartermaster_warehouse, 1.3);
}

/**
 * The cap for one resource: there is none. Nothing a player holds - Fuel,
 * Steel, Munitions, Alloy - is ever capped (owner's ruling 2026-09-07: "there
 * should never be a cap on any materials or supplies"). Production never
 * stops, a Depot purchase is never refused for space, a reward is never
 * clipped, raid loot is never left behind for want of room.
 *
 * The Quartermaster Warehouse keeps its other job, the raid-protected share.
 * `storageCap` below is retained only as a figure the design table still
 * names; nothing applies it. The signature stays so every call site reads
 * the rule from one place.
 */
export function capFor(_kind: ResourceKind, _levels: BuildingLevels): number {
  return Number.POSITIVE_INFINITY;
}

export function protectedShare(levels: BuildingLevels): number {
  const l = Math.max(1, Math.floor(levels.quartermaster_warehouse));
  return l < WAREHOUSE_PROTECTED.length ? WAREHOUSE_PROTECTED[l] : 0.8;
}

/** A successful raid takes exactly this share of what the Warehouse does not protect. */
export const RAID_SHARE = 0.05;

export function raidLoot(stock: Resources, levels: BuildingLevels): Resources {
  const safe = protectedShare(levels);
  const out = {...NO_RESOURCES};
  for (const k of RESOURCE_KINDS) {
    out[k] = Math.min(stock[k], Math.floor(Math.max(0, stock[k]) * (1 - safe) * RAID_SHARE));
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* The Depot sells resources                                                  */
/* -------------------------------------------------------------------------- */

/** Units of resource one Token or one Credit buys. */
export const RESOURCE_PER_UNIT: Record<ResourceKind, number> = {
  fuel: 100,
  steel: 80,
  munitions: 70,
  alloy: 60,
};

/** Most of each resource an account may buy per game day. */
export const DAILY_RESOURCE_CAP: Record<ResourceKind, number> = {
  fuel: 20000,
  steel: 16000,
  munitions: 14000,
  alloy: 12000,
};

/* -------------------------------------------------------------------------- */
/* What a level costs                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Cost tables from BUILDING RESOURCES v1 §3-4, indexed by the level being
 * built. Row 1 is the level everything starts at and is never bought; the
 * designer's tables are reproduced whole so they can be checked against the
 * document line by line.
 */
const HUB_SCALE = [0, 1, 1.5, 2.2, 3.2, 4.6, 6.4, 8.8, 12, 16.4, 22];
const HUB_MINUTES = [0, 20, 45, 90, 180, 360, 540, 720, 1080, 1440, 2160];
const DEPT_SCALE = [0, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24];
const DEPT_MINUTES = [0, 20, 40, 80, 160, 300, 450, 600, 900, 1200, 1800];
const PRODUCER_MINUTES = [0, 15, 30, 60, 120, 240, 360, 480, 720, 960, 1440];

const BASE_ROW: Record<Exclude<LevelledBuilding, 'command_center'>, Resources> = {
  armour_hub: r(250, 750, 200, 250),
  artillery_hub: r(200, 250, 750, 250),
  fixed_wing_hub: r(750, 250, 200, 250),
  rotary_hub: r(500, 250, 250, 500),
  drone_hub: r(250, 200, 250, 750),
  tactical_operations_center: r(300, 300, 400, 200),
  signals_center: r(150, 200, 100, 500),
  fuel_point: r(100, 300, 100, 200),
  fabrication_shop: r(200, 200, 200, 400),
  garrison_barracks: r(200, 200, 500, 100),
  recovery_yard: r(200, 250, 100, 400),
  quartermaster_warehouse: r(100, 500, 100, 500),
  engineer_support_yard: r(200, 400, 200, 400),
  depot: r(200, 300, 300, 300),
  alliance_trading_post: r(300, 200, 200, 300),
};

const COMMAND_CENTER_ROWS: ReadonlyArray<{cost: Resources; minutes: number}> = [
  {cost: NO_RESOURCES, minutes: 0},
  {cost: r(900, 700, 600, 500), minutes: 60},
  {cost: r(1350, 1050, 900, 750), minutes: 120},
  {cost: r(2000, 1600, 1350, 1100), minutes: 240},
  {cost: r(3000, 2300, 2000, 1650), minutes: 480},
  {cost: r(4400, 3400, 3000, 2500), minutes: 720},
  {cost: r(6400, 5000, 4400, 3700), minutes: 1080},
  {cost: r(9200, 7200, 6400, 5400), minutes: 1440},
  {cost: r(13200, 10400, 9200, 7800), minutes: 2160},
  {cost: r(18800, 15000, 13200, 11200), minutes: 2880},
  {cost: r(24000, 21600, 19000, 16200), minutes: 3600},
];

const PRODUCERS: ReadonlySet<LevelledBuilding> = new Set([
  'fuel_point',
  'fabrication_shop',
  'garrison_barracks',
  'recovery_yard',
]);
const HUBS: ReadonlySet<LevelledBuilding> = new Set([
  'armour_hub',
  'artillery_hub',
  'fixed_wing_hub',
  'rotary_hub',
  'drone_hub',
]);

export interface BuildingStep {
  cost: Resources;
  ms: number;
}

/** Which timer table a building reads. */
export type TimerGroup = 'commandCenter' | 'hub' | 'producer' | 'department';
export const TIMER_GROUPS: readonly TimerGroup[] = ['commandCenter', 'hub', 'producer', 'department'];

export function timerGroupOf(building: LevelledBuilding): TimerGroup {
  if (building === 'command_center') return 'commandCenter';
  if (HUBS.has(building)) return 'hub';
  return PRODUCERS.has(building) ? 'producer' : 'department';
}

/** The designed levels a balance profile may retune: 2 to 10, index 0 = level 2. */
export const DESIGNED_FROM_LEVEL = 2;
export const DESIGNED_TO_LEVEL = 10;

/**
 * The timer tables as shipped, levels 2-10 in minutes. The default balance
 * profile (shared/balance.ts) IS these arrays, so the default can never drift
 * from what the game charged before profiles existed.
 */
export const SHIPPED_BUILDING_MINUTES: Readonly<Record<TimerGroup, readonly number[]>> = {
  commandCenter: COMMAND_CENTER_ROWS.slice(2).map((row) => row.minutes),
  hub: HUB_MINUTES.slice(2),
  producer: PRODUCER_MINUTES.slice(2),
  department: DEPT_MINUTES.slice(2),
};

/**
 * What reaching `toLevel` costs and how long it takes.
 *
 * `balance` is the season's balance profile. Absent, the shipped tables
 * apply exactly as they always have. A profile retunes only the designed
 * levels 2-10 (timers for every group, and a Command Center cost
 * multiplier); past 10 the placeholder extrapolation runs from the profile's
 * level-10 row. A profile's `maxBuildMinutes`, when set, clamps every level.
 *
 * Only a job's START reads this. The job row stores its completion instant,
 * so a profile changed while a timer runs never moves that timer.
 */
export function buildingStep(
  building: LevelledBuilding,
  toLevel: number,
  balance?: BuildingBalance,
): BuildingStep {
  const l = Math.max(2, Math.floor(toLevel));
  const past = Math.max(0, l - 10);
  const idx = Math.min(10, l);
  const minutesTable = balance ? balance.timers : SHIPPED_BUILDING_MINUTES;
  let minutes = Math.round(minutesTable[timerGroupOf(building)][idx - 2] * 1.5 ** past);
  if (balance && balance.maxBuildMinutes !== null) minutes = Math.min(minutes, balance.maxBuildMinutes);
  if (building === 'command_center') {
    const rowAt = COMMAND_CENTER_ROWS[idx];
    const multiplier = balance ? balance.commandCenterCostMultiplier[idx - 2] : 1;
    return {
      cost: scale(rowAt.cost, 1.3 ** past * multiplier),
      ms: minutes * 60_000,
    };
  }
  const base = BASE_ROW[building];
  const scaleTable = HUBS.has(building) ? HUB_SCALE : DEPT_SCALE;
  return {
    cost: scale(base, scaleTable[idx] * 1.3 ** past),
    ms: minutes * 60_000,
  };
}

function scale(cost: Resources, by: number): Resources {
  const out = {...NO_RESOURCES};
  for (const k of RESOURCE_KINDS) out[k] = Math.round(cost[k] * by);
  return out;
}

/** The Second Engineer Team: one permanent extra build queue. */
export const SECOND_TEAM = {
  requiresEngineerYard: 10,
  cost: r(0, 12000, 0, 12000),
  currency: 1500,
  ms: 24 * 3_600_000,
};

/* -------------------------------------------------------------------------- */
/* Gates                                                                      */
/* -------------------------------------------------------------------------- */

/** Warehouse level needed to start level N of anything else. */
export function warehouseNeeded(toLevel: number): number {
  return Math.floor(toLevel / 2);
}

/**
 * Why a building may not start its next level, or null if it may.
 *
 * In the order a player wants to hear them: the season cap, the Command
 * Center ceiling, the Warehouse. The queue and the resources are the
 * server's to check against live rows.
 */
export function buildingBlock(
  building: LevelledBuilding,
  levels: BuildingLevels,
  season: number,
): string | null {
  const next = levels[building] + 1;
  const cap = buildingCapForSeason(season);
  if (next > cap) return `Season ${season} caps buildings at level ${cap}.`;
  if (building !== 'command_center' && next > levels.command_center) {
    return `Command Center must reach level ${next} first.`;
  }
  const wh = warehouseNeeded(next);
  if (building !== 'quartermaster_warehouse' && levels.quartermaster_warehouse < wh) {
    return `Quartermaster Warehouse must reach level ${wh} first.`;
  }
  return null;
}

/** The resources a stock is short of a cost, by kind; empty when it covers it. */
export function shortfall(stock: Resources, cost: Resources): Partial<Resources> {
  const out: Partial<Resources> = {};
  for (const k of RESOURCE_KINDS) if (stock[k] < cost[k]) out[k] = cost[k] - stock[k];
  return out;
}

/**
 * The ceiling the Command Center puts on a Service Rank. A rank may not stand
 * above the Command Center's level.
 */
export function rankCeiling(levels: BuildingLevels): number {
  return Math.max(BUILDING_START_LEVEL, levels.command_center);
}

/* -------------------------------------------------------------------------- */
/* What an asset building does                                                */
/* -------------------------------------------------------------------------- */

/** Per level above the first, on every attribute of the category. */
export const BUILDING_STEP = 1.02;

export function buildingBoost(level: number): number {
  return BUILDING_STEP ** Math.max(0, Math.floor(level) - BUILDING_START_LEVEL);
}

export function categoryBoost(levels: BuildingLevels, category: AssetCategory): number {
  const hub = HUB_OF_CATEGORY[category];
  return hub ? buildingBoost(levels[hub]) : 1;
}

/* -------------------------------------------------------------------------- */
/* What the departments do - BUILDING EFFECTS v1                              */
/* -------------------------------------------------------------------------- */

/**
 * Every curve runs from nothing at level 1 (the owner's ruling: everything
 * starts at 1 and level 1 is the start, not a bonus) to the document's
 * level-10 endpoint, in equal steps.
 */
function ramp(level: number, at10: number): number {
  // Past 10 holds at the level-10 value until a later season's table lands;
  // the document's caps (x0.70 timers, x1.50 march) are hard.
  const l = Math.max(1, Math.min(10, Math.floor(level)));
  return (at10 - 1) * ((l - 1) / 9);
}

/** The most any combination of march bonuses may reach. */
export const MARCH_TOTAL_CAP = 1.5;

/** Tactical Operations Center: every Task Force marches faster. x1.20 at 10. */
export function tocMultiplier(level: number): number {
  return 1 + ramp(level, 1.2);
}

/** The whole march multiplier: Drone Network x TOC, capped. */
export function marchMultiplier(droneNetwork: number, tocLevel: number): number {
  return Math.min(MARCH_TOTAL_CAP, droneNetwork * tocMultiplier(tocLevel));
}

/** Engineer Support Yard: new building timers are shorter. x0.70 at 10. */
export function engineerMultiplier(level: number): number {
  return 1 + ramp(level, 0.7);
}

/** Depot: the daily Supplies caps are higher. x1.50 at 10. Rates never change. */
export function depotCapMultiplier(level: number): number {
  return 1 + ramp(level, 1.5);
}

/** Signals Center: an inbound march shows this long before it lands. */
export function signalsLeadMs(level: number): number {
  return Math.max(1, Math.floor(level)) * 3 * 60_000;
}

/** Alliance Trading Post: open barter offers at once (barter is not built yet). */
export function tradingOffers(level: number): number {
  return Math.max(1, Math.floor(level));
}

/**
 * The panel line: what the building does at this level, and what the next
 * one gives. One place, so the sheet and the Command Center's list agree.
 */
export function effectLine(building: LevelledBuilding, level: number, cap: number): string {
  const next = level + 1;
  const hasNext = next <= cap;
  const pct = (m: number) => `${Math.round(Math.abs(m - 1) * 1000) / 10}%`;
  const line = (now: string, nextLine: string) => (hasNext ? `${now} Next: ${nextLine}` : now);
  const category = CATEGORY_OF_HUB[building];
  if (category) {
    return line(
      `All ${category.replace('_', '-')} assets: +${pct(buildingBoost(level))} to all five stats.`,
      `+${pct(buildingBoost(next))}.`,
    );
  }
  switch (building) {
    case 'command_center':
      return line(
        `Buildings and Service Ranks may advance to ${level}.`,
        `${next}${next === 5 ? ', and Task Force Bravo' : next === 10 ? ', and Task Force Charlie (Delta for sale)' : next === 20 ? ', and Task Force Delta once the others are at rank 20' : ''}${next <= 10 ? `, and tier-${next} assets` : ''}.`,
      );
    case 'tactical_operations_center':
      return line(
        `All Task Forces march ${pct(tocMultiplier(level))} faster. With the Drone Network, capped at x${MARCH_TOTAL_CAP.toFixed(2)}.`,
        `${pct(tocMultiplier(next))}.`,
      );
    case 'signals_center':
      return line(
        `Incoming attacks show ${signalsLeadMs(level) / 60_000} minutes before they land.`,
        `${signalsLeadMs(next) / 60_000} minutes.`,
      );
    case 'quartermaster_warehouse': {
      const at = (l: number) => ({...NO_BUILDINGS, quartermaster_warehouse: l});
      return line(
        `${Math.round(protectedShare(at(level)) * 100)}% of every stock is raid-protected. Storage is unlimited.`,
        `${Math.round(protectedShare(at(next)) * 100)}% protected.`,
      );
    }
    case 'engineer_support_yard':
      return line(
        `New building timers are ${pct(engineerMultiplier(level))} shorter.${level >= SECOND_TEAM.requiresEngineerYard ? ' The Second Engineer Team can be hired.' : ''}`,
        `${pct(engineerMultiplier(next))}${next === SECOND_TEAM.requiresEngineerYard ? ', and the Second Engineer Team' : ''}.`,
      );
    case 'depot':
      return line(
        `Daily Supplies limits are +${pct(depotCapMultiplier(level))} higher. Rates stay fixed.`,
        `+${pct(depotCapMultiplier(next))}.`,
      );
    case 'alliance_trading_post':
      return line(
        `You may keep ${tradingOffers(level)} alliance barter offer${tradingOffers(level) === 1 ? '' : 's'} open.`,
        `${tradingOffers(next)}.`,
      );
    default: {
      const kind = RESOURCE_KINDS.find((k) => PRODUCER_OF[k] === building);
      if (!kind) return '';
      const at = (l: number) => ({...NO_BUILDINGS, [building]: l});
      return line(
        `Produces ${productionPerHour(at(level))[kind].toLocaleString()} ${RESOURCE_LABEL[kind]}/hour.`,
        `${productionPerHour(at(next))[kind].toLocaleString()}/hour.`,
      );
    }
  }
}
