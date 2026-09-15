/**
 * What the map shows of a battle at any instant, derived ONLY from the
 * battle the engine already resolved (shared/sandbox.ts `resolveBattle`).
 *
 * The engine records every round as events: heals, the Scout's mark, the
 * volley and each hit it landed, and each Dominion hit with its outcome.
 * This file lays those events out on a fixed round clock and answers two
 * questions for a moment in time: what is every unit's HP and status right
 * now, and which effects are playing. Nothing here invents a shot, a number
 * or a casualty; a reload mid-fight lands on the same frame.
 *
 * Pure, no DOM: tools/tests/sandboxBeats.test.ts checks it against the engine.
 */
import {type AssetStatus, type BattleEvent, type Encounter, RESULT_MS, type Role, type RobotStatus, type UnitRef} from '../../shared/sandbox';

export type FxRef = {side: 'ally'; unit: UnitRef} | {side: 'enemy'; id: string};

export type FxType = 'shot' | 'bolt' | 'heal' | 'mark' | 'flash' | 'impact' | 'explosion' | 'float' | 'sparks' | 'lunge' | 'recoil';

export interface Fx {
  type: FxType;
  /** Milliseconds from the start of its round. */
  at: number;
  dur: number;
  from?: FxRef;
  to?: FxRef;
  text?: string;
  tone?: 'damage' | 'heal' | 'kill' | 'info';
  /** Asset shells and robot rounds look different. */
  heavy?: boolean;
}

export interface BattleFrame {
  /** Index of the round playing, or rounds.length once they are all over. */
  round: number;
  /** Milliseconds into that round. */
  inRound: number;
  /** All rounds have played; the result is showing or over. */
  over: boolean;
  /** The Victory / Defeat banner is up. */
  result: boolean;
  robots: Partial<Record<Role, {hp: number; status: RobotStatus}>>;
  assets: Record<string, {hp: number; status: AssetStatus}>;
  enemies: Record<string, number>;
  /** Effects of the current round (times relative to its start). */
  fx: Fx[];
}

/* Round clock, milliseconds. Every event of a round lands inside it. */
const HEAL_AT = 0;
const MARK_AT = 120;
const SHOT_AT = 300;
const SHOT_STEP = 60;
const SHOT_FLIGHT = 300;
const HIT_AT = 640;
const HIT_STEP = 110;
const ENEMY_AT = 1180;
const ENEMY_STEP = 210;
const BOLT_FLIGHT = 320;

const sameUnit = (a: UnitRef, b: UnitRef) => (a.kind === 'robot' && b.kind === 'robot' ? a.role === b.role : a.kind === 'asset' && b.kind === 'asset' && a.assetId === b.assetId);

/** When each event of a round takes effect, and the effects it plays. */
export function roundSchedule(events: BattleEvent[]): {land: number[]; fx: Fx[]} {
  const land: number[] = [];
  const fx: Fx[] = [];
  let hitIndex = 0;
  let enemyIndex = 0;
  const hits = events.filter((e): e is Extract<BattleEvent, {t: 'hit'}> => e.t === 'hit');
  for (const ev of events) {
    switch (ev.t) {
      case 'heal': {
        land.push(HEAL_AT + 300);
        fx.push({type: 'heal', at: HEAL_AT, dur: 420, from: {side: 'ally', unit: {kind: 'robot', role: 'support'}}, to: {side: 'ally', unit: ev.to}});
        fx.push({type: 'float', at: HEAL_AT + 260, dur: 900, to: {side: 'ally', unit: ev.to}, text: `+${ev.amount}`, tone: 'heal'});
        break;
      }
      case 'mark':
        land.push(MARK_AT);
        fx.push({type: 'mark', at: MARK_AT, dur: 900, to: {side: 'enemy', id: ev.target}});
        break;
      case 'volley': {
        land.push(SHOT_AT);
        // Each shooter fires at one of the targets the volley really hit, in turn.
        ev.shooters.forEach((unit, i) => {
          const target = hits[i % Math.max(1, hits.length)]?.target;
          if (!target) return;
          const at = SHOT_AT + i * SHOT_STEP;
          const heavy = unit.kind === 'asset';
          fx.push({type: 'flash', at, dur: 140, from: {side: 'ally', unit}, heavy});
          fx.push({type: 'recoil', at, dur: 220, to: {side: 'ally', unit}});
          fx.push({type: 'shot', at, dur: SHOT_FLIGHT, from: {side: 'ally', unit}, to: {side: 'enemy', id: target}, heavy});
        });
        break;
      }
      case 'hit': {
        const at = HIT_AT + hitIndex * HIT_STEP;
        hitIndex += 1;
        land.push(at);
        const to: FxRef = {side: 'enemy', id: ev.target};
        fx.push({type: 'impact', at, dur: 380, to});
        fx.push({type: 'float', at, dur: 950, to, text: `-${ev.dmg}`, tone: 'damage'});
        if (ev.destroyed) {
          fx.push({type: 'explosion', at: at + 40, dur: 760, to});
          fx.push({type: 'float', at: at + 180, dur: 1100, to, text: 'Destroyed', tone: 'kill'});
        }
        break;
      }
      case 'enemyHit': {
        const at = ENEMY_AT + enemyIndex * ENEMY_STEP;
        enemyIndex += 1;
        const from: FxRef = {side: 'enemy', id: ev.from};
        const to: FxRef = {side: 'ally', unit: ev.to};
        const hitAt = at + 80 + BOLT_FLIGHT;
        land.push(hitAt);
        fx.push({type: 'lunge', at, dur: 260, to: from});
        fx.push({type: 'flash', at: at + 80, dur: 140, from});
        fx.push({type: 'bolt', at: at + 80, dur: BOLT_FLIGHT, from, to});
        fx.push({type: 'impact', at: hitAt, dur: 360, to});
        fx.push({type: 'float', at: hitAt, dur: 950, to, text: `-${ev.dmg}`, tone: 'damage'});
        if (ev.outcome !== 'hit') {
          fx.push({type: ev.outcome === 'destroyed' ? 'explosion' : 'sparks', at: hitAt + 50, dur: 640, to});
          fx.push({type: 'float', at: hitAt + 200, dur: 1200, to, text: ev.outcome === 'destroyed' ? 'DESTROYED' : ev.to.kind === 'asset' ? 'Knocked out' : 'Disabled', tone: 'kill'});
        }
        break;
      }
    }
  }
  return {land, fx};
}

/** The latest moment any event of a round lands: always inside the round. */
export function roundLength(events: BattleEvent[]): number {
  return Math.max(0, ...roundSchedule(events).fx.map((f) => f.at + (f.type === 'float' ? 0 : f.dur)));
}

function applyEvent(ev: BattleEvent, v: {robots: BattleFrame['robots']; assets: BattleFrame['assets']; enemies: Record<string, number>}) {
  const setUnit = (u: UnitRef, hp: number, status?: string) => {
    if (u.kind === 'robot') v.robots[u.role] = {hp, status: (status as RobotStatus) ?? v.robots[u.role]?.status ?? 'ready'};
    else v.assets[u.assetId] = {hp, status: (status as AssetStatus) ?? v.assets[u.assetId]?.status ?? 'ready'};
  };
  if (ev.t === 'heal') setUnit(ev.to, ev.hpAfter);
  else if (ev.t === 'hit') v.enemies[ev.target] = ev.hpAfter;
  else if (ev.t === 'enemyHit') setUnit(ev.to, ev.hpAfter, ev.outcome === 'hit' ? 'ready' : ev.outcome);
}

/** The battle as it stands `now` (sandbox time), for a round of `roundMs`. */
export function battleFrame(e: Encounter, now: number, roundMs: number): BattleFrame {
  const view = {
    robots: Object.fromEntries(Object.entries(e.before.robots).map(([k, v]) => [k, {...v}])) as BattleFrame['robots'],
    assets: Object.fromEntries(Object.entries(e.before.assets).map(([k, v]) => [k, {...v}])) as BattleFrame['assets'],
    enemies: Object.fromEntries(e.enemiesStart.map((x) => [x.id, x.maxHp])) as Record<string, number>,
  };
  const elapsed = Math.max(0, now - e.startsAt);
  const round = Math.min(e.rounds.length, Math.floor(elapsed / roundMs));
  for (let r = 0; r < round; r += 1) for (const ev of e.rounds[r]) applyEvent(ev, view);
  let fx: Fx[] = [];
  const inRound = elapsed - round * roundMs;
  if (round < e.rounds.length) {
    const events = e.rounds[round];
    const sched = roundSchedule(events);
    events.forEach((ev, i) => {
      if (sched.land[i] <= inRound) applyEvent(ev, view);
    });
    fx = sched.fx;
  }
  const over = round >= e.rounds.length;
  return {round, inRound, over, result: over && elapsed < e.rounds.length * roundMs + RESULT_MS, ...view, fx};
}

export {sameUnit};
