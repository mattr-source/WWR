/**
 * The Field Sandbox battlefield: an illustrated salt basin with the company
 * at the bottom, the Dominion patrol at the top and the Field Workshop in the
 * corner. Drawn in SVG from original shapes and the unit art under
 * public/sandbox/units/ - no canvas, no external assets.
 *
 * What it shows is the real state, or, while a timeline plays, the real state
 * a moment ago catching up hit by hit (see beats.ts). Effects are CSS
 * animations keyed to the timeline, so they restart cleanly and cost nothing
 * once finished. prefers-reduced-motion turns movement off (sandbox.css).
 */
import {type CSSProperties, type ReactNode, memo} from 'react';
import {
  CHASSIS_SPEC,
  type Enemy,
  ROLES,
  type Role,
  type SandboxState,
  WORKSHOP_STEPS,
} from '../../shared/sandbox';
import type {Fx, UnitRef} from './beats';

export const VIEW_W = 360;
export const VIEW_H = 600;

export interface View {
  allies: Record<Role, {hp: number; status: string}>;
  enemies: Record<string, number>;
}

export interface Point {
  x: number;
  y: number;
}

const ALLY_AT: Record<Role, Point> = {scout: {x: 76, y: 436}, assault: {x: 172, y: 466}, support: {x: 262, y: 410}};
const WORKSHOP_AT: Point = {x: 304, y: 544};
const ALLY_SIZE = 78;

export function enemyAt(index: number, count: number): Point {
  const span = count <= 3 ? 200 : 240;
  const x = VIEW_W / 2 - span / 2 + (count === 1 ? span / 2 : (span / (count - 1)) * index);
  const y = 262 - (index % 2 === (count % 2 === 0 ? 1 : 0) ? 22 : 0);
  return {x, y};
}

const enemySize = (e: Enemy) => (e.kind === 'walker' ? 104 : 74);

function locate(ref: UnitRef | undefined, state: SandboxState): Point {
  if (!ref) return {x: VIEW_W / 2, y: VIEW_H / 2};
  if (ref.side === 'ally') return ALLY_AT[ref.role];
  if (ref.side === 'workshop') return WORKSHOP_AT;
  if (ref.side === 'hud') {
    const i = ['fuel', 'steel', 'munitions', 'alloy'].indexOf(ref.supply);
    return {x: 50 + i * 87, y: -30};
  }
  const list = state.encounter?.enemies ?? [];
  const i = list.findIndex((x) => x.id === ref.id);
  return enemyAt(Math.max(0, i), list.length);
}

/** A fixed pseudo-random stream, so the terrain is the same on every render and device. */
function stream(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TERRAIN = (() => {
  const r = stream(1907);
  const cracks: string[] = [];
  for (let i = 0; i < 46; i += 1) {
    let x = -120 + r() * 600;
    let y = 90 + r() * 560;
    let d = `M${x.toFixed(0)} ${y.toFixed(0)}`;
    const steps = 3 + Math.floor(r() * 4);
    for (let s = 0; s < steps; s += 1) {
      x += (r() - 0.5) * 60;
      y += (r() - 0.35) * 34;
      d += ` L${x.toFixed(0)} ${y.toFixed(0)}`;
    }
    cracks.push(d);
  }
  const rocks = Array.from({length: 22}, () => {
    const y = 110 + r() * 520;
    const depth = 0.45 + (y / VIEW_H) * 0.8;
    return {x: -100 + r() * 560, y, rx: (5 + r() * 10) * depth, ry: (3 + r() * 6) * depth};
  }).filter((p) => !(p.y > 380 && p.y < 530 && p.x > 30 && p.x < 320) && !(p.y > 200 && p.y < 310 && p.x > 30 && p.x < 330));
  const craters = [
    {x: 40, y: 318, r: 26},
    {x: 300, y: 300, r: 18},
    {x: 150, y: 350, r: 14},
    {x: 360, y: 400, r: 30},
    {x: -20, y: 520, r: 34},
  ];
  return {cracks, rocks, craters};
})();

const Terrain = memo(function Terrain() {
  return (
    <g aria-hidden="true">
      <defs>
        <linearGradient id="sbx-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#efe4cf" />
          <stop offset="0.22" stopColor="#dcd0b6" />
          <stop offset="0.7" stopColor="#c9bb9c" />
          <stop offset="1" stopColor="#b3a482" />
        </linearGradient>
        <linearGradient id="sbx-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6eedd" stopOpacity="0.95" />
          <stop offset="1" stopColor="#f6eedd" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="sbx-vignette" cx="0.5" cy="0.45" r="0.75">
          <stop offset="0.6" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#2b2112" stopOpacity="0.45" />
        </radialGradient>
        <radialGradient id="sbx-crater" cx="0.5" cy="0.4" r="0.6">
          <stop offset="0" stopColor="#8d7f64" />
          <stop offset="0.8" stopColor="#b3a585" />
          <stop offset="1" stopColor="#d8ccb1" />
        </radialGradient>
        <filter id="sbx-gray">
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncR type="linear" slope="0.55" />
            <feFuncG type="linear" slope="0.55" />
            <feFuncB type="linear" slope="0.55" />
          </feComponentTransfer>
        </filter>
      </defs>
      <rect x="-600" y="-200" width="1560" height="1000" fill="url(#sbx-ground)" />
      {/* Far ridge and haze: depth. */}
      <path d="M-600 70 L-300 40 L-120 62 L-20 30 L60 58 L140 22 L230 52 L300 34 L400 60 L560 26 L960 64 V120 H-600 Z" fill="#a79a80" opacity="0.55" />
      <path d="M-600 96 L-200 80 L0 92 L110 72 L210 94 L320 78 L420 96 L960 84 V130 H-600 Z" fill="#bfb296" opacity="0.7" />
      <rect x="-600" y="-200" width="1560" height="360" fill="url(#sbx-haze)" />
      {/* Salt pan cracks and rocks. */}
      <g stroke="#a6977a" strokeWidth="1.2" fill="none" opacity="0.55">
        {TERRAIN.cracks.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      {TERRAIN.craters.map((c, i) => (
        <g key={i}>
          <ellipse cx={c.x} cy={c.y} rx={c.r * 1.5} ry={c.r * 0.7} fill="url(#sbx-crater)" />
          <ellipse cx={c.x} cy={c.y - c.r * 0.25} rx={c.r * 1.5} ry={c.r * 0.7} fill="none" stroke="#e7dcc4" strokeWidth="2" opacity="0.7" />
        </g>
      ))}
      {TERRAIN.rocks.map((p, i) => (
        <g key={i}>
          <ellipse cx={p.x + 2} cy={p.y + p.ry * 0.7} rx={p.rx} ry={p.ry * 0.6} fill="#6f6250" opacity="0.35" />
          <ellipse cx={p.x} cy={p.y} rx={p.rx} ry={p.ry} fill="#8f826b" />
          <ellipse cx={p.x - p.rx * 0.3} cy={p.y - p.ry * 0.35} rx={p.rx * 0.45} ry={p.ry * 0.35} fill="#b5a88e" />
        </g>
      ))}
      {/* Old tracks leading to the company's line. */}
      <path d="M-40 640 C60 560 120 520 150 420 S220 260 190 120" fill="none" stroke="#a89a7d" strokeWidth="9" strokeDasharray="3 7" opacity="0.45" />
      <path d="M0 660 C90 580 150 540 176 430 S250 270 214 120" fill="none" stroke="#a89a7d" strokeWidth="9" strokeDasharray="3 7" opacity="0.45" />
      {/* Drifting dust (off with reduced motion). */}
      <g className="sbx-dust" opacity="0.35">
        <ellipse cx="60" cy="260" rx="120" ry="14" fill="#fff8e8" />
        <ellipse cx="300" cy="380" rx="140" ry="12" fill="#fff8e8" />
      </g>
      <rect x="-600" y="-200" width="1560" height="1000" fill="url(#sbx-vignette)" />
    </g>
  );
});

function HpBar({x, y, w, value, max, tone}: {x: number; y: number; w: number; value: number; max: number; tone: string}) {
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  return (
    <g>
      <rect x={x - w / 2 - 1.5} y={y - 1.5} width={w + 3} height={8} rx={3} fill="#1b1712" opacity="0.85" />
      <rect className="sbx-hp" x={x - w / 2} y={y} width={w * pct} height={5} rx={2} fill={tone} />
    </g>
  );
}

function Chip({x, y, text, tone}: {x: number; y: number; text: string; tone: string}) {
  const w = text.length * 6.6 + 12;
  return (
    <g>
      <rect x={x - w / 2} y={y} width={w} height={17} rx={8.5} fill="#15110c" opacity="0.88" />
      <text x={x} y={y + 12.5} textAnchor="middle" fontSize="11" fontWeight="700" fill={tone} style={{letterSpacing: '0.04em'}}>
        {text}
      </text>
    </g>
  );
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function animStyle(f: Fx, extra: Record<string, string> = {}): CSSProperties {
  return {animationDelay: `${f.at}ms`, animationDuration: `${Math.max(1, f.dur)}ms`, ...extra} as CSSProperties;
}

/** The inner group a unit's own motion effects (recoil, lunge, enter...) play on. */
function Motion({fx, children}: {fx: Fx[]; children: ReactNode}) {
  return fx.reduce<ReactNode>(
    (inner, f, i) => (
      <g key={i} className={`sbx-${f.type}`} style={animStyle(f)}>
        {inner}
      </g>
    ),
    children,
  );
}

function sameRef(a: UnitRef | undefined, b: UnitRef): boolean {
  if (!a || a.side !== b.side) return false;
  if (a.side === 'ally' && b.side === 'ally') return a.role === b.role;
  if (a.side === 'enemy' && b.side === 'enemy') return a.id === b.id;
  return true;
}

const MOTION = new Set(['recoil', 'lunge', 'enter', 'withdraw']);

export default function Battlefield({
  state,
  view,
  fx,
  fxKey,
  now,
  highlightRole,
  onAllyTap,
}: {
  state: SandboxState;
  view: View;
  fx: Fx[];
  fxKey: number;
  now: number;
  highlightRole: Role | null;
  onAllyTap: (role: Role) => void;
}) {
  const e = state.encounter;
  const job = state.workshop.job;
  const jobMinutes = job ? WORKSHOP_STEPS[job.toLevel]?.minutes ?? 1 : 1;
  const jobPct = job ? Math.max(0, Math.min(1, 1 - (job.completesAt - now) / (jobMinutes * 60_000))) : 0;
  const motionFor = (ref: UnitRef) => fx.filter((f) => MOTION.has(f.type) && sameRef(f.to, ref));

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 h-full w-full select-none"
      style={{overflow: 'visible'}}
      role="img"
      aria-label={e?.status === 'active' ? `Battlefield: patrol ${e.wave}, round ${e.round}` : 'Battlefield: the salt flats'}
    >
      <Terrain />

      {/* Field Workshop */}
      <g transform={`translate(${WORKSHOP_AT.x} ${WORKSHOP_AT.y})`}>
        <ellipse cx="4" cy="26" rx="48" ry="12" fill="#3b3124" opacity="0.35" />
        <path d="M-40 22 V-6 L-10 -28 L24 -28 L40 -6 V22 Z" fill="#6b6a48" stroke="#2a2618" strokeWidth="2.5" />
        <path d="M-32 22 V0 H32 V22" fill="#3a3a28" stroke="#2a2618" strokeWidth="2" />
        <path d="M-32 6 H32 M-32 14 H32" stroke="#57563d" strokeWidth="2" />
        <path d="M-10 -28 L24 -28 L40 -6 H-40 Z" fill="#83825a" stroke="#2a2618" strokeWidth="2" />
        <g className={job ? 'sbx-crane' : undefined} style={{transformOrigin: '-30px -24px'}}>
          <path d="M-30 -24 L-58 -52 L-64 -40" fill="none" stroke="#f28c28" strokeWidth="4" strokeLinecap="round" />
          <path d="M-64 -40 V-30" stroke="#2a2618" strokeWidth="1.5" />
        </g>
        <Chip x={-10} y={26} text={job ? `LV ${state.workshop.level} → ${job.toLevel} · ${clock(job.completesAt - now)}` : `WORKSHOP LV ${state.workshop.level}`} tone={job ? '#ffb347' : '#f5d28a'} />
        {job && (
          <g>
            <circle r="15" cx="-62" cy="-2" fill="#15110c" opacity="0.85" />
            <circle r="12" cx="-62" cy="-2" fill="none" stroke="#3b3326" strokeWidth="4" />
            <circle
              r="12"
              cx="-62"
              cy="-2"
              fill="none"
              stroke="#f28c28"
              strokeWidth="4"
              strokeDasharray={`${(2 * Math.PI * 12 * jobPct).toFixed(1)} 999`}
              transform="rotate(-90 -62 -2)"
            />
            <g className="sbx-weld">
              <path d="M-4 -2 l-8 -6 M-2 -6 l2 -10 M2 -2 l9 -5" stroke="#ffe08a" strokeWidth="2" strokeLinecap="round" />
            </g>
          </g>
        )}
      </g>

      {/* Dominion patrol */}
      {e &&
        e.enemies.map((enemy, i) => {
          const p = enemyAt(i, e.enemies.length);
          const hp = view.enemies[enemy.id] ?? enemy.hp;
          const size = enemySize(enemy);
          const dead = hp <= 0;
          const ref: UnitRef = {side: 'enemy', id: enemy.id};
          const crate = e.status === 'won' && !e.claimed && dead;
          return (
            <g key={`${e.id}-${enemy.id}`} transform={`translate(${p.x} ${p.y})`}>
              <Motion fx={motionFor(ref)}>
                <ellipse cx="0" cy={size * 0.36} rx={size * 0.42} ry={size * 0.14} fill="#2d2418" opacity="0.28" />
                <g className={dead ? undefined : 'sbx-sway'} style={{animationDelay: `${i * -0.7}s`}}>
                  <image
                    href={`/sandbox/units/${enemy.kind}.svg`}
                    x={-size / 2}
                    y={-size / 2}
                    width={size}
                    height={size}
                    filter={dead ? 'url(#sbx-gray)' : undefined}
                    opacity={dead ? 0.75 : 1}
                    transform={dead ? 'rotate(18)' : undefined}
                  />
                </g>
                {dead ? (
                  <g className="sbx-smoke">
                    <circle cx="-6" cy="-8" r="9" fill="#4a4238" opacity="0.5" />
                    <circle cx="6" cy="-18" r="7" fill="#5c5448" opacity="0.4" />
                  </g>
                ) : (
                  <HpBar x={0} y={-size / 2 - 10} w={size * 0.7} value={hp} max={enemy.maxHp} tone="#e5483a" />
                )}
                {crate && (
                  <g className="sbx-crate-idle" transform="translate(0 26)">
                    <circle r="16" fill="#ffd66b" opacity="0.35" />
                    <rect x="-10" y="-8" width="20" height="16" rx="2" fill="#7c5a2b" stroke="#2a1f10" strokeWidth="2" />
                    <path d="M-10 -1 H10 M0 -8 V8" stroke="#e8c46a" strokeWidth="2" />
                  </g>
                )}
              </Motion>
            </g>
          );
        })}

      {!e && (
        <g className="sbx-sway" opacity="0.8">
          <Chip x={VIEW_W / 2} y={250} text="NO CONTACT · SALT FLATS" tone="#e8dcc4" />
        </g>
      )}

      {/* The company */}
      {ROLES.map((role) => {
        const c = state.chassis[role];
        const v = view.allies[role];
        const spec = CHASSIS_SPEC[role];
        const p = ALLY_AT[role];
        const status = v.status;
        const down = status === 'disabled' || status === 'destroyed' || status === 'reinforcing';
        const tone = status === 'ready' ? (v.hp / spec.maxHp > 0.5 ? '#43d17a' : '#f2b233') : status === 'destroyed' ? '#ef5a4a' : '#f2b233';
        const label =
          status === 'ready'
            ? spec.label.toUpperCase()
            : status === 'repairing'
              ? `REPAIRING ${c.readyAt ? clock(c.readyAt - now) : ''}`
              : status === 'reinforcing'
                ? `INBOUND ${c.readyAt ? clock(c.readyAt - now) : ''}`
                : status.toUpperCase();
        const ref: UnitRef = {side: 'ally', role};
        return (
          <g
            key={role}
            transform={`translate(${p.x} ${p.y})`}
            className="sbx-ally-enter"
            onClick={() => onAllyTap(role)}
            style={{cursor: 'pointer'}}
            role="button"
            aria-label={`${spec.label}: ${label}, ${v.hp} of ${spec.maxHp} HP`}
          >
            <rect x={-46} y={-50} width={92} height={112} fill="transparent" />
            {highlightRole === role && <circle className="sbx-pulse" r="46" fill="none" stroke="#67e8f9" strokeWidth="3" />}
            <Motion fx={motionFor(ref)}>
              <ellipse cx="0" cy="30" rx="34" ry="11" fill="#2d2418" opacity="0.3" />
              <ellipse cx="0" cy="4" rx="38" ry="38" fill="none" stroke={tone} strokeWidth="2" strokeDasharray="5 5" opacity="0.8" />
              <g className={status === 'ready' ? 'sbx-bob' : undefined} style={{animationDelay: `${ROLES.indexOf(role) * -0.6}s`}}>
                {status === 'reinforcing' ? (
                  <g className="sbx-beacon">
                    <circle r="22" fill="none" stroke="#67e8f9" strokeWidth="3" strokeDasharray="6 6" />
                    <path d="M0 -12 V12 M-12 0 H12" stroke="#67e8f9" strokeWidth="3" />
                  </g>
                ) : (
                  <image
                    href={`/sandbox/units/${role}.svg`}
                    x={-ALLY_SIZE / 2}
                    y={-ALLY_SIZE / 2}
                    width={ALLY_SIZE}
                    height={ALLY_SIZE}
                    filter={down ? 'url(#sbx-gray)' : undefined}
                    transform={status === 'destroyed' ? 'rotate(-16)' : undefined}
                    opacity={status === 'destroyed' ? 0.7 : 1}
                  />
                )}
              </g>
              {(status === 'disabled' || status === 'destroyed') && (
                <g className="sbx-smoke">
                  <circle cx="-8" cy="-10" r="10" fill="#4a4238" opacity="0.55" />
                  <circle cx="8" cy="-22" r="8" fill="#5c5448" opacity="0.45" />
                  {status === 'disabled' && <path className="sbx-weld" d="M10 4 l8 -4 M12 10 l9 2" stroke="#ffe08a" strokeWidth="2" strokeLinecap="round" />}
                </g>
              )}
              {status === 'repairing' && (
                <g>
                  <g className="sbx-orbit">
                    <g transform="translate(34 0)">
                      <rect x="-7" y="-5" width="14" height="10" rx="3" fill="#39424a" stroke="#101418" strokeWidth="1.5" />
                      <circle cx="0" cy="0" r="2.5" fill="#67e8f9" />
                    </g>
                  </g>
                  <g className="sbx-weld">
                    <path d="M-4 6 l-8 4 M2 8 l4 9 M6 2 l10 -2" stroke="#ffe08a" strokeWidth="2" strokeLinecap="round" />
                  </g>
                </g>
              )}
              <HpBar x={0} y={42} w={58} value={v.hp} max={spec.maxHp} tone={tone} />
              <Chip x={0} y={52} text={label} tone={tone} />
            </Motion>
          </g>
        );
      })}

      {/* Effects: one-shot, keyed to the timeline so they replay cleanly. */}
      <g key={fxKey} pointerEvents="none">
        {fx.map((f, i) => (
          <g key={i}>{renderEffect(f, state)}</g>
        ))}
      </g>
    </svg>
  );
}

function renderEffect(f: Fx, state: SandboxState): ReactNode {
  if (MOTION.has(f.type)) return null;
  const to = locate(f.to, state);
  const from = locate(f.from, state);
  const px = (n: number) => `${n.toFixed(1)}px`;
  // Allies fire from the muzzle (they face up), robots from the front (they face down).
  const muzzle = (ref: UnitRef | undefined, p: Point) => ({x: p.x, y: p.y + (ref?.side === 'ally' ? -32 : ref?.side === 'enemy' ? 26 : 0)});
  switch (f.type) {
    case 'shot':
    case 'bolt':
    case 'crate':
    case 'drone': {
      const a = f.type === 'crate' ? from : f.type === 'drone' ? from : muzzle(f.from, from);
      const b = f.type === 'drone' ? {x: to.x + 30, y: to.y - 20} : to;
      const vars = {'--fx': px(a.x), '--fy': px(a.y), '--tx': px(b.x), '--ty': px(b.y)};
      return (
        <g className={`sbx-travel${f.type === 'crate' ? ' sbx-travel-arc' : ''}`} style={animStyle(f, vars)}>
          {f.type === 'shot' && (
            <>
              <circle r="4" fill="#fff4b0" />
              <circle r="8" fill="#ffcf4a" opacity="0.45" />
            </>
          )}
          {f.type === 'bolt' && (
            <>
              <circle r="5" fill="#ff6a3d" />
              <circle r="10" fill="#ff3b1f" opacity="0.4" />
            </>
          )}
          {f.type === 'crate' && (
            <>
              <circle r="14" fill="#ffd66b" opacity="0.4" />
              <rect x="-9" y="-7" width="18" height="14" rx="2" fill="#7c5a2b" stroke="#2a1f10" strokeWidth="2" />
              <path d="M-9 0 H9 M0 -7 V7" stroke="#e8c46a" strokeWidth="2" />
            </>
          )}
          {f.type === 'drone' && (
            <>
              <rect x="-8" y="-5" width="16" height="10" rx="3" fill="#39424a" stroke="#101418" strokeWidth="1.5" />
              <circle r="2.5" fill="#67e8f9" />
            </>
          )}
        </g>
      );
    }
    case 'heal': {
      return (
        <line
          className="sbx-beam"
          x1={from.x}
          y1={from.y - 10}
          x2={to.x}
          y2={to.y - 10}
          stroke="#5ef0a0"
          strokeWidth="5"
          strokeLinecap="round"
          style={animStyle(f)}
        />
      );
    }
    case 'flash': {
      const m = muzzle(f.from, from);
      return (
        <g transform={`translate(${m.x} ${m.y})`}>
          <g className="sbx-pop" style={animStyle(f)}>
            <path d="M0 -14 L4 -4 L14 0 L4 4 L0 14 L-4 4 L-14 0 L-4 -4 Z" fill={f.from?.side === 'enemy' ? '#ff8a4a' : '#fff1a8'} />
          </g>
        </g>
      );
    }
    case 'mark':
      return (
        <g transform={`translate(${to.x} ${to.y})`}>
          <g className="sbx-mark" style={animStyle(f)}>
            <circle r="40" fill="none" stroke="#ff4d4d" strokeWidth="3" strokeDasharray="10 8" />
            <path d="M0 -50 V-34 M0 34 V50 M-50 0 H-34 M34 0 H50" stroke="#ff4d4d" strokeWidth="3" />
          </g>
        </g>
      );
    case 'impact':
      return (
        <g transform={`translate(${to.x} ${to.y})`}>
          <g className="sbx-pop" style={animStyle(f)}>
            <circle r="14" fill="#ffd27a" opacity="0.8" />
            <circle r="7" fill="#fff" />
          </g>
        </g>
      );
    case 'explosion':
      return (
        <g transform={`translate(${to.x} ${to.y})`}>
          <g className="sbx-boom" style={animStyle(f)}>
            <circle r="30" fill="#ff7a2f" opacity="0.85" />
            <circle r="18" fill="#ffd36b" />
            <circle r="44" fill="none" stroke="#fff1c2" strokeWidth="3" opacity="0.8" />
          </g>
          <g className="sbx-debris" style={animStyle(f)}>
            <path d="M0 0 L-30 -26 M0 0 L32 -20 M0 0 L-24 28 M0 0 L28 26" stroke="#3a2d22" strokeWidth="4" strokeLinecap="round" strokeDasharray="4 18" />
          </g>
        </g>
      );
    case 'sparks':
      return (
        <g transform={`translate(${to.x} ${to.y})`}>
          <g className="sbx-sparks" style={animStyle(f)}>
            <path d="M-6 -4 l-12 -8 M4 -8 l6 -14 M8 2 l14 -2 M-2 8 l-6 12" stroke="#ffe08a" strokeWidth="2.5" strokeLinecap="round" />
          </g>
        </g>
      );
    case 'burst':
      return (
        <g transform={`translate(${to.x} ${to.y})`}>
          <g className="sbx-boom" style={animStyle(f)}>
            <circle r="42" fill="none" stroke="#5ef0a0" strokeWidth="5" />
            <circle r="26" fill="#5ef0a0" opacity="0.3" />
          </g>
        </g>
      );
    case 'drop':
      return (
        <g transform={`translate(${to.x} ${to.y})`}>
          <g className="sbx-drop" style={animStyle(f)}>
            <path d="M-14 -20 H14 L10 16 H-10 Z" fill="#4a5560" stroke="#101418" strokeWidth="2" />
            <path d="M-10 16 L-4 26 H4 L10 16" fill="#ff9a3d" />
          </g>
          <g className="sbx-boom" style={{...animStyle(f), animationDelay: `${f.at + f.dur * 0.7}ms`, animationDuration: `${Math.max(1, f.dur * 0.5)}ms`}}>
            <ellipse rx="44" ry="14" cy="28" fill="#e8dcc4" opacity="0.7" />
          </g>
        </g>
      );
    case 'float': {
      const color = f.tone === 'damage' ? '#ffe2d6' : f.tone === 'heal' ? '#c9ffd9' : f.tone === 'kill' ? '#ffd36b' : f.tone === 'xp' ? '#bdf3ff' : '#ffffff';
      const fill = f.tone === 'damage' ? '#e5483a' : f.tone === 'heal' ? '#1f9d55' : f.tone === 'kill' ? '#7a3b10' : f.tone === 'xp' ? '#0e6f86' : '#2a2a2a';
      if (f.to?.side === 'hud') return null; // drawn by the HUD over the supply counters
      const y = f.to?.side === 'workshop' ? to.y - 56 : to.y - (f.tone === 'kill' ? 92 : 44);
      return (
        <g transform={`translate(${f.to?.side === 'workshop' ? to.x - 56 : to.x} ${y})`}>
          <g className="sbx-float" style={animStyle(f)}>
            <text
              textAnchor="middle"
              fontSize={f.tone === 'damage' ? 22 : 15}
              fontWeight="800"
              fill={color}
              stroke={fill}
              strokeWidth="5"
              paintOrder="stroke"
              style={{letterSpacing: '0.02em'}}
            >
              {f.text}
            </text>
          </g>
        </g>
      );
    }
    default:
      return null;
  }
}
