/**
 * Balance profiles: the season-tunable numbers behind building upgrades.
 *
 * The stable core - the gates, the queue, settle-on-read, absolute timers,
 * the Depot's rates and caps, Service Rank x1.045 and the Combat Systems
 * curve - stays in code. A profile holds only numbers a season or an event
 * may retune, and every profile is typed, versioned and validated.
 *
 *   DEFAULT: `season-1-shipped` is the tables exactly as they shipped. It is
 *   what every server runs unless told otherwise, and a test pins it to
 *   shared/buildings.ts row for row.
 *
 *   CANDIDATE: any other profile is opt-in. The Worker uses one only when
 *   WWR_BALANCE_PROFILE names it (set it under env.test, never top-level),
 *   and a name that is unknown, malformed or pinned to the wrong version is
 *   refused rather than quietly replaced by the default.
 *
 * A profile is read when a job STARTS. base_jobs stores the completion
 * instant, so switching profiles never moves a timer already running.
 *
 * Nothing here prices currency. Buildings cost resources; Tokens and Credits
 * buy resources at the Depot 1:1 under the daily caps in shared/buildings.ts,
 * and none of that is profile-tunable.
 */
import {
  type TimerGroup,
  DESIGNED_FROM_LEVEL,
  DESIGNED_TO_LEVEL,
  SHIPPED_BUILDING_MINUTES,
  TIMER_GROUPS,
} from './buildings';

/** Bump when the SHAPE of a profile changes; `version` is per profile. */
export const BALANCE_SCHEMA = 1;

/** No single build may run longer than this (GAME-MATH-v1: 72 hours). */
export const MAX_BUILD_MINUTES = 72 * 60;

/** Rows in every designed table: levels 2-10. */
export const DESIGNED_ROWS = DESIGNED_TO_LEVEL - DESIGNED_FROM_LEVEL + 1;

/** Command Center cost multipliers must sit inside this band. */
export const CC_COST_MULTIPLIER_MIN = 0.25;
export const CC_COST_MULTIPLIER_MAX = 20;

/** What shared/buildings.ts `buildingStep` reads. */
export interface BuildingBalance {
  /** Minutes by timer group, index 0 = level 2 ... index 8 = level 10. */
  timers: Readonly<Record<TimerGroup, readonly number[]>>;
  /** Multiplier on the Command Center's resource cost row, same indexing. */
  commandCenterCostMultiplier: readonly number[];
  /** Clamp on every build's minutes, or null for no clamp (the shipped behaviour). */
  maxBuildMinutes: number | null;
}

export type BalanceStatus = 'default' | 'candidate';

export interface BalanceProfile extends BuildingBalance {
  schema: typeof BALANCE_SCHEMA;
  /** Lowercase, digits and hyphens. */
  id: string;
  /** Positive integer. Bump on ANY number change, so a job log names the table it used. */
  version: number;
  status: BalanceStatus;
  label: string;
  notes: string;
}

export type BalanceProfileRef = Pick<BalanceProfile, 'id' | 'version' | 'status'>;

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

const ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Every problem with a candidate profile, or an empty list. Takes `unknown`
 * so a profile that arrives as JSON is checked on the same path as one
 * written in code.
 */
export function validateBalanceProfile(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ['profile must be an object'];
  const p = value;

  if (p.schema !== BALANCE_SCHEMA) errors.push(`schema must be ${BALANCE_SCHEMA}`);
  if (typeof p.id !== 'string' || !ID_PATTERN.test(p.id)) {
    errors.push('id must be 3-64 characters of a-z, 0-9 and hyphens, starting with a letter or digit');
  }
  if (!Number.isInteger(p.version) || (p.version as number) < 1) errors.push('version must be an integer >= 1');
  if (p.status !== 'default' && p.status !== 'candidate') errors.push('status must be "default" or "candidate"');
  if (typeof p.label !== 'string' || p.label.trim() === '') errors.push('label is required');
  if (typeof p.notes !== 'string') errors.push('notes must be a string');

  const max = p.maxBuildMinutes;
  if (max !== null && (!Number.isInteger(max) || (max as number) < 1 || (max as number) > MAX_BUILD_MINUTES)) {
    errors.push(`maxBuildMinutes must be null or an integer from 1 to ${MAX_BUILD_MINUTES}`);
  }

  if (!isRecord(p.timers)) {
    errors.push('timers must be an object');
  } else {
    const extra = Object.keys(p.timers).filter((k) => !(TIMER_GROUPS as readonly string[]).includes(k));
    if (extra.length) errors.push(`timers has unknown groups: ${extra.join(', ')}`);
    for (const group of TIMER_GROUPS) {
      const rows = p.timers[group];
      const where = `timers.${group}`;
      if (!Array.isArray(rows) || rows.length !== DESIGNED_ROWS) {
        errors.push(`${where} must list ${DESIGNED_ROWS} rows (levels ${DESIGNED_FROM_LEVEL}-${DESIGNED_TO_LEVEL})`);
        continue;
      }
      rows.forEach((m, i) => {
        const level = i + DESIGNED_FROM_LEVEL;
        if (!Number.isInteger(m) || m < 1) errors.push(`${where} level ${level} must be a whole number of minutes >= 1`);
        else if (m > MAX_BUILD_MINUTES) errors.push(`${where} level ${level} is ${m} min, over the ${MAX_BUILD_MINUTES}-minute (72 h) build cap`);
        else if (i > 0 && Number.isInteger(rows[i - 1]) && m < rows[i - 1]) {
          errors.push(`${where} level ${level} (${m} min) is shorter than level ${level - 1} (${rows[i - 1]} min)`);
        }
      });
    }
  }

  const mult = p.commandCenterCostMultiplier;
  if (!Array.isArray(mult) || mult.length !== DESIGNED_ROWS) {
    errors.push(`commandCenterCostMultiplier must list ${DESIGNED_ROWS} rows (levels ${DESIGNED_FROM_LEVEL}-${DESIGNED_TO_LEVEL})`);
  } else {
    mult.forEach((m, i) => {
      if (typeof m !== 'number' || !Number.isFinite(m) || m < CC_COST_MULTIPLIER_MIN || m > CC_COST_MULTIPLIER_MAX) {
        errors.push(
          `commandCenterCostMultiplier level ${i + DESIGNED_FROM_LEVEL} must be a number from ${CC_COST_MULTIPLIER_MIN} to ${CC_COST_MULTIPLIER_MAX}`,
        );
      }
    });
  }
  return errors;
}

/** Every problem with a set of profiles taken together. */
export function validateBalanceRegistry(profiles: readonly unknown[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  let defaults = 0;
  for (const profile of profiles) {
    const own = validateBalanceProfile(profile);
    const id = isRecord(profile) && typeof profile.id === 'string' ? profile.id : '(no id)';
    errors.push(...own.map((e) => `${id}: ${e}`));
    if (ids.has(id)) errors.push(`${id}: duplicate id`);
    ids.add(id);
    if (isRecord(profile) && profile.status === 'default') defaults += 1;
  }
  if (defaults !== 1) errors.push(`exactly one default profile is required, found ${defaults}`);
  return errors;
}

function frozen(profile: BalanceProfile): BalanceProfile {
  const timers = Object.freeze(
    Object.fromEntries(TIMER_GROUPS.map((g) => [g, Object.freeze([...profile.timers[g]])])),
  ) as BalanceProfile['timers'];
  return Object.freeze({
    ...profile,
    timers,
    commandCenterCostMultiplier: Object.freeze([...profile.commandCenterCostMultiplier]),
  });
}

/** Validate and freeze, or throw with every problem listed. For profiles written in code. */
export function defineBalanceProfile(profile: BalanceProfile): BalanceProfile {
  const errors = validateBalanceProfile(profile);
  if (errors.length) throw new Error(`Invalid balance profile ${String(profile.id)}: ${errors.join('; ')}`);
  return frozen(profile);
}

/* -------------------------------------------------------------------------- */
/* Profiles                                                                   */
/* -------------------------------------------------------------------------- */

const ONES: readonly number[] = Array.from({length: DESIGNED_ROWS}, () => 1);

/** The tables as shipped. Changing a number here changes the live game. */
export const SEASON_1_SHIPPED = defineBalanceProfile({
  schema: BALANCE_SCHEMA,
  id: 'season-1-shipped',
  version: 1,
  status: 'default',
  label: 'Season 1 as shipped',
  notes: 'The shipped building tables in shared/buildings.ts, unchanged. No build clamp.',
  timers: SHIPPED_BUILDING_MINUTES,
  commandCenterCostMultiplier: ONES,
  maxBuildMinutes: null,
});

/**
 * CANDIDATE, unapproved. For the test realm and the pacing simulation only.
 *
 * Aimed at Matt's 2026-09-15 targets for a 70-day season: Command Center 10
 * in about week 8 (day 49-56) for a free player and about week 3 (day 14-21)
 * for a heavy spender. `npm run sim:pacing` measures it; at version 1 it puts
 * the heavy spender on target (about day 21) and the typical free player at
 * about day 34 - still three weeks EARLY. No Command Center timer/cost table
 * found reaches both under the paid mechanics that exist: the 10,000 weekly
 * Token cap bounds what a spender can buy by day 21, and a free player's own
 * producers out-earn it. See docs/BALANCE-PROFILES.md.
 *
 * What it changes: Command Center timers from level 6 (every build clamped
 * to 72 h) and its resource cost from level 4. Every other building table,
 * the Depot's 1:1 rates and daily caps, production, starting stock, rank and
 * Combat Systems are untouched.
 */
export const SEASON_1_CANDIDATE_CC10 = defineBalanceProfile({
  schema: BALANCE_SCHEMA,
  id: 'season-1-candidate-cc10',
  version: 1,
  status: 'candidate',
  label: 'Season 1 candidate: CC10 pacing (unapproved)',
  notes:
    'Command Center timers (L6+) and cost rows (L4+) retuned toward the CC10 day-56 free / day-21 spender targets. Simulated: spender on target, free player early. Unapproved; opt-in via WWR_BALANCE_PROFILE on the test realm only.',
  timers: {
    ...SHIPPED_BUILDING_MINUTES,
    commandCenter: [120, 240, 480, 720, 1440, 2880, 4320, 4320, 4320],
  },
  commandCenterCostMultiplier: [1, 1, 2.5, 4, 5.5, 7, 8.5, 10, 11.5],
  maxBuildMinutes: MAX_BUILD_MINUTES,
});

export const BALANCE_PROFILES: readonly BalanceProfile[] = Object.freeze([SEASON_1_SHIPPED, SEASON_1_CANDIDATE_CC10]);

export const DEFAULT_BALANCE_PROFILE: BalanceProfile = SEASON_1_SHIPPED;

// A registry that does not validate must fail at import, in tests and in the
// Worker's first request, not on the first upgrade someone starts.
{
  const errors = validateBalanceRegistry(BALANCE_PROFILES);
  if (errors.length) throw new Error(`Balance registry invalid: ${errors.join('; ')}`);
}

/* -------------------------------------------------------------------------- */
/* Selection                                                                  */
/* -------------------------------------------------------------------------- */

export function balanceRef(profile: BalanceProfile): BalanceProfileRef {
  return {id: profile.id, version: profile.version, status: profile.status};
}

/** A profile by id, for the client to price with the id the server sent. */
export function balanceProfileById(id: string | null | undefined): BalanceProfile | undefined {
  return BALANCE_PROFILES.find((p) => p.id === id);
}

export type BalanceSelection = {ok: true; profile: BalanceProfile} | {ok: false; error: string};

/**
 * The profile a server setting names.
 *
 * Unset or blank means the default. Otherwise `id` or `id@version`; pinning
 * a version makes a deploy refuse to run a profile whose numbers moved
 * since the setting was written. Anything else is an error, never a silent
 * fall back to the default: a tester who thinks they are on the candidate
 * and is not has wasted the test.
 */
export function selectBalanceProfile(setting: string | null | undefined): BalanceSelection {
  const raw = (setting ?? '').trim();
  if (raw === '') return {ok: true, profile: DEFAULT_BALANCE_PROFILE};
  const match = /^([a-z0-9][a-z0-9-]{2,63})(?:@([0-9]+))?$/.exec(raw);
  if (!match) return {ok: false, error: `Balance profile setting "${raw}" is not "id" or "id@version".`};
  const profile = balanceProfileById(match[1]);
  if (!profile) return {ok: false, error: `No balance profile "${match[1]}".`};
  if (match[2] !== undefined && Number(match[2]) !== profile.version) {
    return {
      ok: false,
      error: `Balance profile "${profile.id}" is version ${profile.version}, not ${match[2]}.`,
    };
  }
  return {ok: true, profile};
}
