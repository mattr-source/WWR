/**
 * The base: sixteen levelled buildings, four resources, and the queue.
 *
 * Rules, none trusted from the browser:
 *
 *   The COST is recomputed from shared/buildings.ts. A request names a
 *   building, never a price or a level.
 *
 *   RESOURCES settle on read. Production since resources_at is added now,
 *   capped by the Warehouse, and nothing runs in the background.
 *
 *   The TIMER is an absolute instant. A finished job is folded into
 *   base_levels by the first read past completes_at, once.
 *
 *   The QUEUE is a count checked inside the insert. One job per building is
 *   an index; one (or two, with the Second Engineer Team) per base is the
 *   WHERE clause on the insert, so two tabs cannot both start a third.
 *
 *   A SPEND is atomic: the resource debit is a conditional UPDATE that only
 *   succeeds if the stock still covers the cost, and the job insert runs in
 *   the same batch, guarded on that debit having landed.
 */
import {
  type BuildingLevels,
  type LevelledBuilding,
  type ResourceKind,
  type Resources,
  DAILY_RESOURCE_CAP,
  NO_BUILDINGS,
  NO_RESOURCES,
  RESOURCE_KINDS,
  RESOURCE_LABEL,
  RESOURCE_PER_UNIT,
  PRODUCER_OF,
  SECOND_TEAM,
  buildingBlock,
  buildingStep,
  capFor,
  depotCapMultiplier,
  engineerMultiplier,
  isLevelledBuilding,
  productionPerHour,
  shortfall,
  storageCap,
} from '../shared/buildings';
import {type BalanceProfile, DEFAULT_BALANCE_PROFILE} from '../shared/balance';
import {type Split, defaultSplit, splitIsValid} from '../shared/economy';
import {gameDayStart} from '../shared/gametime';
import {type Wallet, claimWallet, ledger, settleWallet} from './upgrades';
import {meterProduction} from './dailyOps';

export interface BaseJob {
  id: string;
  building: LevelledBuilding;
  toLevel: number;
  startedAt: number;
  completesAt: number;
}

export interface BaseState {
  levels: BuildingLevels;
  /** Jobs still running. */
  jobs: BaseJob[];
  /** How many may run at once. */
  queues: number;
  /** Second Engineer Team: the instant it is ready, or null. */
  secondTeamAt: number | null;
  resources: Resources;
  /** The stock's revision; a spend claims it. */
  stockRev: number;
  productionPerHour: Resources;
  storageCap: number;
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

export async function readLevels(db: D1Database, playerId: string): Promise<BuildingLevels> {
  const rows = await db
    .prepare(`SELECT building, level FROM base_levels WHERE player_id = ?1`)
    .bind(playerId)
    .all<{building: string; level: number}>();
  const levels: BuildingLevels = {...NO_BUILDINGS};
  for (const r of rows.results ?? []) {
    // A row below the start level is a legacy zero; every building begins at 1.
    if (isLevelledBuilding(r.building)) levels[r.building] = Math.max(NO_BUILDINGS[r.building], r.level);
  }
  return levels;
}

/**
 * Fold every finished job into base_levels, once each.
 *
 * The claim is a conditional UPDATE on the job row; the level write happens
 * only where the claim landed, so two reads past the same completes_at
 * apply a level once between them. Returns what is still running.
 */
async function settleJobs(db: D1Database, playerId: string, now: number): Promise<BaseJob[]> {
  const rows = await db
    .prepare(
      `SELECT id, building, to_level AS toLevel, started_at AS startedAt, completes_at AS completesAt
         FROM base_jobs WHERE player_id = ?1 AND applied_at IS NULL ORDER BY completes_at`,
    )
    .bind(playerId)
    .all<BaseJob>();
  const running: BaseJob[] = [];
  for (const job of rows.results ?? []) {
    if (job.completesAt > now || !isLevelledBuilding(job.building)) {
      if (isLevelledBuilding(job.building)) running.push(job);
      continue;
    }
    const claimed = await db
      .prepare(`UPDATE base_jobs SET applied_at = ?2 WHERE id = ?1 AND applied_at IS NULL`)
      .bind(job.id, now)
      .run();
    if (claimed.meta.changes) {
      await db
        .prepare(
          `INSERT INTO base_levels (player_id, building, level) VALUES (?1, ?2, ?3)
             ON CONFLICT(player_id, building) DO UPDATE SET level = MAX(level, excluded.level)`,
        )
        .bind(playerId, job.building, job.toLevel)
        .run();
    }
  }
  return running;
}

/**
 * Production since the last look, added now and capped by the Warehouse.
 *
 * Levels are read AFTER finished jobs are applied, so a producer that
 * finished an hour ago earns at its new rate - approximately: the whole gap
 * is paid at the current rate, which errs a little in the player's favour
 * and never against them.
 */
async function settleResources(
  db: D1Database,
  playerId: string,
  levels: BuildingLevels,
  now: number,
): Promise<{stock: Resources; rev: number; elapsedMs: number}> {
  const base = await db
    .prepare(
      `SELECT fuel, steel, munitions, alloy, resources_at AS at, stock_rev AS rev FROM bases WHERE player_id = ?1`,
    )
    .bind(playerId)
    .first<Resources & {at: number; rev: number}>();
  if (!base) return {stock: {...NO_RESOURCES}, rev: 0, elapsedMs: 0};
  const rate = productionPerHour(levels);
  const hours = Math.max(0, now - base.at) / 3_600_000;
  const out = {...NO_RESOURCES};
  for (const k of RESOURCE_KINDS) {
    // Production fills to the cap and stops; a stock already above the cap
    // (a raid protected it, a cap shrank) is left where it is, never cut.
    // Fuel has no cap.
    const capK = capFor(k, levels);
    const grown = Math.floor(base[k] + rate[k] * hours);
    out[k] = base[k] >= capK ? base[k] : Math.min(capK, grown);
  }
  await db
    .prepare(
      `UPDATE bases SET fuel = ?2, steel = ?3, munitions = ?4, alloy = ?5, resources_at = ?6
        WHERE player_id = ?1 AND resources_at = ?7`,
    )
    .bind(playerId, out.fuel, out.steel, out.munitions, out.alloy, now, base.at)
    .run();
  return {stock: out, rev: base.rev, elapsedMs: Math.max(0, now - base.at)};
}

export async function readBase(db: D1Database, playerId: string, now: number): Promise<BaseState> {
  const jobs = await settleJobs(db, playerId, now);
  const [levels, team] = await Promise.all([
    readLevels(db, playerId),
    db
      .prepare(`SELECT second_team_at AS at FROM players WHERE id = ?1`)
      .bind(playerId)
      .first<{at: number | null}>(),
  ]);
  const {stock, rev, elapsedMs} = await settleResources(db, playerId, levels, now);
  // Daily Operations, Industry lane: the production time just settled counts
  // toward today's hour. After the settle, so a failure here cannot stop it.
  if (elapsedMs > 0) await meterProduction(db, playerId, elapsedMs, now).catch(() => undefined);
  const secondTeamAt = team?.at ?? null;
  return {
    levels,
    jobs,
    queues: secondTeamAt !== null && secondTeamAt <= now ? 2 : 1,
    secondTeamAt,
    resources: stock,
    stockRev: rev,
    productionPerHour: productionPerHour(levels),
    storageCap: storageCap(levels),
  };
}

/* -------------------------------------------------------------------------- */
/* Spending resources                                                         */
/* -------------------------------------------------------------------------- */

/** "Need 600 more Steel. Produce it at Base Fabrication Shop or buy it at the Depot." */
export function shortMessage(
  short: Partial<Resources>,
  name: (b: LevelledBuilding) => string,
): string {
  const k = RESOURCE_KINDS.find((x) => short[x] !== undefined);
  if (!k) return 'Not enough resources.';
  return `Need ${short[k]!.toLocaleString()} more ${RESOURCE_LABEL[k]}. Produce it at ${name(PRODUCER_OF[k])} or buy it at the Depot.`;
}

/**
 * Debit resources, claiming the stock revision that was read. The WHERE is
 * the whole guarantee: a second request racing this one finds the revision
 * moved on (or the stock short) and changes nothing.
 */
function debit(db: D1Database, playerId: string, cost: Resources, rev: number): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE bases
          SET fuel = fuel - ?2, steel = steel - ?3, munitions = munitions - ?4, alloy = alloy - ?5,
              stock_rev = stock_rev + 1
        WHERE player_id = ?1 AND stock_rev = ?6
          AND fuel >= ?2 AND steel >= ?3 AND munitions >= ?4 AND alloy >= ?5`,
    )
    .bind(playerId, cost.fuel, cost.steel, cost.munitions, cost.alloy, rev);
}

/** True where the debit above landed: the stock now carries rev + 1. */
const DEBITED = `EXISTS (SELECT 1 FROM bases WHERE player_id = ?2 AND stock_rev = ?8)`;

export type StartResult = {ok: true; base: BaseState} | {ok: false; error: string};

/**
 * Start a building's next level.
 *
 * Gates in the order a player wants to hear them: the season cap, the Command
 * Center ceiling, the Warehouse, the queue, then the resources. The level
 * built is always current + 1.
 *
 * `balance` prices the level and its timer (shared/balance.ts). It is read
 * here, at the start, and nowhere else: the job row keeps the completion
 * instant, so a later profile change leaves running timers where they are.
 */
export async function startLevel(
  db: D1Database,
  playerId: string,
  buildingId: string,
  season: number,
  now: number,
  name: (b: LevelledBuilding) => string,
  balance: BalanceProfile = DEFAULT_BALANCE_PROFILE,
): Promise<StartResult> {
  if (!isLevelledBuilding(buildingId)) return {ok: false, error: 'That building does not level.'};
  const building = buildingId;

  const base = await readBase(db, playerId, now);
  const blocked = buildingBlock(building, base.levels, season);
  if (blocked) return {ok: false, error: blocked};
  if (base.jobs.some((j) => j.building === building)) {
    return {ok: false, error: `${name(building)} is already being upgraded.`};
  }
  if (base.jobs.length >= base.queues) {
    return {
      ok: false,
      error:
        base.queues === 1
          ? 'The engineers are busy. One upgrade at a time.'
          : 'Both engineer teams are busy.',
    };
  }

  const toLevel = base.levels[building] + 1;
  const step = buildingStep(building, toLevel, balance);
  // The Engineer Support Yard shortens timers started after its level is
  // complete; a timer already running never changes. BUILDING EFFECTS v1.
  const ms = Math.round(step.ms * engineerMultiplier(base.levels.engineer_support_yard));
  const short = shortfall(base.resources, step.cost);
  if (Object.keys(short).length > 0) return {ok: false, error: shortMessage(short, name)};

  const id = crypto.randomUUID();
  const result = await db.batch([
    debit(db, playerId, step.cost, base.stockRev),
    // Guarded three ways: the debit landed, the queue has room, and the
    // per-building index. Any failure rolls the batch back.
    db
      .prepare(
        `INSERT INTO base_jobs (id, player_id, building, to_level, started_at, completes_at)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6
          WHERE ${DEBITED}
            AND (SELECT COUNT(*) FROM base_jobs WHERE player_id = ?2 AND applied_at IS NULL) < ?7`,
      )
      .bind(id, playerId, building, toLevel, now, now + ms, base.queues, base.stockRev + 1),
  ]);
  if (!result[0].meta.changes || !result[1].meta.changes) {
    return {ok: false, error: 'Your stock changed. Try that again.'};
  }
  return {ok: true, base: await readBase(db, playerId, now)};
}

/* -------------------------------------------------------------------------- */
/* The Depot sells resources                                                  */
/* -------------------------------------------------------------------------- */

export type BuyResult =
  | {ok: true; base: BaseState; wallet: Wallet; bought: number}
  | {ok: false; error: string};

/**
 * Buy `amount` of a resource for Tokens and/or Credits at the fixed rate.
 *
 * Capped per game day per resource whatever the currency mix, and refused
 * when it would not fit in the Warehouse - the player spends or builds
 * storage first. Rounds the purchase down to whole currency units.
 */
export async function buyResource(
  db: D1Database,
  playerId: string,
  kind: string,
  amount: number,
  split: Split | null,
  now: number,
): Promise<BuyResult> {
  if (!(RESOURCE_KINDS as readonly string[]).includes(kind)) return {ok: false, error: 'No such resource.'};
  const k = kind as ResourceKind;
  const per = RESOURCE_PER_UNIT[k];
  const units = Math.floor(Number(amount) / per);
  if (!Number.isFinite(units) || units <= 0) return {ok: false, error: `Buy at least ${per} ${RESOURCE_LABEL[k]}.`};
  const bought = units * per;

  const base = await readBase(db, playerId, now);
  const day = gameDayStart(now);
  const today = await db
    .prepare(`SELECT amount FROM depot_purchases WHERE player_id = ?1 AND day = ?2 AND resource = ?3`)
    .bind(playerId, day, k)
    .first<{amount: number}>();
  const soFar = today?.amount ?? 0;
  // The Depot's level raises the daily caps; the rates never move.
  const cap = Math.floor(DAILY_RESOURCE_CAP[k] * depotCapMultiplier(base.levels.depot));
  if (soFar + bought > cap) {
    const left = Math.max(0, cap - soFar);
    return {ok: false, error: `Daily ${RESOURCE_LABEL[k]} limit: ${left.toLocaleString()} more today.`};
  }

  const wallet = await settleWallet(db, playerId, now);
  const chosen = split ?? defaultSplit(units, wallet.credits);
  if (!splitIsValid(chosen, units)) return {ok: false, error: `That does not add up to ${units}.`};
  if (chosen.tokens > wallet.tokens || chosen.credits > wallet.credits) {
    return {ok: false, error: 'Not enough to cover that.'};
  }

  const column = k; // resource kinds are the column names on bases
  await db.batch([
    claimWallet(db, playerId, wallet, chosen),
    db
      .prepare(
        `UPDATE bases SET ${column} = ${column} + ?2
          WHERE player_id = ?1 AND EXISTS (SELECT 1 FROM players WHERE id = ?1 AND wallet_rev = ?3)`,
      )
      .bind(playerId, bought, wallet.rev + 1),
    db
      .prepare(
        `INSERT INTO depot_purchases (player_id, day, resource, amount)
         SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM players WHERE id = ?1 AND wallet_rev = ?5)
         ON CONFLICT(player_id, day, resource) DO UPDATE SET amount = amount + excluded.amount`,
      )
      .bind(playerId, day, k, bought, wallet.rev + 1),
    ledger(db, playerId, 'resources', chosen, k, `${bought} ${RESOURCE_LABEL[k]}`, now, wallet.rev),
  ]);
  const after = await db
    .prepare(`SELECT tokens, credits, wallet_rev AS rev FROM players WHERE id = ?1`)
    .bind(playerId)
    .first<Wallet>();
  if (!after || after.rev === wallet.rev) return {ok: false, error: 'Your balance changed. Try that again.'};
  return {ok: true, base: await readBase(db, playerId, now), wallet: after, bought};
}

/* -------------------------------------------------------------------------- */
/* The Second Engineer Team                                                   */
/* -------------------------------------------------------------------------- */

export async function buySecondTeam(
  db: D1Database,
  playerId: string,
  split: Split | null,
  now: number,
  name: (b: LevelledBuilding) => string,
): Promise<BuyResult> {
  const base = await readBase(db, playerId, now);
  if (base.secondTeamAt !== null) return {ok: false, error: 'You already have the Second Engineer Team.'};
  if (base.levels.engineer_support_yard < SECOND_TEAM.requiresEngineerYard) {
    return {
      ok: false,
      error: `${name('engineer_support_yard')} must reach level ${SECOND_TEAM.requiresEngineerYard} first.`,
    };
  }
  const short = shortfall(base.resources, SECOND_TEAM.cost);
  if (Object.keys(short).length > 0) return {ok: false, error: shortMessage(short, name)};

  const wallet = await settleWallet(db, playerId, now);
  const chosen = split ?? defaultSplit(SECOND_TEAM.currency, wallet.credits);
  if (!splitIsValid(chosen, SECOND_TEAM.currency)) {
    return {ok: false, error: `That does not add up to ${SECOND_TEAM.currency}.`};
  }
  if (chosen.tokens > wallet.tokens || chosen.credits > wallet.credits) {
    return {ok: false, error: 'Not enough to cover that.'};
  }

  const result = await db.batch([
    claimWallet(db, playerId, wallet, chosen),
    debit(db, playerId, SECOND_TEAM.cost, base.stockRev),
    db
      .prepare(
        `UPDATE players SET second_team_at = ?2
          WHERE id = ?1 AND second_team_at IS NULL AND wallet_rev = ?3
            AND EXISTS (SELECT 1 FROM bases WHERE player_id = ?1 AND stock_rev = ?4)`,
      )
      .bind(playerId, now + SECOND_TEAM.ms, wallet.rev + 1, base.stockRev + 1),
    ledger(db, playerId, 'second_team', chosen, 'second_team', 'Second Engineer Team', now, wallet.rev),
  ]);
  if (!result[2].meta.changes) return {ok: false, error: 'That did not go through. Try again.'};
  const after = await db
    .prepare(`SELECT tokens, credits, wallet_rev AS rev FROM players WHERE id = ?1`)
    .bind(playerId)
    .first<Wallet>();
  return {ok: true, base: await readBase(db, playerId, now), wallet: after ?? wallet, bought: 1};
}
