/**
 * Command Center 1 -> 10 pacing over a 70-day season, for a balance profile.
 *
 *   npm run sim:pacing
 *
 * Deterministic: no randomness except the game's own seeded exercise picker,
 * seeded by day. Every price, timer, production rate, Depot rate and cap,
 * Engineer and Depot effect and gate is IMPORTED from shared/ - the same
 * functions the Worker charges from - so a table change shows up here with
 * nothing to re-copy. The only hand-copied number is the starting stock,
 * which lives in migrations/0001_init.sql column defaults and is pinned by a
 * test against the migrated schema.
 *
 * WHAT THE PLAYER HAS (actual mechanics, current code):
 *   - production from the four producers, settled continuously;
 *   - Daily Operations lane rewards and the 4-of-6 Cache, on days they play;
 *   - map exercises (the day's three, from the game's own picker), claimed
 *     up to a per-player count;
 *   - the Arena Field Cache and Full Engagement bonus;
 *   - Command Credits (earned) and Tokens (bought, at most 10,000 per Monday
 *     week) spent 1:1 at the Depot's fixed rates under its daily caps, which
 *     the Depot's level raises. That is the ONLY place money touches building
 *     progress today: timers cannot be bought down, and the Second Engineer
 *     Team needs Engineer Yard 10, which needs Command Center 10.
 *
 * WHAT IT LEAVES OUT (so results lean slow, never fast):
 *   - weekly Arena / Warfront / Convoy rank rewards (rank-dependent);
 *   - raids, both loot taken and loot lost;
 *   - the Worker paying a finished producer's new rate for the whole gap
 *     since the last read (a little in the player's favour);
 *   - the 100,000 test-Token floor (a test-realm switch, not a player).
 *
 * HYPOTHETICAL options (`hypothetical`) are what-ifs for design discussion.
 * None exists in the game and none is authorized; results carry a label.
 */
import {type BalanceProfile} from '../../shared/balance';
import {
  type BuildingLevels,
  type LevelledBuilding,
  type ResourceKind,
  type Resources,
  DAILY_RESOURCE_CAP,
  LEVELLED_BUILDINGS,
  NO_BUILDINGS,
  NO_RESOURCES,
  PRODUCER_OF,
  RESOURCE_KINDS,
  RESOURCE_PER_UNIT,
  SECOND_TEAM,
  buildingBlock,
  buildingStep,
  depotCapMultiplier,
  engineerMultiplier,
  productionPerHour,
  warehouseNeeded,
} from '../../shared/buildings';
import {FIELD_CACHE, FULL_ENGAGEMENT_BONUS} from '../../shared/arena';
import {EXERCISES_PER_DAY, exerciseReward, hashSeed, pickDailyTypes, seeded} from '../../shared/exercises';
import {SEASON_WEEKS} from '../../shared/season';
import {type Lane, type Reward, LANES, LANES_FOR_CACHE, cacheReward, laneReward} from '../../shared/season1Ops';

export const SEASON_DAYS = SEASON_WEEKS * 7;
/** The standing ruling: at most this many Tokens bought per Monday-to-Monday week. */
export const WEEKLY_TOKEN_CAP = 10_000;
/**
 * Matt, 2026-09-15: "in a 10 week season f2p should be level 10 by week 8 and
 * whales within 3 weeks". Read as pacing windows, not ceilings - the shipped
 * game already puts a free player at CC10 inside three weeks, which is the
 * problem the target exists to fix. Days are fractional from season day 0.
 */
export const TARGETS = {
  free: {from: 49, to: 56},
  spender: {from: 14, to: 21},
} as const;

export type Verdict = 'early' | 'on target' | 'late' | 'not in season';

export function verdict(day: number | null, window: {from: number; to: number}): Verdict {
  if (day === null) return 'not in season';
  if (day < window.from) return 'early';
  return day <= window.to ? 'on target' : 'late';
}

/** migrations/0001_init.sql column defaults; the signup insert sets none (worker/index.ts seedBase). */
export const START_STOCK: Resources = {fuel: 2000, steel: 2000, munitions: 1000, alloy: 0};

const STEP_MIN = 5;
const DAY_MIN = 1440;

/* -------------------------------------------------------------------------- */
/* Players                                                                    */
/* -------------------------------------------------------------------------- */

export interface PlayerModel {
  name: string;
  /** Minutes of the game day (RST) at which the player looks in. */
  sessions: readonly number[];
  /** Day index (0 = season Monday) -> plays that day. */
  plays: (day: number) => boolean;
  lanes: readonly Lane[];
  exercisesPerDay: number;
  arena: boolean;
  /** Share of earned Credits spent on Depot resources (the rest goes to ranks etc.). */
  creditsToDepot: number;
  /** Tokens bought per Monday week; must not exceed WEEKLY_TOKEN_CAP. */
  tokensPerWeek: number;
}

const hm = (h: number, m = 0) => h * 60 + m;
const hourly = (from: number, to: number) => Array.from({length: to - from + 1}, (_, i) => hm(from + i));

export const PLAYERS = {
  freeTypical: {
    name: 'Free, typical: 08/13/21, 6 of 7 days, 4 lanes + Cache, 2 exercises, Arena, 25% of Credits to Depot',
    sessions: [hm(8), hm(13), hm(21)],
    plays: (d: number) => d % 7 !== 6,
    lanes: ['command', 'industry', 'mobilization', 'engagement'],
    exercisesPerDay: 2,
    arena: true,
    creditsToDepot: 0.25,
    tokensPerWeek: 0,
  },
  freeEngaged: {
    name: 'Free, engaged: 07/12/17/22, 7 of 7, all lanes, 3 exercises, Arena, 50% of Credits to Depot',
    sessions: [hm(7), hm(12), hm(17), hm(22)],
    plays: () => true,
    lanes: LANES,
    exercisesPerDay: 3,
    arena: true,
    creditsToDepot: 0.5,
    tokensPerWeek: 0,
  },
  freeCasual: {
    name: 'Free, casual: 08/21, weekdays, 4 lanes + Cache, 1 exercise, no Arena, no Credits to Depot',
    sessions: [hm(8), hm(21)],
    plays: (d: number) => d % 7 < 5,
    lanes: ['command', 'industry', 'mobilization', 'engagement'],
    exercisesPerDay: 1,
    arena: false,
    creditsToDepot: 0,
    tokensPerWeek: 0,
  },
  spenderHeavy: {
    name: 'Heavy spender: hourly 07-23, 7 of 7, all lanes, 3 exercises, Arena, all Credits + 10,000 Tokens/week',
    sessions: hourly(7, 23),
    plays: () => true,
    lanes: LANES,
    exercisesPerDay: 3,
    arena: true,
    creditsToDepot: 1,
    tokensPerWeek: WEEKLY_TOKEN_CAP,
  },
  spenderModerate: {
    name: 'Moderate spender: 08/13/18/22, 7 of 7, all lanes, 3 exercises, Arena, all Credits + 2,000 Tokens/week',
    sessions: [hm(8), hm(13), hm(18), hm(22)],
    plays: () => true,
    lanes: LANES,
    exercisesPerDay: 3,
    arena: true,
    creditsToDepot: 1,
    tokensPerWeek: 2_000,
  },
} satisfies Record<string, PlayerModel>;

/** What a player earns on a day they play, week 1-based. Deterministic. */
export function dailyIncome(player: PlayerModel, day: number): Reward {
  const week = Math.floor(day / 7) + 1;
  const out: Reward = {credits: 0, fuel: 0, steel: 0, munitions: 0, alloy: 0};
  const add = (r: Reward) => {
    for (const k of Object.keys(out) as Array<keyof Reward>) out[k] += r[k];
  };
  for (const lane of player.lanes) add(laneReward(lane, week));
  if (player.lanes.length >= LANES_FOR_CACHE) add(cacheReward(week));
  const today = pickDailyTypes(seeded(hashSeed(`season-pacing:${day}`)), true);
  for (const type of today.slice(0, Math.min(EXERCISES_PER_DAY, player.exercisesPerDay))) add(exerciseReward(type, week));
  if (player.arena) {
    add(FIELD_CACHE);
    add(FULL_ENGAGEMENT_BONUS);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* Plans                                                                      */
/* -------------------------------------------------------------------------- */

export interface PlanStep {
  building: LevelledBuilding;
  toLevel: number;
}

export interface PlanShape {
  /** Engineer Support Yard to N after Command Center N. */
  engineer: boolean;
  /** The four producers to N - lag after Command Center N; null = never. */
  producerLag: number | null;
  /** Depot to N after Command Center N (raises the daily caps). */
  depot: boolean;
}

export function planName(shape: PlanShape): string {
  const parts = ['rush'];
  if (shape.producerLag !== null) parts.push(shape.producerLag === 0 ? 'producers' : `producers-${shape.producerLag}`);
  if (shape.engineer) parts.push('engineer');
  if (shape.depot) parts.push('depot');
  return parts.join('+');
}

export const PLAN_SHAPES: readonly PlanShape[] = [null, 0, 2, 4].flatMap((producerLag) =>
  [false, true].flatMap((engineer) => [false, true].map((depot) => ({producerLag, engineer, depot}))),
);

const PRODUCERS = RESOURCE_KINDS.map((k) => PRODUCER_OF[k]);

/** The build order, prerequisites inserted: the Warehouse's floor(N/2) before anything else's N. */
export function makePlan(shape: PlanShape, toCommandCenter = 10): PlanStep[] {
  const have: BuildingLevels = {...NO_BUILDINGS};
  const steps: PlanStep[] = [];
  const raise = (building: LevelledBuilding, to: number) => {
    while (have[building] < to) {
      const next = have[building] + 1;
      if (building !== 'quartermaster_warehouse') raise('quartermaster_warehouse', warehouseNeeded(next));
      steps.push({building, toLevel: next});
      have[building] = next;
    }
  };
  for (let n = 2; n <= toCommandCenter; n += 1) {
    raise('command_center', n);
    if (n === toCommandCenter) break; // nothing built after the last level speeds it up
    if (shape.producerLag !== null) PRODUCERS.forEach((p) => raise(p, n - shape.producerLag!));
    if (shape.engineer) raise('engineer_support_yard', n);
    if (shape.depot) raise('depot', n);
  }
  return steps;
}

/* -------------------------------------------------------------------------- */
/* Simulation                                                                 */
/* -------------------------------------------------------------------------- */

export interface Hypothetical {
  /** HYPOTHETICAL: multiply the Depot's daily caps (the rates stay 1:1 and fixed). */
  depotCapMultiplier?: number;
  /** HYPOTHETICAL: the Second Engineer Team at this Engineer Yard level instead of 10. */
  secondTeamAtEngineerYard?: number;
  /**
   * HYPOTHETICAL: a running Command Center timer can be cut at this many
   * Tokens or Credits (1:1) per hour. No such purchase exists; the rate is a
   * sweep parameter, not a proposed price. Only the week's unspent Tokens
   * are used, after the Depot has taken what the next build needs.
   */
  commandCenterSpeedupPerHour?: number;
}

export interface PacingResult {
  profile: string;
  player: string;
  plan: string;
  hypothetical: Hypothetical | null;
  /** Fractional day each Command Center level finished, by level; absent = not in the season. */
  ccDay: Partial<Record<number, number>>;
  cc10Day: number | null;
  /** Days the queue was busy / free but waiting on resources / free but the player offline. */
  queueDays: number;
  resourceWaitDays: number;
  offlineWaitDays: number;
  creditsEarned: number;
  creditsSpent: number;
  tokensSpent: number;
  /** Most Tokens spent in any one Monday week (must be <= the cap). */
  maxTokensInAWeek: number;
  /** True when the Depot's daily cap, not the budget, stopped a purchase. */
  depotCapHit: boolean;
  /** HYPOTHETICAL speed-up only: Tokens spent cutting timers, and hours cut. */
  speedupTokens: number;
  speedupHours: number;
  longestBuildHours: number;
  builds: number;
}

interface Job extends PlanStep {
  endsAt: number;
}

const add = (a: Resources, b: Partial<Resources>, times = 1) => {
  for (const k of RESOURCE_KINDS) a[k] += (b[k] ?? 0) * times;
};

export function simulate(
  profile: BalanceProfile,
  player: PlayerModel,
  shape: PlanShape,
  hypothetical: Hypothetical | null = null,
  signupMinute = hm(8),
): PacingResult {
  if (player.tokensPerWeek > WEEKLY_TOKEN_CAP) throw new Error(`${player.name}: over the weekly Token cap`);
  const plan = makePlan(shape);
  const levels: BuildingLevels = {...NO_BUILDINGS};
  const stock: Resources = {...START_STOCK};
  const jobs: Job[] = [];
  const ccDay: Partial<Record<number, number>> = {};
  let next = 0;
  let credits = 0;
  let creditsEarned = 0;
  let creditsSpent = 0;
  let tokensLeft = 0;
  let tokensSpent = 0;
  let tokensThisWeek = 0;
  let maxTokensInAWeek = 0;
  let depotCapHit = false;
  let longest = 0;
  let queueMin = 0;
  let resourceMin = 0;
  let offlineMin = 0;
  let boughtToday: Resources = {...NO_RESOURCES};
  let today = -1;
  let paidToday = false;
  let secondTeamAt: number | null = null;
  let speedupTokens = 0;
  let speedupMin = 0;

  /** Spend whole currency units, Credits first, then Tokens. The caller checks the budget. */
  const spend = (units: number) => {
    const fromCredits = Math.min(units, Math.floor(credits));
    const fromTokens = units - fromCredits;
    credits -= fromCredits;
    creditsSpent += fromCredits;
    tokensLeft -= fromTokens;
    tokensSpent += fromTokens;
    tokensThisWeek += fromTokens;
    maxTokensInAWeek = Math.max(maxTokensInAWeek, tokensThisWeek);
  };
  const budget = () => Math.floor(credits) + tokensLeft;

  const capToday = (k: ResourceKind) =>
    Math.floor(DAILY_RESOURCE_CAP[k] * depotCapMultiplier(levels.depot) * (hypothetical?.depotCapMultiplier ?? 1));

  /** Buy toward `want` at the Depot, Credits first then Tokens, one whole unit at a time per kind. */
  const buyToward = (want: Resources) => {
    for (const k of RESOURCE_KINDS) {
      const short = want[k] - stock[k];
      if (short <= 0) continue;
      const wanted = Math.ceil(short / RESOURCE_PER_UNIT[k]);
      const room = Math.floor((capToday(k) - boughtToday[k]) / RESOURCE_PER_UNIT[k]);
      const n = Math.max(0, Math.min(wanted, room, budget()));
      if (room < wanted && budget() > room) depotCapHit = true;
      if (n === 0) continue;
      spend(n);
      // 1:1 - a Token and a Credit buy the same amount.
      stock[k] += n * RESOURCE_PER_UNIT[k];
      boughtToday[k] += n * RESOURCE_PER_UNIT[k];
    }
  };

  const end = SEASON_DAYS * DAY_MIN;
  for (let t = signupMinute; t < end; t += STEP_MIN) {
    const day = Math.floor(t / DAY_MIN);
    const minuteOfDay = t % DAY_MIN;
    if (day !== today) {
      today = day;
      boughtToday = {...NO_RESOURCES};
      paidToday = false;
      if (day % 7 === 0) {
        tokensLeft = player.tokensPerWeek; // Monday 00:00 RST; unbought Tokens do not carry
        tokensThisWeek = 0;
      }
    }

    for (let i = jobs.length - 1; i >= 0; i -= 1) {
      if (jobs[i].endsAt > t) continue;
      const done = jobs.splice(i, 1)[0];
      levels[done.building] = Math.max(levels[done.building], done.toLevel);
      if (done.building === 'command_center') ccDay[done.toLevel] = done.endsAt / DAY_MIN;
    }
    if (levels.command_center >= 10) break;

    const online = player.plays(day) && player.sessions.some((s) => minuteOfDay >= s && minuteOfDay < s + STEP_MIN);
    if (online && !paidToday) {
      paidToday = true;
      const income = dailyIncome(player, day);
      add(stock, income);
      creditsEarned += income.credits;
      credits += income.credits * player.creditsToDepot;
    }

    // HYPOTHETICAL second queue: hired the first online moment it is allowed and affordable.
    const teamYard = hypothetical?.secondTeamAtEngineerYard;
    if (online && teamYard !== undefined && secondTeamAt === null && levels.engineer_support_yard >= teamYard) {
      const cost = SECOND_TEAM.cost;
      if (RESOURCE_KINDS.every((k) => stock[k] >= cost[k]) && budget() >= SECOND_TEAM.currency) {
        add(stock, cost, -1);
        spend(SECOND_TEAM.currency);
        secondTeamAt = t + SECOND_TEAM.ms / 60_000;
      }
    }
    const queues = secondTeamAt !== null && secondTeamAt <= t ? 2 : 1;

    // Start what the queue allows, in plan order. A step whose building is
    // already running waits for it (one job per building).
    let started = true;
    while (started && jobs.length < queues && next < plan.length) {
      started = false;
      const step = plan[next];
      if (jobs.some((j) => j.building === step.building)) break;
      // Levels already applied plus levels in flight: the gate reads finished levels only.
      const block = buildingBlock(step.building, levels, 1);
      if (levels[step.building] + 1 !== step.toLevel || block) break; // a prerequisite is still running
      const price = buildingStep(step.building, step.toLevel, profile);
      if (online) {
        // Stockpile toward the rest of the plan while the Depot's cap allows:
        // unspent cap does not carry to tomorrow.
        const rest: Resources = {...NO_RESOURCES};
        for (let i = next; i < plan.length; i += 1) add(rest, buildingStep(plan[i].building, plan[i].toLevel, profile).cost);
        buyToward(price.cost);
        buyToward(rest);
      }
      const affordable = RESOURCE_KINDS.every((k) => stock[k] >= price.cost[k]);
      if (!affordable) {
        resourceMin += STEP_MIN;
        break;
      }
      if (!online) {
        offlineMin += STEP_MIN;
        break;
      }
      add(stock, price.cost, -1);
      const minutes = Math.round((price.ms * engineerMultiplier(levels.engineer_support_yard)) / 60_000);
      longest = Math.max(longest, minutes);
      jobs.push({...step, endsAt: t + minutes});
      next += 1;
      started = true;
    }

    const perHour = hypothetical?.commandCenterSpeedupPerHour;
    const ccJob = jobs.find((j) => j.building === 'command_center');
    if (online && perHour && ccJob && ccJob.endsAt > t) {
      // Keep what the next build still needs from the Depot, then cut with the rest of the week's Tokens.
      let reserve = 0;
      if (next < plan.length) {
        const cost = buildingStep(plan[next].building, plan[next].toLevel, profile).cost;
        for (const k of RESOURCE_KINDS) reserve += Math.max(0, Math.ceil((cost[k] - stock[k]) / RESOURCE_PER_UNIT[k]));
      }
      const spare = Math.max(0, tokensLeft - reserve);
      const minutes = Math.min(ccJob.endsAt - t, Math.floor((spare / perHour) * 60));
      const units = Math.ceil((minutes / 60) * perHour);
      if (minutes > 0 && units <= tokensLeft) {
        tokensLeft -= units;
        tokensSpent += units;
        tokensThisWeek += units;
        maxTokensInAWeek = Math.max(maxTokensInAWeek, tokensThisWeek);
        speedupTokens += units;
        speedupMin += minutes;
        ccJob.endsAt -= minutes;
      }
    }
    if (jobs.length > 0) queueMin += STEP_MIN;

    const rate = productionPerHour(levels);
    add(stock, rate, STEP_MIN / 60);
  }

  return {
    profile: `${profile.id}@${profile.version}`,
    player: player.name,
    plan: planName(shape),
    hypothetical,
    ccDay,
    cc10Day: ccDay[10] ?? null,
    queueDays: queueMin / DAY_MIN,
    resourceWaitDays: resourceMin / DAY_MIN,
    offlineWaitDays: offlineMin / DAY_MIN,
    creditsEarned,
    creditsSpent,
    tokensSpent,
    maxTokensInAWeek,
    depotCapHit,
    speedupTokens,
    speedupHours: speedupMin / 60,
    longestBuildHours: longest / 60,
    builds: next,
  };
}

/** The player's best plan: earliest Command Center 10, ties to the simpler plan. */
export function bestPlan(profile: BalanceProfile, player: PlayerModel, hypothetical: Hypothetical | null = null): PacingResult {
  let best: PacingResult | null = null;
  for (const shape of PLAN_SHAPES) {
    const r = simulate(profile, player, shape, hypothetical);
    if (!best || (r.cc10Day ?? Infinity) < (best.cc10Day ?? Infinity)) best = r;
  }
  return best!;
}

export interface TargetCheck {
  free: PacingResult;
  spender: PacingResult;
  freeVerdict: Verdict;
  spenderVerdict: Verdict;
  bothOnTarget: boolean;
}

/** The typical free player against week 8, the heavy spender against week 3. */
export function checkTargets(profile: BalanceProfile, hypothetical: Hypothetical | null = null): TargetCheck {
  const free = bestPlan(profile, PLAYERS.freeTypical, hypothetical);
  const spender = bestPlan(profile, PLAYERS.spenderHeavy, hypothetical);
  const freeVerdict = verdict(free.cc10Day, TARGETS.free);
  const spenderVerdict = verdict(spender.cc10Day, TARGETS.spender);
  return {free, spender, freeVerdict, spenderVerdict, bothOnTarget: freeVerdict === 'on target' && spenderVerdict === 'on target'};
}

/** Every building 2 -> 10 on one queue, no Engineer Yard: the whole base's raw timer days. */
export function wholeBaseDays(profile: BalanceProfile): number {
  let ms = 0;
  for (const b of LEVELLED_BUILDINGS) for (let level = 2; level <= 10; level += 1) ms += buildingStep(b, level, profile).ms;
  return ms / 86_400_000;
}

/** The most Tokens a heavy spender can have bought by the end of `day` (Monday weeks from day 0). */
export function tokenCeilingByDay(day: number): number {
  return (Math.floor(day / 7) + 1) * WEEKLY_TOKEN_CAP;
}
