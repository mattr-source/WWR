/**
 * What the battlefield plays, derived ONLY from real state transitions.
 *
 * The engine (shared/sandbox.ts) decides everything the instant an action is
 * applied. This file looks at the state before and after that action - and,
 * for a volley, at the combat log lines the engine wrote - and turns the
 * difference into a short timeline: who fired, what was hit for how much,
 * what was destroyed, what was collected, what finished repairing. Nothing
 * here invents a shot, a number or an outcome.
 *
 * Pure, no DOM: tools/tests/sandboxBeats.test.ts checks every timeline
 * against the engine it describes.
 */
import {
  ENEMY_SPEC,
  ROLES,
  type Role,
  type SandboxAction,
  type SandboxState,
  SUPPLY_KINDS,
  type SupplyKind,
} from '../../shared/sandbox';

export type UnitRef = {side: 'ally'; role: Role} | {side: 'enemy'; id: string} | {side: 'workshop'} | {side: 'hud'; supply: SupplyKind};

export type FxType =
  | 'shot' // ally projectile, from -> to
  | 'bolt' // enemy projectile, from -> to
  | 'heal' // support beam, from -> to
  | 'mark' // scout reticle on a target
  | 'flash' // muzzle flash at `from`
  | 'impact' // small hit at `to`
  | 'explosion' // unit destroyed at `to`
  | 'float' // floating text at `to`
  | 'recoil' // unit kicks back
  | 'lunge' // enemy leans in to fire
  | 'enter' // unit arrives on the field
  | 'withdraw' // unit pulls back
  | 'crate' // supply crate lifts from `from` to the HUD
  | 'sparks' // welding sparks at `to`
  | 'drone' // repair drone from workshop to unit
  | 'burst' // completion flare at `to`
  | 'drop'; // replacement chassis lands

export interface Fx {
  type: FxType;
  /** Milliseconds from the start of the timeline. */
  at: number;
  dur: number;
  from?: UnitRef;
  to?: UnitRef;
  text?: string;
  tone?: 'damage' | 'heal' | 'kill' | 'supply' | 'xp' | 'info';
}

/** A displayed value catches up with the real one at `at`. */
export type ViewUpdate =
  | {at: number; kind: 'ally'; role: Role; hp: number; status: string}
  | {at: number; kind: 'enemy'; id: string; hp: number}
  | {at: number; kind: 'supplies'};

export interface Timeline {
  fx: Fx[];
  updates: ViewUpdate[];
  /** Banner shown at its `at` for `dur`. */
  banner: {text: string; tone: 'win' | 'loss' | 'info'; at: number; dur: number} | null;
  /** When every effect has finished and the view equals the real state. */
  duration: number;
}

const EMPTY: Timeline = {fx: [], updates: [], banner: null, duration: 0};

const ROLE_BY_LABEL: Record<string, Role> = {Scout: 'scout', Assault: 'assault', Support: 'support'};

/** The log lines one volley added: everything after its "Round N." marker. */
export function roundLines(after: SandboxState): string[] {
  const e = after.encounter;
  if (!e) return [];
  const marker = `Round ${e.round}.`;
  const at = e.log.lastIndexOf(marker);
  return at < 0 ? [] : e.log.slice(at + 1);
}

interface Hit {
  role: Role;
  dmg: number;
  outcome: 'hit' | 'disabled' | 'destroyed';
}

export function parseHits(lines: string[]): Hit[] {
  const out: Hit[] = [];
  for (const line of lines) {
    const m = /^Dominion (?:Crawler|Walker) hits (Scout|Assault|Support) for (\d+)(: disabled|: DESTROYED)?\.$/.exec(line);
    if (!m) continue;
    out.push({role: ROLE_BY_LABEL[m[1]], dmg: Number(m[2]), outcome: m[3] === ': disabled' ? 'disabled' : m[3] === ': DESTROYED' ? 'destroyed' : 'hit'});
  }
  return out;
}

function parseHeal(lines: string[]): {role: Role; amount: number} | null {
  for (const line of lines) {
    const m = /^Support patches (Scout|Assault|Support) \(\+(\d+)\)\.$/.exec(line);
    if (m) return {role: ROLE_BY_LABEL[m[1]], amount: Number(m[2])};
  }
  return null;
}

/**
 * Timings in milliseconds; `scale` 0 collapses the timeline for
 * prefers-reduced-motion (the real state shows at once, text still appears).
 */
export function timelineFor(before: SandboxState, after: SandboxState, action: SandboxAction, scale = 1): Timeline {
  if (before === after) return EMPTY;
  const t = (ms: number) => Math.round(ms * scale);
  switch (action.type) {
    case 'encounter.fire':
      return volley(before, after, t);
    case 'encounter.start':
      return deploy(after, t);
    case 'encounter.retreat':
      return {
        fx: ROLES.filter((r) => after.chassis[r].status === 'ready').map((role) => ({type: 'withdraw' as const, at: 0, dur: t(700), to: {side: 'ally' as const, role}})),
        updates: [],
        banner: {text: 'Company withdrawing', tone: 'info', at: 0, dur: t(1400) || 1400},
        duration: t(900),
      };
    case 'encounter.claim':
      return claim(before, after, t);
    case 'workshop.start':
      return {
        fx: [
          {type: 'sparks', at: 0, dur: t(900), to: {side: 'workshop'}},
          {type: 'float', at: t(100), dur: t(1200) || 1200, to: {side: 'workshop'}, text: `Upgrading to Lv ${after.workshop.job?.toLevel ?? after.workshop.level}`, tone: 'info'},
        ],
        updates: [{at: t(300), kind: 'supplies'}],
        banner: null,
        duration: t(900),
      };
    case 'chassis.repair':
    case 'chassis.reinforce': {
      const role = action.role;
      const c = after.chassis[role];
      const fx: Fx[] =
        action.type === 'chassis.repair'
          ? [
              {type: 'drone', at: 0, dur: t(900), from: {side: 'workshop'}, to: {side: 'ally', role}},
              {type: 'sparks', at: t(800), dur: t(700), to: {side: 'ally', role}},
            ]
          : [{type: 'float', at: 0, dur: t(1300) || 1300, to: {side: 'ally', role}, text: 'Replacement inbound', tone: 'info'}];
      return {fx, updates: [{at: t(400), kind: 'ally', role, hp: c.hp, status: c.status}, {at: t(400), kind: 'supplies'}], banner: null, duration: t(1000)};
    }
    default:
      return completionsFor(before, after, scale);
  }
}

function volley(before: SandboxState, after: SandboxState, t: (ms: number) => number): Timeline {
  const e0 = before.encounter;
  const e1 = after.encounter;
  if (!e0 || !e1 || e1.round !== e0.round + 1) return EMPTY;
  const lines = roundLines(after);
  const fx: Fx[] = [];
  const updates: ViewUpdate[] = [];
  let clock = 0;

  // 1. Support patches first (engine order).
  const heal = parseHeal(lines);
  const hp: Record<Role, number> = {scout: before.chassis.scout.hp, assault: before.chassis.assault.hp, support: before.chassis.support.hp};
  if (heal) {
    hp[heal.role] += heal.amount;
    fx.push({type: 'heal', at: 0, dur: t(450), from: {side: 'ally', role: 'support'}, to: {side: 'ally', role: heal.role}});
    fx.push({type: 'float', at: t(300), dur: t(900) || 900, to: {side: 'ally', role: heal.role}, text: `+${heal.amount}`, tone: 'heal'});
    updates.push({at: t(350), kind: 'ally', role: heal.role, hp: hp[heal.role], status: before.chassis[heal.role].status});
    clock = t(500);
  }

  // 2. The company's volley: shooters are the chassis that were ready.
  const shooters = ROLES.filter((r) => before.chassis[r].status === 'ready');
  const marked = lines.some((l) => l.startsWith('Scout marks.'));
  const damaged = e0.enemies
    .map((x) => ({before: x, after: e1.enemies.find((y) => y.id === x.id)!}))
    .filter((p) => p.after && p.after.hp < p.before.hp);
  // Focus order: the engine takes destroyed targets first (weakest first when marked), then the one it only damaged.
  const destroyed = damaged.filter((p) => p.after.hp <= 0);
  const order = [...(marked ? [...destroyed].sort((a, b) => a.before.hp - b.before.hp) : destroyed), ...damaged.filter((p) => p.after.hp > 0)];
  if (marked && order[0]) {
    fx.push({type: 'mark', at: clock, dur: t(700), to: {side: 'enemy', id: order[0].before.id}});
    clock += t(250);
  }
  order.forEach((p, i) => {
    const target = {side: 'enemy' as const, id: p.before.id};
    const start = clock + i * t(330);
    shooters.forEach((role, j) => {
      const at = start + j * t(90);
      fx.push({type: 'flash', at, dur: t(140), from: {side: 'ally', role}});
      fx.push({type: 'recoil', at, dur: t(220), to: {side: 'ally', role}});
      fx.push({type: 'shot', at, dur: t(260), from: {side: 'ally', role}, to: target});
    });
    const land = start + (shooters.length - 1) * t(90) + t(260);
    fx.push({type: 'impact', at: land, dur: t(320), to: target});
    fx.push({type: 'float', at: land, dur: t(1000) || 1000, to: target, text: `-${p.before.hp - Math.max(0, p.after.hp)}`, tone: 'damage'});
    updates.push({at: land, kind: 'enemy', id: p.before.id, hp: p.after.hp});
    if (p.after.hp <= 0) {
      fx.push({type: 'explosion', at: land + t(60), dur: t(700), to: target});
      fx.push({type: 'float', at: land + t(200), dur: t(1100) || 1100, to: target, text: `${ENEMY_SPEC[p.before.kind].label.replace('Dominion ', '')} destroyed`, tone: 'kill'});
    }
  });
  if (order.length) clock += (order.length - 1) * t(330) + (shooters.length - 1) * t(90) + t(260) + t(450);

  // 3. The robots answer: one hit line per surviving robot, in array order.
  const attackers = e1.enemies.filter((x) => x.hp > 0);
  parseHits(lines).forEach((hit, i) => {
    const enemy = attackers[i];
    if (!enemy) return;
    const from = {side: 'enemy' as const, id: enemy.id};
    const to = {side: 'ally' as const, role: hit.role};
    const at = clock + i * t(420);
    fx.push({type: 'lunge', at, dur: t(260), to: from});
    fx.push({type: 'flash', at: at + t(80), dur: t(140), from});
    fx.push({type: 'bolt', at: at + t(80), dur: t(280), from, to});
    const land = at + t(360);
    fx.push({type: 'impact', at: land, dur: t(320), to});
    fx.push({type: 'float', at: land, dur: t(1000) || 1000, to, text: `-${hit.dmg}`, tone: 'damage'});
    hp[hit.role] = hit.outcome === 'hit' ? hp[hit.role] - hit.dmg : 0;
    const status = hit.outcome === 'hit' ? 'ready' : hit.outcome;
    updates.push({at: land, kind: 'ally', role: hit.role, hp: hp[hit.role], status});
    if (hit.outcome !== 'hit') {
      fx.push({type: hit.outcome === 'destroyed' ? 'explosion' : 'sparks', at: land + t(60), dur: t(700), to});
      fx.push({type: 'float', at: land + t(220), dur: t(1200) || 1200, to, text: hit.outcome === 'destroyed' ? 'DESTROYED' : 'Disabled', tone: 'kill'});
    }
    if (i === parseHits(lines).length - 1) clock = land + t(500);
  });

  // 4. Outcome, once the last shot has landed.
  // Floating text may outlive the lock; the lock ends when the last shot, hit or blast does.
  const end = Math.max(clock, ...fx.filter((f) => f.type !== 'float').map((f) => f.at + f.dur));
  let banner: Timeline['banner'] = null;
  if (e1.status === 'won') {
    const xp = after.company.xp - before.company.xp;
    banner = {text: `Patrol ${e1.wave} won · +${xp} XP`, tone: 'win', at: end, dur: t(1800) || 1800};
  } else if (e1.status === 'lost') {
    banner = {text: 'Company down · recover and retry', tone: 'loss', at: end, dur: t(2200) || 2200};
  }
  // Finally the view equals the real state for everything touched.
  for (const role of ROLES) updates.push({at: end, kind: 'ally', role, hp: after.chassis[role].hp, status: after.chassis[role].status});
  for (const x of e1.enemies) updates.push({at: end, kind: 'enemy', id: x.id, hp: x.hp});
  return {fx, updates, banner, duration: end + (banner ? t(300) : 0)};
}

function deploy(after: SandboxState, t: (ms: number) => number): Timeline {
  const e = after.encounter;
  if (!e) return EMPTY;
  const fx: Fx[] = e.enemies.map((x, i) => ({type: 'enter' as const, at: i * t(140), dur: t(800), to: {side: 'enemy' as const, id: x.id}}));
  for (const role of ROLES) if (after.chassis[role].status === 'ready') fx.push({type: 'enter', at: 0, dur: t(600), to: {side: 'ally', role}});
  const duration = Math.max(0, ...fx.map((f) => f.at + f.dur));
  return {fx, updates: [], banner: {text: `Patrol ${e.wave} · contact`, tone: 'info', at: t(150), dur: t(1300) || 1300}, duration};
}

function claim(before: SandboxState, after: SandboxState, t: (ms: number) => number): Timeline {
  const e = after.encounter;
  if (!e) return EMPTY;
  const wrecks = e.enemies.map((x) => x.id);
  const gained = SUPPLY_KINDS.filter((k) => after.supplies[k] > before.supplies[k]);
  const fx: Fx[] = [];
  wrecks.forEach((id, i) => {
    const supply = gained[i % Math.max(1, gained.length)] ?? 'steel';
    fx.push({type: 'crate', at: i * t(160), dur: t(900), from: {side: 'enemy', id}, to: {side: 'hud', supply}});
  });
  gained.forEach((k, i) => {
    fx.push({type: 'float', at: t(700) + i * t(120), dur: t(1400) || 1400, to: {side: 'hud', supply: k}, text: `+${after.supplies[k] - before.supplies[k]}`, tone: 'supply'});
  });
  const land = t(700);
  return {fx, updates: [{at: land, kind: 'supplies'}], banner: {text: 'Supplies recovered', tone: 'win', at: 0, dur: t(1400) || 1400}, duration: Math.max(land, ...fx.map((f) => f.at + (f.type === 'float' ? t(400) : f.dur)))};
}

/**
 * Timers that finished between two reads (the once-a-second settle, a reload,
 * or the test clock): the Workshop level, a repaired or replaced chassis.
 */
export function completionsFor(before: SandboxState, after: SandboxState, scale = 1): Timeline {
  const t = (ms: number) => Math.round(ms * scale);
  const fx: Fx[] = [];
  let banner: Timeline['banner'] = null;
  if (after.workshop.level > before.workshop.level) {
    fx.push({type: 'burst', at: 0, dur: t(900), to: {side: 'workshop'}});
    fx.push({type: 'float', at: t(100), dur: t(1500) || 1500, to: {side: 'workshop'}, text: `Workshop Lv ${after.workshop.level}`, tone: 'xp'});
    banner = {text: `Field Workshop upgraded to Lv ${after.workshop.level}`, tone: 'win', at: 0, dur: t(1800) || 1800};
  }
  for (const role of ROLES) {
    const b = before.chassis[role];
    const a = after.chassis[role];
    if (a.status !== 'ready') continue;
    if (b.status === 'repairing') {
      fx.push({type: 'burst', at: 0, dur: t(800), to: {side: 'ally', role}});
      fx.push({type: 'float', at: t(100), dur: t(1300) || 1300, to: {side: 'ally', role}, text: 'Repaired', tone: 'heal'});
    } else if (b.status === 'reinforcing') {
      fx.push({type: 'drop', at: 0, dur: t(900), to: {side: 'ally', role}});
      fx.push({type: 'float', at: t(500), dur: t(1300) || 1300, to: {side: 'ally', role}, text: `New chassis #${String(a.serial).padStart(3, '0')}`, tone: 'heal'});
    }
  }
  if (!fx.length) return EMPTY;
  return {fx, updates: [], banner, duration: Math.max(...fx.map((f) => f.at + f.dur))};
}
