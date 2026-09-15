/**
 * The Season 1 hub's model: what week and chapter it is, what unlocks when,
 * and how far this practice Task Force has got with each Season 1 event, all
 * read from existing rules and sandbox state. Pure, so tests can check it.
 *
 * Sources:
 * - Season name, weeks, phases, resets: shared/season.ts, shared/season1Ops.ts.
 * - Chapter names, featured play and story beats: the design table in
 *   docs/SEASON-1-LIVE-OPS-DESIGN-v1.md ("Season map and weekly story beat").
 *   Design text only; the design gives no chapter score weights and none are
 *   invented here.
 * - Asset unlock weeks: shared/season.ts UNLOCK_WEEK.
 * - Arena, Warfront and Convoy rules and point values: shared/arena.ts,
 *   shared/warfront.ts, shared/allianceConvoy.ts. Those events need the game
 *   server and other players, so the hub shows them locked; the Warfront card
 *   only estimates what today's practice would score under the live point table.
 */
import {ARENA_ATTEMPTS_PER_DAY, ARENA_RULES, FIELD_CACHE} from '../../shared/arena';
import {CONVOY_MIN_MEMBERS, CONVOY_RULES, CONVOY_TRUCKS} from '../../shared/allianceConvoy';
import {EXERCISES} from '../../shared/exercises';
import {SEASON_1_NAME, dailyWindow, seasonPhase, weeklyWindow} from '../../shared/season1Ops';
import {SEASON_WEEKS, UNLOCK_WEEK, weekStart} from '../../shared/season';
import {LANES_FOR_CACHE} from '../../shared/season1Ops';
import {type SandboxState, type Site, lanesDone, sandboxDay, sandboxWeek, sitesFor} from '../../shared/sandbox';
import {SANDBOX_SEASON_1_TEST} from '../../shared/sandboxSeason';
import {POINTS, WARFRONT, WARFRONT_METRICS, WARFRONT_RULES, type DayMetrics, cappedDayScore, cappedMetric} from '../../shared/warfront';

export const HUB_SEASON_NAME = SEASON_1_NAME;

export interface Chapter {
  week: number;
  name: string;
  featured: string;
  beat: string;
}

/** docs/SEASON-1-LIVE-OPS-DESIGN-v1.md, "Season map and weekly story beat", verbatim. */
export const CHAPTERS: readonly Chapter[] = [
  {week: 1, name: 'Signal Breach', featured: 'Recon, starter contracts, Arena placement', beat: 'The Dominion’s signal net is discovered.'},
  {week: 2, name: 'Scraplands Sweep', featured: 'Convoys, resource gathering, alliance supply runs', beat: 'Outer salvage routes are exposed.'},
  {week: 3, name: 'Factory Ring', featured: 'Factory Defence, breach squads, alliance targets', beat: 'Automated production lines activate.'},
  {week: 4, name: 'Blackout Protocol', featured: 'Signals, drone/recon, ambush prevention', beat: 'Dominion jammers disrupt the basin.'},
  {week: 5, name: 'Siege Engines', featured: 'Siege, armour, artillery, repair planning', beat: 'Mobile fortress units enter the field.'},
  {week: 6, name: 'Air Corridor', featured: 'Rotary/fixed-wing operations, map mobility', beat: 'The Dominion contests its air lanes.'},
  {week: 7, name: 'Broken Convoys', featured: 'Raids, logistics, alliance escort', beat: 'Supply chains become vulnerable.'},
  {week: 8, name: 'Colossus Wake', featured: 'Colossus Hunt, multi-band Task Forces', beat: 'A Dominion industrial titan powers up.'},
  {week: 9, name: 'Front Collapse', featured: 'Mixed-role operations, reinforcements', beat: 'The outer rings fail and resistance concentrates.'},
  {week: 10, name: 'Iron Dominion Core', featured: 'Server finale, all proven event types', beat: 'The Core opens for the season’s final campaign.'},
];

export function chapterOf(week: number): Chapter {
  return CHAPTERS[Math.max(1, Math.min(SEASON_WEEKS, week)) - 1];
}

/** Asset ids that unlock in a season week (shared/season.ts), in schedule order. */
export function unlocksIn(week: number): string[] {
  return Object.entries(UNLOCK_WEEK)
    .filter(([, w]) => w === week)
    .map(([id]) => id);
}

export type Phase = ReturnType<typeof seasonPhase>['phase'];
export const PHASE_LABEL: Record<Phase, string> = {
  pre: 'Before the season',
  proving_ground: 'Proving Ground (weeks 1–4)',
  head_to_head: 'Head to Head (weeks 5–10)',
  offseason: 'Offseason',
};

/** The phase a season week falls in, by the live seasonPhase rule. */
export function phaseOfWeek(week: number): Phase {
  return seasonPhase(weekStart(week) + 1).phase;
}

export interface ExerciseCard {
  site: Site;
  name: string;
  kind: 'battle' | 'hold';
  done: boolean;
}

export interface HubModel {
  name: string;
  /** The practice sandbox's own week and day (its test clock). Progress and rewards follow it. */
  week: number;
  day: number;
  chapter: Chapter;
  phase: Phase;
  nextPracticeDayIn: number;
  /** The live Season 1 calendar, for reference only. */
  live: {week: number; phase: Phase; chapter: Chapter | null; dailyResetIn: number; weeklyResetIn: number};
  ops: {lanes: number; target: number; cacheClaimed: boolean};
  exercises: ExerciseCard[];
  /** What today's practice would score under the live Warfront point table. Nothing is submitted. */
  warfront: {metrics: DayMetrics; capped: DayMetrics; total: number; cap: number};
  arena: {attemptsPerDay: number; fieldCache: typeof FIELD_CACHE; rules: readonly string[]; phaseBBuilt: false};
  convoy: {trucks: number; minMembers: number; rules: readonly string[]};
  warfrontRules: readonly string[];
}

export function hubModel(state: SandboxState, now: number, realNow: number): HubModel {
  const config = SANDBOX_SEASON_1_TEST;
  const day = sandboxDay(state, now, config);
  const week = sandboxWeek(day, config);
  const live = seasonPhase(realNow);
  const prefix = `d${day}-`;
  const cleared = new Set(state.cleared.filter((id) => id.startsWith(prefix)));
  const exercises: ExerciseCard[] = sitesFor(state, day, config)
    .filter((s) => s.kind !== 'patrol' && s.kind !== 'rival_base')
    .map((site) => {
      const spec = EXERCISES[site.kind as keyof typeof EXERCISES];
      return {site, name: spec.name, kind: spec.kind, done: cleared.has(site.id)};
    });
  const lanes = lanesDone(state, day).length;
  const cacheClaimed = state.ledger.includes(`cache:${day}`);
  const battlesWon = exercises.filter((x) => x.done && x.kind === 'battle').length;
  const holds = exercises.filter((x) => x.done && x.kind === 'hold').length;
  const metrics: DayMetrics = {
    assault: battlesWon * POINTS.exerciseBattle.points,
    operations: lanes * POINTS.dailyLane.points + (cacheClaimed ? POINTS.dailyCache.points : 0) + holds * POINTS.exerciseHold.points,
    support: 0,
  };
  const capped = Object.fromEntries(WARFRONT_METRICS.map((k) => [k, cappedMetric(k, metrics[k])])) as unknown as DayMetrics;
  return {
    name: SEASON_1_NAME,
    week,
    day,
    chapter: chapterOf(week),
    phase: phaseOfWeek(week),
    nextPracticeDayIn: state.createdAt + (day + 1) * config.dayMs - now,
    live: {
      week: live.week,
      phase: live.phase,
      chapter: live.week >= 1 && live.week <= SEASON_WEEKS ? chapterOf(live.week) : null,
      dailyResetIn: dailyWindow(realNow).resetAt - realNow,
      weeklyResetIn: weeklyWindow(realNow).resetAt - realNow,
    },
    ops: {lanes: Math.min(lanes, LANES_FOR_CACHE), target: LANES_FOR_CACHE, cacheClaimed},
    exercises,
    warfront: {metrics, capped, total: cappedDayScore(metrics), cap: WARFRONT.perPlayerDailyCap},
    arena: {attemptsPerDay: ARENA_ATTEMPTS_PER_DAY, fieldCache: FIELD_CACHE, rules: ARENA_RULES, phaseBBuilt: false},
    // The Contract Convoy's payment rule is unsettled and is not a sandbox currency: left out here.
    convoy: {trucks: CONVOY_TRUCKS, minMembers: CONVOY_MIN_MEMBERS, rules: CONVOY_RULES.filter((r) => !/Contract Convoy/.test(r))},
    warfrontRules: WARFRONT_RULES,
  };
}
