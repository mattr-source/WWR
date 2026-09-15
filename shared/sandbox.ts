/**
 * The Field Sandbox: a single-player practice loop, isolated from accounts.
 *
 *   General Rider, one instruction at a time
 *   -> a tactical encounter against Dominion robots (NPCs)
 *   -> supplies from the win
 *   -> a real upgrade on a timer (the Field Workshop)
 *   -> damage and recovery: disabled chassis are repaired, destroyed ones
 *      are replaced, and the COMPANY keeps its experience either way.
 *
 * PROVISIONAL TEST DEFAULTS. Every number below is a sandbox tuning value
 * for testing the loop, not an economy ruling, and none of it is read by the
 * Worker, the live base, payments or any account.
 *
 * Pure and deterministic: no randomness, no clock, no I/O. `applyAction`
 * takes the state, an action and the instant, and returns a new state. The
 * same rules the live game keeps apply here in miniature:
 *
 *   - Timers are absolute instants, settled on read (`settle`).
 *   - Every action carries an id; an id already applied changes nothing, so
 *     a double tap, a replayed request or a second tab cannot pay twice.
 *   - A reward or a destruction is recorded under a key (`ledger`); the same
 *     key never counts again.
 *   - Kills here are TRAINING kills against NPCs. `confirmedPvpDestructions`
 *     exists so the screen can say plainly that it is zero, and nothing in
 *     this file can raise it: it is only ever a real multiplayer figure.
 */

export const SANDBOX_SCHEMA = 1;

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export const ROLES = ['scout', 'assault', 'support'] as const;
export type Role = (typeof ROLES)[number];

export type ChassisStatus = 'ready' | 'disabled' | 'repairing' | 'destroyed' | 'reinforcing';

export interface Chassis {
  role: Role;
  /** A new serial for every replacement chassis; the company outlives it. */
  serial: number;
  hp: number;
  status: ChassisStatus;
  /** Repair or reinforcement completes at this sandbox instant. */
  readyAt: number | null;
  /** Encounters this particular chassis has fought. Lost with the chassis. */
  sorties: number;
}

export type SupplyKind = 'fuel' | 'steel' | 'munitions' | 'alloy';
export type Supplies = Record<SupplyKind, number>;
export const SUPPLY_KINDS: readonly SupplyKind[] = ['fuel', 'steel', 'munitions', 'alloy'];

export type EnemyKind = 'crawler' | 'walker';

export interface Enemy {
  id: string;
  kind: EnemyKind;
  hp: number;
  maxHp: number;
}

export interface Encounter {
  id: string;
  wave: number;
  enemies: Enemy[];
  round: number;
  status: 'active' | 'won' | 'lost';
  /** Newest last; kept short. */
  log: string[];
  claimed: boolean;
}

export interface SandboxState {
  schema: typeof SANDBOX_SCHEMA;
  createdAt: number;
  /** Test clock: sandbox time = real time + this. Never touches the live game. */
  clockOffsetMs: number;
  tutorial: {step: number; completed: boolean};
  company: {name: string; xp: number};
  chassis: Record<Role, Chassis>;
  nextSerial: number;
  supplies: Supplies;
  workshop: {level: number; job: {toLevel: number; completesAt: number} | null};
  encounter: Encounter | null;
  wavesStarted: number;
  stats: {
    /** NPC robots destroyed in the sandbox. Training only. */
    trainingKills: number;
    encountersWon: number;
    chassisLost: number;
    /** Real PvP destructions. The sandbox has no PvP and never writes this. */
    confirmedPvpDestructions: 0;
  };
  /** Keys of rewards and destructions already counted. */
  ledger: string[];
  /** Ids of actions already applied (most recent), for idempotency. */
  applied: string[];
}

export type SandboxAction =
  | {type: 'tutorial.next'}
  | {type: 'tutorial.skip'}
  | {type: 'encounter.start'}
  | {type: 'encounter.fire'}
  | {type: 'encounter.retreat'}
  | {type: 'encounter.claim'}
  | {type: 'workshop.start'}
  | {type: 'chassis.repair'; role: Role}
  | {type: 'chassis.reinforce'; role: Role}
  | {type: 'clock.advance'; minutes: number}
  | {type: 'company.rename'; name: string};

export type ActionResult = {ok: true; state: SandboxState; note: string | null} | {ok: false; state: SandboxState; error: string};

/* -------------------------------------------------------------------------- */
/* Tuning (provisional test defaults)                                         */
/* -------------------------------------------------------------------------- */

const MIN = 60_000;

export const CHASSIS_SPEC: Record<Role, {label: string; maxHp: number; damage: number; blurb: string}> = {
  scout: {label: 'Scout', maxHp: 50, damage: 10, blurb: 'Marks a target: the whole company hits it 25% harder. Light armour.'},
  assault: {label: 'Assault', maxHp: 120, damage: 30, blurb: 'Main gun. Draws the heavy robots onto its armour.'},
  support: {label: 'Support', maxHp: 70, damage: 6, blurb: 'Patches the most damaged chassis in the field each round.'},
};

export const SCOUT_MARK_BONUS = 0.25;
export const SUPPORT_HEAL = 10;
/** A hit that leaves a chassis this far below zero (share of max HP) destroys it instead of disabling it. */
export const OVERKILL_SHARE = 0.3;

export const ENEMY_SPEC: Record<EnemyKind, {label: string; maxHp: number; damage: number}> = {
  crawler: {label: 'Dominion Crawler', maxHp: 40, damage: 22},
  walker: {label: 'Dominion Walker', maxHp: 100, damage: 30},
};

/** Supplies a new sandbox company starts with. */
export const START_SUPPLIES: Supplies = {fuel: 300, steel: 300, munitions: 200, alloy: 100};

export const WORKSHOP_MAX_LEVEL = 5;
/** Index = level being built. Minutes are short so the loop is testable in one sitting. */
export const WORKSHOP_STEPS: ReadonlyArray<{cost: Supplies; minutes: number} | null> = [
  null,
  null,
  {cost: {fuel: 400, steel: 500, munitions: 200, alloy: 250}, minutes: 3},
  {cost: {fuel: 900, steel: 1100, munitions: 450, alloy: 600}, minutes: 10},
  {cost: {fuel: 1800, steel: 2200, munitions: 900, alloy: 1200}, minutes: 30},
  {cost: {fuel: 3600, steel: 4400, munitions: 1800, alloy: 2400}, minutes: 60},
];

/** Field Workshop effects: armour (damage taken x) and repair time (x). */
export function workshopArmour(level: number): number {
  return 1 - 0.06 * (clampLevel(level) - 1);
}
export function workshopRepairFactor(level: number): number {
  return 1 - 0.12 * (clampLevel(level) - 1);
}
const clampLevel = (level: number) => Math.max(1, Math.min(WORKSHOP_MAX_LEVEL, Math.floor(level)));

export const REPAIR_MINUTES = 2;
export const REPAIR_COST: Supplies = {fuel: 60, steel: 80, munitions: 0, alloy: 20};
/** With too few supplies a repair still happens, only slower. */
export const EMERGENCY_REPAIR_MINUTES = 8;
/** Enemy HP and damage grow this much per patrol after the first. */
export const WAVE_GROWTH = 0.08;
/** Company damage bonus per company level above 1: the lasting part of the company. */
export const COMPANY_DAMAGE_PER_LEVEL = 0.05;
export const REINFORCE_MINUTES = 5;
export const REINFORCE_COST: Supplies = {fuel: 150, steel: 250, munitions: 50, alloy: 100};
/** With too few supplies a replacement still comes, only slower: nobody is stuck. */
export const EMERGENCY_REINFORCE_MINUTES = 15;

export const XP_PER_KILL = 10;
export const XP_PER_WIN = 25;
/** Company level from experience: 100, 250, 450, 700 ... (provisional). */
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

export function encounterReward(wave: number): Supplies {
  const m = 1 + 0.25 * (Math.max(1, wave) - 1);
  return {fuel: Math.round(420 * m), steel: Math.round(520 * m), munitions: Math.round(240 * m), alloy: Math.round(280 * m)};
}

/** The robots of wave N. Wave 1 is the tutorial fight; a Walker joins from wave 2. */
export function waveEnemies(wave: number): Enemy[] {
  const kinds: EnemyKind[] = wave <= 1 ? ['crawler', 'crawler', 'crawler'] : ['crawler', 'walker', 'crawler', ...(wave >= 6 ? (['crawler'] as EnemyKind[]) : [])];
  const scale = 1 + WAVE_GROWTH * (Math.max(1, wave) - 1);
  return kinds.map((kind, i) => {
    const maxHp = Math.round(ENEMY_SPEC[kind].maxHp * scale);
    return {id: `w${wave}-e${i + 1}`, kind, hp: maxHp, maxHp};
  });
}

/* -------------------------------------------------------------------------- */
/* Tutorial                                                                   */
/* -------------------------------------------------------------------------- */

export interface TutorialStep {
  say: string;
  objective: string;
  /** 'next' for a button, else the action type that completes the step. */
  advance: 'next' | SandboxAction['type'] | 'workshop.done' | 'recovery.done' | 'encounter.won';
}

export const TUTORIAL: readonly TutorialStep[] = [
  {say: 'Commander, General Rider. This is the Field Sandbox: practice ground. Nothing here touches your real base.', objective: 'Read the briefing.', advance: 'next'},
  {say: 'This is your company: a Scout, an Assault and a Support chassis. The company keeps its experience even when a chassis is lost.', objective: 'Meet your company.', advance: 'next'},
  {say: 'Dominion Crawlers are moving on the salt flats. Start the patrol.', objective: 'Start the patrol.', advance: 'encounter.start'},
  {say: 'Your Scout marks a target and everyone hits it harder. Fire.', objective: 'Fire one volley.', advance: 'encounter.fire'},
  {say: 'Keep firing until every robot is down. Watch your Scout: Crawlers go for light armour.', objective: 'Win the encounter.', advance: 'encounter.won'},
  {say: 'Good work. Recover the supplies they were carrying.', objective: 'Collect supplies.', advance: 'encounter.claim'},
  {say: 'Supplies build things. Start the Field Workshop upgrade: better armour and faster repairs.', objective: 'Start the Workshop upgrade.', advance: 'workshop.start'},
  {say: 'A disabled chassis is repairable. Send the damaged one to repair. A destroyed one would be replaced instead.', objective: 'Repair or replace a damaged chassis.', advance: 'chassis.repair'},
  {say: 'Timers run on the clock, even if you close the page. Wait, or use the test clock, until the Workshop and repair finish.', objective: 'Finish the Workshop upgrade and the repair.', advance: 'recovery.done'},
  {say: 'Company ready. Every patrol is harder; a Walker hits hard enough to destroy a chassis. Run patrols as long as you like.', objective: 'Run another patrol.', advance: 'finish' as never},
];

/* -------------------------------------------------------------------------- */
/* Creation, validation                                                       */
/* -------------------------------------------------------------------------- */

function newChassis(role: Role, serial: number): Chassis {
  return {role, serial, hp: CHASSIS_SPEC[role].maxHp, status: 'ready', readyAt: null, sorties: 0};
}

export function createSandbox(now: number): SandboxState {
  return {
    schema: SANDBOX_SCHEMA,
    createdAt: now,
    clockOffsetMs: 0,
    tutorial: {step: 0, completed: false},
    company: {name: '1st Iron Company', xp: 0},
    chassis: {scout: newChassis('scout', 1), assault: newChassis('assault', 2), support: newChassis('support', 3)},
    nextSerial: 4,
    supplies: {...START_SUPPLIES},
    workshop: {level: 1, job: null},
    encounter: null,
    wavesStarted: 0,
    stats: {trainingKills: 0, encountersWon: 0, chassisLost: 0, confirmedPvpDestructions: 0},
    ledger: [],
    applied: [],
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * A stored sandbox, or null when it is not one this build can trust (another
 * schema, a hand edit, a truncated write). The caller starts fresh on null;
 * a sandbox is never worth crashing the page over.
 */
export function parseSandbox(raw: unknown): SandboxState | null {
  if (!isObj(raw) || raw.schema !== SANDBOX_SCHEMA) return null;
  const s = raw as unknown as SandboxState;
  if (!isNum(s.createdAt) || !isNum(s.clockOffsetMs) || s.clockOffsetMs < 0) return null;
  if (!isObj(s.tutorial) || !isNum(s.tutorial.step) || typeof s.tutorial.completed !== 'boolean') return null;
  if (!isObj(s.company) || typeof s.company.name !== 'string' || !isNum(s.company.xp)) return null;
  if (!isObj(s.chassis) || !ROLES.every((r) => isObj(s.chassis[r]) && isNum(s.chassis[r].hp) && s.chassis[r].role === r)) return null;
  if (!isObj(s.supplies) || !SUPPLY_KINDS.every((k) => isNum(s.supplies[k]) && s.supplies[k] >= 0)) return null;
  if (!isObj(s.workshop) || !isNum(s.workshop.level)) return null;
  if (!isObj(s.stats) || s.stats.confirmedPvpDestructions !== 0) return null;
  if (!Array.isArray(s.ledger) || !Array.isArray(s.applied)) return null;
  return s;
}

/* -------------------------------------------------------------------------- */
/* Settle on read                                                             */
/* -------------------------------------------------------------------------- */

/** Fold in every timer that has finished by `now`. Idempotent. */
export function settle(state: SandboxState, now: number): SandboxState {
  let s = state;
  const job = s.workshop.job;
  if (job && job.completesAt <= now) {
    s = {...s, workshop: {level: Math.max(s.workshop.level, job.toLevel), job: null}};
  }
  for (const role of ROLES) {
    const c = s.chassis[role];
    if ((c.status === 'repairing' || c.status === 'reinforcing') && c.readyAt !== null && c.readyAt <= now) {
      const fresh = c.status === 'reinforcing' ? newChassis(role, c.serial) : {...c, hp: CHASSIS_SPEC[role].maxHp, status: 'ready' as const, readyAt: null};
      s = {...s, chassis: {...s.chassis, [role]: fresh}};
    }
  }
  if (!s.tutorial.completed && TUTORIAL[s.tutorial.step]?.advance === 'recovery.done') {
    const busy = s.workshop.job !== null || ROLES.some((r) => ['repairing', 'reinforcing'].includes(s.chassis[r].status));
    const upgraded = s.workshop.level >= 2;
    if (!busy && upgraded) s = advanceTutorial(s);
  }
  return s;
}

/* -------------------------------------------------------------------------- */
/* Actions                                                                    */
/* -------------------------------------------------------------------------- */

const APPLIED_KEEP = 200;

function advanceTutorial(s: SandboxState): SandboxState {
  const step = s.tutorial.step + 1;
  return {...s, tutorial: {step: Math.min(step, TUTORIAL.length - 1), completed: step >= TUTORIAL.length - 1}};
}

/** Advance the tutorial if the current step is completed by `event`. */
function tutorialOn(s: SandboxState, event: string): SandboxState {
  if (s.tutorial.completed) return s;
  let next = TUTORIAL[s.tutorial.step]?.advance === event ? advanceTutorial(s) : s;
  // Nothing to recover (the fight went cleanly): that objective cannot be
  // done, so it must not block the walkthrough.
  if (!next.tutorial.completed && TUTORIAL[next.tutorial.step]?.advance === 'chassis.repair') {
    const damaged = ROLES.some((r) => next.chassis[r].status !== 'ready');
    if (!damaged) next = advanceTutorial(next);
  }
  return next;
}

const canPay = (have: Supplies, cost: Supplies) => SUPPLY_KINDS.every((k) => have[k] >= cost[k]);
const pay = (have: Supplies, cost: Supplies): Supplies => {
  const out = {...have};
  for (const k of SUPPLY_KINDS) out[k] -= cost[k];
  return out;
};
const gain = (have: Supplies, add: Supplies): Supplies => {
  const out = {...have};
  for (const k of SUPPLY_KINDS) out[k] += add[k];
  return out;
};
const withLog = (e: Encounter, ...lines: string[]): Encounter => ({...e, log: [...e.log, ...lines].slice(-12)});

/** The instant the sandbox reads as now. */
export function sandboxNow(state: SandboxState, realNow: number): number {
  return realNow + state.clockOffsetMs;
}

/**
 * Apply one action, once. `actionId` must be unique per intent (a UUID made
 * when the button is pressed); replaying it returns the state unchanged.
 * `realNow` is the wall clock; the test clock offset is added here.
 */
export function applyAction(state: SandboxState, actionId: string, action: SandboxAction, realNow: number): ActionResult {
  if (!actionId) return {ok: false, state, error: 'Missing action id.'};
  if (state.applied.includes(actionId)) return {ok: true, state, note: null};
  const now = sandboxNow(state, realNow);
  const settled = settle(state, now);
  const result = reduce(settled, action, now);
  if (!result.ok) return {...result, state: settled};
  return {...result, state: {...result.state, applied: [...result.state.applied, actionId].slice(-APPLIED_KEEP)}};
}

function reduce(s: SandboxState, action: SandboxAction, now: number): ActionResult {
  const fail = (error: string): ActionResult => ({ok: false, state: s, error});
  const done = (state: SandboxState, note: string | null = null): ActionResult => ({ok: true, state, note});

  switch (action.type) {
    case 'tutorial.next': {
      const step = TUTORIAL[s.tutorial.step];
      if (s.tutorial.completed || step?.advance !== 'next') return fail('Finish the current objective first.');
      return done(advanceTutorial(s));
    }
    case 'tutorial.skip':
      return done({...s, tutorial: {step: TUTORIAL.length - 1, completed: true}});

    case 'company.rename': {
      const name = action.name.trim().replace(/\s+/g, ' ');
      if (name.length < 3 || name.length > 32) return fail('A company name is 3 to 32 characters.');
      return done({...s, company: {...s.company, name}});
    }

    case 'clock.advance': {
      if (!Number.isInteger(action.minutes) || action.minutes < 1 || action.minutes > 24 * 60) return fail('Advance 1 minute to 24 hours.');
      const next = {...s, clockOffsetMs: s.clockOffsetMs + action.minutes * MIN};
      return done(settle(next, now + action.minutes * MIN), `Test clock +${action.minutes} min (sandbox only).`);
    }

    case 'encounter.start': {
      if (s.encounter?.status === 'active') return fail('A patrol is already under way.');
      if (s.encounter && s.encounter.status === 'won' && !s.encounter.claimed) return fail('Collect the supplies from the last patrol first.');
      if (!ROLES.some((r) => s.chassis[r].status === 'ready')) return fail('No chassis is ready. Repair or replace one first.');
      // Difficulty follows wins, not attempts: a lost patrol is retried at the same strength.
      const wave = s.stats.encountersWon + 1;
      const attempt = s.wavesStarted + 1;
      const encounter: Encounter = {id: `enc-${attempt}`, wave, enemies: waveEnemies(wave), round: 0, status: 'active', log: [`Patrol ${wave}: contact.`], claimed: false};
      const chassis = {...s.chassis};
      for (const r of ROLES) if (chassis[r].status === 'ready') chassis[r] = {...chassis[r], sorties: chassis[r].sorties + 1};
      return done(tutorialOn({...s, encounter, wavesStarted: attempt, chassis}, 'encounter.start'));
    }

    case 'encounter.retreat': {
      const e = s.encounter;
      if (!e || e.status !== 'active') return fail('There is no patrol to pull out of.');
      return done({...s, encounter: withLog({...e, status: 'lost'}, 'Company withdrew. No supplies recovered.')});
    }

    case 'encounter.fire':
      return fire(s);

    case 'encounter.claim': {
      const e = s.encounter;
      if (!e || e.status !== 'won') return fail('There is nothing to collect.');
      const key = `reward:${e.id}`;
      if (e.claimed || s.ledger.includes(key)) return fail('Already collected.');
      const reward = encounterReward(e.wave);
      const next = {...s, supplies: gain(s.supplies, reward), encounter: {...e, claimed: true}, ledger: [...s.ledger, key]};
      return done(tutorialOn(next, 'encounter.claim'), `Recovered ${reward.fuel} Fuel, ${reward.steel} Steel, ${reward.munitions} Munitions, ${reward.alloy} Alloy.`);
    }

    case 'workshop.start': {
      if (s.workshop.job) return fail('The Workshop is already upgrading.');
      const toLevel = s.workshop.level + 1;
      const step = WORKSHOP_STEPS[toLevel];
      if (!step) return fail('The Workshop is at its sandbox maximum.');
      if (!canPay(s.supplies, step.cost)) return fail(shortLine(s.supplies, step.cost));
      const next = {...s, supplies: pay(s.supplies, step.cost), workshop: {...s.workshop, job: {toLevel, completesAt: now + step.minutes * MIN}}};
      return done(tutorialOn(next, 'workshop.start'));
    }

    case 'chassis.repair': {
      const c = s.chassis[action.role];
      if (!c) return fail('No such chassis.');
      const damaged = c.status === 'disabled' || (c.status === 'ready' && c.hp < CHASSIS_SPEC[c.role].maxHp);
      if (!damaged) return fail(c.status === 'destroyed' ? 'Destroyed chassis cannot be repaired. Replace it.' : 'That chassis does not need repair.');
      if (s.encounter?.status === 'active') return fail('Repairs start once the patrol is over.');
      const paid = canPay(s.supplies, REPAIR_COST);
      const minutes = (paid ? REPAIR_MINUTES : EMERGENCY_REPAIR_MINUTES) * workshopRepairFactor(s.workshop.level);
      const next = {
        ...s,
        supplies: paid ? pay(s.supplies, REPAIR_COST) : s.supplies,
        chassis: {...s.chassis, [action.role]: {...c, status: 'repairing' as const, readyAt: now + Math.round(minutes * MIN)}},
      };
      return done(tutorialOn(next, 'chassis.repair'), paid ? null : 'Not enough supplies: field crews patch it for free, slower.');
    }

    case 'chassis.reinforce': {
      const c = s.chassis[action.role];
      if (!c) return fail('No such chassis.');
      if (c.status !== 'destroyed') return fail('Only a destroyed chassis is replaced.');
      if (s.encounter?.status === 'active') return fail('Replacements arrive once the patrol is over.');
      const paid = canPay(s.supplies, REINFORCE_COST);
      const minutes = paid ? REINFORCE_MINUTES : EMERGENCY_REINFORCE_MINUTES;
      const next = {
        ...s,
        supplies: paid ? pay(s.supplies, REINFORCE_COST) : s.supplies,
        nextSerial: s.nextSerial + 1,
        chassis: {...s.chassis, [action.role]: {...c, serial: s.nextSerial, status: 'reinforcing' as const, readyAt: now + minutes * MIN, sorties: 0}},
      };
      // A replacement completes the recovery objective the same way a repair does.
      const tut = TUTORIAL[next.tutorial.step]?.advance === 'chassis.repair' ? advanceTutorial(next) : next;
      return done(tut, paid ? null : 'Not enough supplies: an emergency replacement is on its way, slower.');
    }
  }
}

function shortLine(have: Supplies, cost: Supplies): string {
  const k = SUPPLY_KINDS.find((x) => have[x] < cost[x]);
  return k ? `Need ${cost[k] - have[k]} more ${k[0].toUpperCase()}${k.slice(1)}. Win a patrol to recover supplies.` : 'Not enough supplies.';
}

/** One volley and the robots' answer. Deterministic. */
function fire(s: SandboxState): ActionResult {
  const e0 = s.encounter;
  if (!e0 || e0.status !== 'active') return {ok: false, state: s, error: 'There is no patrol under way.'};
  const round = e0.round + 1;
  const chassis = {...s.chassis};
  const ready = () => ROLES.filter((r) => chassis[r].status === 'ready');
  if (ready().length === 0) return {ok: false, state: s, error: 'No chassis can fire.'};

  let enemies = e0.enemies.map((x) => ({...x}));
  const lines: string[] = [`Round ${round}.`];
  let ledger = s.ledger;
  let kills = 0;

  // Support patches first, so a chassis on the edge gets a chance.
  if (chassis.support.status === 'ready') {
    const hurt = ready()
      .filter((r) => chassis[r].hp < CHASSIS_SPEC[r].maxHp)
      .sort((a, b) => chassis[a].hp / CHASSIS_SPEC[a].maxHp - chassis[b].hp / CHASSIS_SPEC[b].maxHp)[0];
    if (hurt) {
      const hp = Math.min(CHASSIS_SPEC[hurt].maxHp, chassis[hurt].hp + SUPPORT_HEAL);
      lines.push(`Support patches ${CHASSIS_SPEC[hurt].label} (+${hp - chassis[hurt].hp}).`);
      chassis[hurt] = {...chassis[hurt], hp};
    }
  }

  // Focus fire: marked (weakest) target with a Scout, else the first robot.
  const marked = chassis.scout.status === 'ready';
  const veteran = 1 + COMPANY_DAMAGE_PER_LEVEL * (companyLevel(s.company.xp).level - 1);
  let volley = ready().reduce((sum, r) => sum + CHASSIS_SPEC[r].damage, 0) * veteran;
  volley = Math.round(marked ? volley * (1 + SCOUT_MARK_BONUS) : volley);
  const alive = () => enemies.filter((x) => x.hp > 0);
  const order = marked ? [...alive()].sort((a, b) => a.hp - b.hp) : alive();
  lines.push(`${marked ? 'Scout marks. ' : ''}Company volley: ${volley}.`);
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
      // Crawlers go for light armour, Walkers for the Assault gun.
      const pick =
        enemy.kind === 'walker' && targets.includes('assault')
          ? 'assault'
          : [...targets].sort((a, b) => CHASSIS_SPEC[a].maxHp - CHASSIS_SPEC[b].maxHp)[0];
      const dmg = Math.round(ENEMY_SPEC[enemy.kind].damage * (1 + WAVE_GROWTH * (e0.wave - 1)) * armour);
      const hp = chassis[pick].hp - dmg;
      const label = CHASSIS_SPEC[pick].label;
      if (hp <= -OVERKILL_SHARE * CHASSIS_SPEC[pick].maxHp) {
        chassis[pick] = {...chassis[pick], hp: 0, status: 'destroyed'};
        lost += 1;
        lines.push(`${ENEMY_SPEC[enemy.kind].label} hits ${label} for ${dmg}: DESTROYED.`);
      } else if (hp <= 0) {
        chassis[pick] = {...chassis[pick], hp: 0, status: 'disabled'};
        lines.push(`${ENEMY_SPEC[enemy.kind].label} hits ${label} for ${dmg}: disabled.`);
      } else {
        chassis[pick] = {...chassis[pick], hp};
        lines.push(`${ENEMY_SPEC[enemy.kind].label} hits ${label} for ${dmg}.`);
      }
    }
    if (ready().length === 0) status = 'lost';
  }

  const xp = kills * XP_PER_KILL + (status === 'won' ? XP_PER_WIN : 0);
  if (status === 'won') lines.push(`Patrol ${e0.wave} won. +${xp} company XP.`);
  else if (status === 'lost') lines.push('Every chassis is down. The patrol is lost; recover your company.');

  let next: SandboxState = {
    ...s,
    chassis,
    ledger,
    encounter: withLog({...e0, round, enemies, status}, ...lines),
    company: {...s.company, xp: s.company.xp + xp},
    stats: {
      ...s.stats,
      trainingKills: s.stats.trainingKills + kills,
      encountersWon: s.stats.encountersWon + (status === 'won' ? 1 : 0),
      chassisLost: s.stats.chassisLost + lost,
    },
  };
  next = tutorialOn(next, 'encounter.fire');
  if (status === 'won') next = tutorialOn(next, 'encounter.won');
  return {ok: true, state: next, note: null};
}
