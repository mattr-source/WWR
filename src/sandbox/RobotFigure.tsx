/**
 * Field Sandbox robot art: hand-built layered SVG (temporary vector art).
 *
 * Humanoid robots in three roles. Each part slot is drawn by its own tier
 * (how many times that slot has been replaced), so every level-up changes one
 * visible component. Tiers fall into five internal art stages (salvage,
 * patched, refit, layered, powered); these are art buckets only and are never
 * shown to players. Styled as chunky bevelled blocks to sit beside the Asset
 * hero renders. Also draws the Dominion enemies.
 */
import {useId} from 'react';
import type {PartSlot, RobotRole} from '../../shared/sandboxSeason';
import './robotFigure.css';

export type FigureStatus = 'ready' | 'disabled' | 'destroyed' | 'repairing' | 'remanufacturing' | 'upgrading';
export const FIGURE_VIEWBOX = {width: 200, height: 260} as const;
/** Same unit scale as FIGURE_VIEWBOX: a walker is about 2.7 robots tall. */
export const DOMINION_VIEWBOX = {crawler: {width: 320, height: 220}, walker: {width: 420, height: 600}} as const;

type Stage = 0 | 1 | 2 | 3 | 4;
const STAGE_START = [0, 1, 3, 6, 9];
/** Internal art stage for a slot tier (not a player-facing name or ladder). */
export function figureStage(tier: number): Stage {
  const t = Math.max(0, Math.floor(tier || 0));
  return t === 0 ? 0 : t <= 2 ? 1 : t <= 5 ? 2 : t <= 8 ? 3 : 4;
}

const OL = '#1b1f1a';
const X = 100;
const SLOTS: PartSlot[] = ['head', 'torso', 'legs', 'arms', 'gear'];
// light, mid, dark per material; blocks get banded highlight / shade.
const MAT: Record<string, string> = {
  rust: '#d38c55 #a45a32 #62321b', scrap: '#aca290 #7b7364 #4b453b', olive: '#a6b65e #6b7a3a #414a21',
  sand: '#f8cd84 #e0a04a #a2661e', gun: '#89919a #545b62 #30353a', dk: '#595e58 #343831 #1e211d',
  amber: '#ffd291 #f28c28 #ad560e', iron: '#6a707b #3a3e47 #1b1d22', blood: '#e0705a #a8352b #5a1614',
};
const GLOSS = ['sand', 'olive', 'gun', 'iron', 'blood'];
const MID: Record<string, string> = {joint: '#5a5a52', scrap: '#7b7364', olive: '#6b7a3a', sand: '#e0a04a', gun: '#545b62', iron: '#3a3e47'};

type D = {hy: number; hw: number; hh: number; tt: number; sw: number; cb: number; ww: number; pb: number; aw: number; lw: number; hx: number; kn: number};
const DIMS: Record<RobotRole, D> = {
  scout: {hy: 64, hw: 20, hh: 17.5, tt: 92, sw: 27, cb: 136, ww: 18, pb: 160, aw: 15, lw: 19, hx: 15, kn: 203},
  assault: {hy: 73, hw: 19, hh: 16, tt: 94, sw: 40, cb: 144, ww: 27, pb: 168, aw: 21, lw: 25, hx: 20, kn: 207},
  support: {hy: 66, hw: 20, hh: 17.5, tt: 92, sw: 32, cb: 138, ww: 22, pb: 162, aw: 18, lw: 22, hx: 17, kn: 205},
};
interface C {r: D; role: RobotRole; t: number; s: Stage; i: number; f: (m: string) => string}

// ---------- drawing helpers ----------
const D = (s: TemplateStringsArray, ...v: number[]) => s.reduce((a, x, k) => a + Math.round(v[k - 1] * 10) / 10 + x);
const shine = (x: number, y: number, w: number) =>
  w > 5 ? <path d={D`M${x} ${y}h${w}`} stroke="#fff" strokeOpacity={0.55} strokeWidth={1.3} strokeLinecap="round" /> : null;
const B = (x: number, y: number, w: number, h: number, fill: string, rx = 3, sw = 1.8) => (
  <g>
    <rect x={x} y={y} width={w} height={h} rx={rx} fill={fill} stroke={OL} strokeWidth={sw} />
    {h > 7 && shine(x + rx + 1.5, y + 2.3, w - 2 * rx - 3)}
  </g>
);
const CB = (x: number, y: number, w: number, h: number, fill: string, k = 4, sw = 1.8) => (
  <g>
    <path d={D`M${x + k} ${y}H${x + w - k}L${x + w} ${y + k}V${y + h - k}L${x + w - k} ${y + h}H${x + k}L${x} ${y + h - k}V${y + k}Z`} fill={fill} stroke={OL} strokeWidth={sw} strokeLinejoin="round" />
    {h > 7 && shine(x + k + 1, y + 2.3, w - 2 * k - 2)}
  </g>
);
const P = (d: string, fill: string, sw = 1.8) => <path d={d} fill={fill} stroke={OL} strokeWidth={sw} strokeLinejoin="round" />;
const L = (d: string, c = OL, w = 1, o = 1, dash?: string) => (
  <path d={d} fill="none" stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" opacity={o} strokeDasharray={dash} />
);
const Ci = (x: number, y: number, r: number, fill: string, sw = 1.6) => <circle cx={x} cy={y} r={r} fill={fill} stroke={OL} strokeWidth={sw} />;
const riv = (...p: number[]) => p.filter((_, k) => k % 2 === 0).map((x, k) => <circle key={k} cx={x} cy={p[k * 2 + 1]} r={1.2} fill="#efe6cf" stroke={OL} strokeWidth={0.5} />);
const weld = (d: string) => L(d, '#f6e6b4', 1.2, 0.9, '1.8 1.4');
const tube = (d: string, c: string, w: number) => <g>{L(d, OL, w + 3)}{L(d, c, w)}{L(d, '#fff', 1, 0.3)}</g>;
const strip = (x: number, y: number, w: number, h: number, red = false) => (
  <rect className="rf-eye" x={x} y={y} width={w} height={h} rx={Math.min(w, h) / 2} fill={red ? '#ff6a55' : '#8ff3ff'} stroke={red ? '#3a0906' : '#0f3a44'} strokeWidth={0.8} />
);
const lamp = (c: C | ((m: string) => string), x: number, y: number, r: number, col: 'c' | 'a' | 'r' = 'c') => {
  const f = typeof c === 'function' ? c : c.f;
  return (
    <g className="rf-eye">
      <circle cx={x} cy={y} r={r * 2.7} fill={f('halo' + col)} />
      <circle cx={x} cy={y} r={r} fill={col === 'r' ? '#ff5446' : col === 'a' ? '#ffc86e' : '#c8f8ff'} stroke={OL} strokeWidth={0.7} />
    </g>
  );
};
const glow = (d: string, w = 1.3, red = false) => <g className="rf-eye">{L(d, red ? '#ff3b30' : '#5fe3ff', w * 3, 0.4)}{L(d, red ? '#ffd0c8' : '#effdff', w)}</g>;
const spec = (x: number, y: number, rx: number, ry: number, rot = -20) => (
  <ellipse cx={x} cy={y} rx={rx} ry={ry} fill="#fff" opacity={0.42} transform={`rotate(${rot} ${x} ${y})`} />
);
const rot = (a: number, x: number, y: number) => `rotate(${Math.round(a * 10) / 10} ${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10})`;

function Defs({u}: {u: string}) {
  return (
    <defs>
      {Object.keys(MAT).flatMap((k) => {
        const [l, m, d] = MAT[k].split(' ');
        const band = (id: string, stops: [number, string][]) => (
          <linearGradient key={id} id={u + id} x1="0" y1="0" x2="0.3" y2="1">
            {stops.map(([o, c]) => <stop key={o} offset={o} stopColor={c} />)}
          </linearGradient>
        );
        const out = [band(k, [[0, l], [0.3, l], [0.42, m], [0.7, m], [0.82, d], [1, d]])];
        if (GLOSS.includes(k)) out.push(band(k + '4', [[0, '#fffbe8'], [0.1, l], [0.34, l], [0.38, m], [0.72, m], [0.78, d], [1, d]]));
        return out;
      })}
      <linearGradient id={u + 'joint'} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#262622" />
        <stop offset="0.4" stopColor="#a4a296" />
        <stop offset="1" stopColor="#2a2a26" />
      </linearGradient>
      {[['c', '#8ff3ff'], ['a', '#ffbe55'], ['r', '#ff3b30']].map(([k, c]) => (
        <radialGradient key={k} id={u + 'halo' + k}>
          <stop offset="0" stopColor={c} stopOpacity="0.45" />
          <stop offset="1" stopColor={c} stopOpacity="0" />
        </radialGradient>
      ))}
      <filter id={u + 'ol'} x="-15%" y="-15%" width="130%" height="130%">
        <feComponentTransfer in="SourceAlpha" result="a">
          <feFuncA type="discrete" tableValues="0 0 1 1" />
        </feComponentTransfer>
        <feMorphology in="a" operator="dilate" radius="1.4" result="m" />
        <feFlood floodColor={OL} />
        <feComposite in2="m" operator="in" />
        <feMerge>
          <feMergeNode />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id={u + 'char'}>
        <feColorMatrix type="matrix" values="0.3 0.22 0.08 0 0.02  0.2 0.22 0.08 0 0.01  0.16 0.16 0.1 0 0.01  0 0 0 1 0" />
      </filter>
      <filter id={u + 'hl'} x="-30%" y="-30%" width="160%" height="160%">
        <feMorphology in="SourceAlpha" operator="dilate" radius="3" />
        <feGaussianBlur stdDeviation="2.2" result="b" />
        <feFlood floodColor="#ffcf4d" />
        <feComposite in2="b" operator="in" />
      </filter>
    </defs>
  );
}

// ---------- head ----------
function roleHead(c: C) {
  const {r, s, f, role} = c;
  const y = r.hy, w = r.hw, h = r.hh;
  if (s === 0) return null;
  if (role === 'scout')
    return <g>{B(X - w - 7, y - 7, 8, 13, f(s > 2 ? 'gun' : 'scrap'), 2, 1.5)}{lamp(c, X - w - 3, y - 1, 2, s > 2 ? 'c' : 'a')}</g>;
  if (role === 'assault') return CB(X - w + 1, y + h - 4, 2 * w - 2, 8, f(s > 2 ? 'gun' : 'scrap'), 3, 1.5);
  return <g>{Ci(X + w + 1, y + 1, 5.5, f('gun'))}{L(D`M${X + w + 2} ${y + 5}Q${X + w} ${y + h + 3} ${X + 5} ${y + h + 1}`, OL, 1.6)}</g>;
}

function head(c: C) {
  const {r, s, i, f} = c;
  const y = r.hy, w = r.hw, h = r.hh, nh = r.tt - y - h + 8;
  const neck = (m: string) => B(X - 6, y + h - 4, 12, nh, f(m), 2);
  if (s === 0)
    return (
      <g>
        {neck('joint')}
        {L(D`M${X - 4} ${y + h}q-7 10 -2 19`, '#b8412f', 1.6)}
        <g transform={rot(-4, X, y)}>
          {B(X - w, y - h, 2 * w, 2 * h, f('rust'), 5, 2)}
          {B(X - w - 1, y - h - 2, w + 1, 10, f('scrap'), 2, 1.4)}
          {riv(X - w + 2, y - h + 1, X - 3, y - h + 1, X - w + 2, y - h + 5.5, X - 3, y - h + 5.5)}
          {B(X - w + 4, y + h - 9, 2 * w - 9, 6, f('dk'), 2, 1.2)}
          {L(D`M${X - w + 8} ${y + h - 8}v4M${X - w + 12} ${y + h - 8}v4M${X - w + 16} ${y + h - 8}v4M${X - w + 20} ${y + h - 8}v4`, '#948a76', 1.1)}
          {Ci(X - 6, y, 7.5, f('dk'), 1.8)}
          <circle className="rf-eye" cx={X - 6} cy={y} r={4.8} fill="#f0a340" />
          {L(D`M${X - 10} ${y - 4}l4 4l-1.5 3.5M${X - 6} ${y}l4.5 -2`, '#fff6df', 0.9)}
          {B(X + 4, y - 5, 10, 10, f('scrap'), 2, 1.5)}
          <circle className="rf-eye" cx={X + 9} cy={y} r={2.3} fill="#ffb347" />
          {L(D`M${X + w - 3} ${y - 7}q3 3 0 8`, '#3a1e10', 1.1, 0.7)}
        </g>
        {L(D`M${X + w - 6} ${y - h}l3 -11l7 -4`, '#34342f', 2.4)}
        {B(X + w + 1, y - h - 18, 8, 6, f('scrap'), 1, 1.2)}
        {B(X + w - 5, y - h - 9, 5, 3.5, '#d8c79a', 0.5, 0.8)}
      </g>
    );
  if (s === 1)
    return (
      <g>
        {neck('joint')}
        {B(X - w, y - h, 2 * w, 2 * h, f('olive'), 6, 2)}
        {B(X - w, y + 2, 2 * w, h - 2, f(i ? 'olive' : 'rust'), 5, 1.8)}
        {weld(D`M${X - w + 3} ${y + 2.5}H${X + w - 3}`)}
        {B(X - w + 3, y - 9, 2 * w - 6, 10, f('dk'), 4, 1.5)}
        <g className="rf-eye">
          <circle cx={X - 6} cy={y - 4} r={3.3} fill="#ffb347" />
          <circle cx={X + 6} cy={y - 4} r={3.3} fill="#ffb347" />
        </g>
        {riv(X - w + 3.5, y + 6, X + w - 3.5, y + 6, X - w + 3.5, y + h - 4, X + w - 3.5, y + h - 4)}
        {i >= 1 && <g>{L(D`M${X + w - 4} ${y - h + 2}V${y - h - 14}`, '#34342f', 2.2)}{lamp(c, X + w - 4, y - h - 15, 2, 'a')}{B(X - 8, y - h - 3, 16, 6, f('gun'), 2, 1.4)}</g>}
        {roleHead(c)}
      </g>
    );
  if (s === 2)
    return (
      <g>
        {neck('gun')}
        {B(X - w + 2, y - 2, 2 * w - 4, h + 3, f('gun'), 5, 1.8)}
        {L(D`M${X - 5} ${y + h - 4}h10M${X - 5} ${y + h - 1}h10`, OL, 1.1)}
        {P(D`M${X - w - 3} ${y + 1}V${y - h + 6}Q${X - w - 3} ${y - h - 4} ${X - w + 8} ${y - h - 4}H${X + w - 8}Q${X + w + 3} ${y - h - 4} ${X + w + 3} ${y - h + 6}V${y + 1}Z`, f('olive'), 2)}
        {shine(X - w + 5, y - h - 1.5, 2 * w - 10)}
        {B(X - w - 4, y - 2, 2 * w + 8, 6, f('sand'), 2, 1.6)}
        {B(X - w + 3, y + 5, 2 * w - 6, 6, '#1c211f', 3, 1.3)}
        <rect className="rf-eye" x={X - w + 6} y={y + 7} width={2 * w - 12} height={2.4} rx={1.2} fill="#ffc060" />
        {i >= 1 && <g>{L(D`M${X + w + 3} ${y - h + 4}V${y - h - 14}`, '#2f3336', 2)}{lamp(c, X + w + 3, y - h - 15, 2, 'a')}{[-1, 1].map((d) => <g key={d}>{B(X + d * (w + 2) - 4.5, y - 6, 9, 16, f('gun'), 2.5, 1.5)}</g>)}</g>}
        {i >= 2 && <g>{CB(X - 11, y - h - 9, 22, 10, f('sand'), 3, 1.6)}{P(D`M${X - 6} ${y - h - 2}l6 -3.5l6 3.5v3l-6 -3.5l-6 3.5Z`, f('amber'), 1)}</g>}
        {roleHead(c)}
      </g>
    );
  if (s === 3)
    return (
      <g>
                {neck('gun')}
        {P(D`M${X - w - 2} ${y}L${X - w} ${y - h + 2}L${X - w + 7} ${y - h - 4}H${X + w - 7}L${X + w} ${y - h + 2}L${X + w + 2} ${y}L${X + w - 1} ${y + h - 2}L${X + w - 8} ${y + h + 2}H${X - w + 8}L${X - w + 1} ${y + h - 2}Z`, f('sand'), 2)}
        {shine(X - w + 7, y - h - 1.5, 2 * w - 14)}
        {CB(X - 5, y - h - 7, 10, h, f('olive'), 2, 1.5)}
        {CB(X - w - 4, y - 3, 9, h + 1, f('olive'), 3, 1.6)}
        {CB(X + w - 5, y - 3, 9, h + 1, f('olive'), 3, 1.6)}
        {CB(X - w + 4, y - 3, 2 * w - 8, 9, '#132126', 3, 1.4)}
        {strip(X - w + 6, y, 2 * w - 12, 3)}
        {B(X - 6, y + h - 6, 12, 5, f('gun'), 2, 1.2)}
        {i >= 1 && <g>{CB(X + w - 2, y - h - 4, 10, 16, f('gun'), 2.5, 1.5)}{CB(X + w + 5, y - h - 9, 5, 12, f('olive'), 1.5, 1.2)}{lamp(c, X + w + 3, y - h + 5, 1.8)}</g>}
        {i >= 2 && <g>{CB(X - w + 1, y - 10, 2 * w - 2, 7, f('olive'), 2, 1.5)}{CB(X - 9, y + h - 3, 18, 7, f('olive'), 2, 1.4)}{strip(X - 5, y + h - 0.5, 10, 2.4)}</g>}
        {roleHead(c)}
      </g>
    );
  return (
    <g>
      {[-1, 1].map((d) => <g key={d}>{P(D`M${X + d * (w - 2)} ${y + 6}L${X + d * (w + 10)} ${y - 4}Q${X + d * (w + 12)} ${y - 9} ${X + d * (w + 7)} ${y - 9}L${X + d * (w - 4)} ${y - 5}Z`, f('gun4'), 1.6)}</g>)}
      {neck('gun4')}
      {P(D`M${X - w - 2} ${y + 2}C${X - w - 3} ${y - h - 3} ${X - 8} ${y - h - 6} ${X} ${y - h - 6}C${X + 8} ${y - h - 6} ${X + w + 3} ${y - h - 3} ${X + w + 2} ${y + 2}L${X + w - 1} ${y + h - 3}L${X + 6} ${y + h + 3}H${X - 6}L${X - w + 1} ${y + h - 3}Z`, f('olive4'), 2)}
      {P(D`M${X - 9} ${y + 5}H${X + 9}L${X + 6} ${y + h + 2}H${X - 6}Z`, f('sand4'), 1.5)}
      {P(D`M${X - w + 1} ${y - 5}L${X} ${y + 1}L${X + w - 1} ${y - 5}L${X + w - 2} ${y + 2}L${X} ${y + 8}L${X - w + 2} ${y + 2}Z`, '#10262c', 1.6)}
      {glow(D`M${X - w + 3} ${y - 1.5}L${X} ${y + 3.5}L${X + w - 3} ${y - 1.5}`, 1.6)}
      {i >= 1 && <g>{P(D`M${X - 5} ${y - h - 12}H${X + 5}L${X + 7} ${y - h + 2}L${X} ${y - 8}L${X - 7} ${y - h + 2}Z`, f('sand4'), 1.6)}{glow(D`M${X} ${y - h - 8}V${y - h}`, 0.9)}{[-1, 1].map((d) => <g key={d}>{CB(X + d * (w - 1) - 4, y + 2, 8, 12, f('sand4'), 2.5, 1.5)}</g>)}</g>}
      {i >= 2 && glow(D`M${X - w + 1} ${y + 5}L${X - 8} ${y + h}M${X + w - 1} ${y + 5}L${X + 8} ${y + h}`, 0.7)}
      {spec(X - w * 0.45, y - h * 0.55, w * 0.35, 3)}
      {roleHead(c)}
    </g>
  );
}

// ---------- torso ----------
function torso(c: C) {
  const {r, s, i, f} = c;
  const T = r.tt, S = r.sw, Bt = r.cb, W = r.ww, PB = r.pb, H = Bt - T;
  const pr = r.aw * 0.8 + 4;
  const sides = (fn: (d: number, sx: number, sy: number) => unknown) => [-1, 1].map((d) => <g key={d}>{fn(d, X + d * (S + r.aw * 0.5 - 2), T + 7)}</g>);
  if (s === 0)
    return (
      <g>
        {B(X - 7, Bt - 6, 14, PB - Bt, f('joint'), 3)}
        {L(D`M${X - 7} ${Bt + 3}h14M${X - 7} ${Bt + 8}h14M${X - 7} ${Bt + 13}h14`, OL, 1, 0.7)}
        {L(D`M${X - W + 4} ${Bt - 2}q-7 14 1 25`, '#b8412f', 1.8)}
        {L(D`M${X + W - 4} ${Bt - 2}q7 10 0 21`, '#e0b43a', 1.6)}
        <g transform={rot(3, X, PB)}>{B(X - W, Bt + 8, 2 * W, PB - Bt - 8, f('scrap'), 4)}</g>
        {sides((d, sx, sy) => Ci(sx - d * 3, sy + 2, r.aw * 0.55, f('joint')))}
        <g transform={rot(-3, X, T)}>
          {B(X - S, T, 2 * S, H, f('rust'), 6, 2)}
          {B(X + 1, T + 4, S - 4, H * 0.5, f('scrap'), 3, 1.5)}
          {riv(X + 4, T + 7, X + S - 6, T + 7, X + 4, T + H * 0.5, X + S - 6, T + H * 0.5)}
          {B(X - S + 5, T + H * 0.52, 13, 12, f('scrap'), 1.5, 1.4)}
          {riv(X - S + 7.5, T + H * 0.52 + 2.5, X - S + 15.5, T + H * 0.52 + 2.5, X - S + 7.5, T + H * 0.52 + 9.5, X - S + 15.5, T + H * 0.52 + 9.5)}
          {L(D`M${X - S + 6} ${T + 9}q5 4 10 0M${X + 6} ${T + H - 8}q4 -3 8 1`, '#3a1e10', 1.2, 0.75)}
        </g>
      </g>
    );
  if (s === 1)
    return (
      <g>
        {B(X - W + 3, Bt - 6, 2 * (W - 3), 16, f('scrap'), 3)}
        {L(D`M${X - W + 5} ${Bt + 1}H${X + W - 5}M${X - W + 5} ${Bt + 5}H${X + W - 5}`, OL, 1, 0.7)}
        {B(X - W, Bt + 6, 2 * W, PB - Bt - 6, f(i ? 'olive' : 'rust'), 4)}
        {B(X - S, T, 2 * S, H, f('rust'), 6, 2)}
        {B(X - S, T, S * 1.3, H, f('olive'), 6, 2)}
        {weld(D`M${X + S * 0.3 + 2} ${T + 3}V${T + H - 3}`)}
        {i >= 1 && <g>{B(X + S * 0.36, T + 6, S * 0.52, H * 0.5, f('olive'), 3, 1.5)}{riv(X + S * 0.36 + 3, T + 9, X + S * 0.88 - 3, T + 9)}{B(X - W - 2, Bt - 1, 2 * W + 4, 7, f('dk'), 2, 1.5)}{B(X - 5, Bt - 2.5, 10, 10, f('amber'), 2, 1.3)}</g>}
        {sides((_d, sx, sy) => P(D`M${sx - pr} ${sy + 5}Q${sx - pr} ${sy - pr} ${sx} ${sy - pr}Q${sx + pr} ${sy - pr} ${sx + pr} ${sy + 5}Z`, f('olive'), 1.8))}
      </g>
    );
  if (s === 2)
    return (
      <g>
        {B(X - W + 2, Bt - 6, 2 * W - 4, 17, f('gun'), 4)}
        {CB(X - W - 1, Bt + 7, 2 * W + 2, PB - Bt - 7, f('olive'), 5)}
        {B(X - W - 2, Bt + 5, 2 * W + 4, 6, f('dk'), 2, 1.4)}
        {B(X - 5, Bt + 3.5, 10, 9, f('sand'), 2, 1.3)}
        {i >= 2 && <g>{B(X - W, Bt + 10, 9, 10, f('olive'), 2, 1.4)}{B(X + W - 9, Bt + 10, 9, 10, f('olive'), 2, 1.4)}</g>}
        {CB(X - S, T, 2 * S, H, f('olive'), 7, 2)}
        {B(X - 11, T - 4, 22, 8, f('gun'), 3, 1.5)}
        {i >= 2 && CB(X - S * 0.7, T - 6, S * 1.4, 11, f('sand'), 4, 1.6)}
        {CB(X - S + 5, T + 8, S - 7, H * 0.46, f('sand'), 3, 1.6)}
        {CB(X + 2, T + 8, S - 7, H * 0.46, f('sand'), 3, 1.6)}
        {P(D`M${X - S * 0.62} ${T + 14}l${S * 0.2} -4l${S * 0.2} 4v3.5l${-S * 0.2} -4l${-S * 0.2} 4Z`, f('amber'), 1.1)}
        {sides((_d, sx, sy) => <g>{CB(sx - pr, sy - pr * 0.8, 2 * pr, pr * 1.5, f('olive'), 5)}{i >= 1 && B(sx - pr + 1, sy + pr * 0.2, 2 * pr - 2, 8, f('sand'), 2, 1.4)}</g>)}
      </g>
    );
  if (s === 3)
    return (
      <g>
        {CB(X - W + 1, Bt - 6, 2 * W - 2, 10, f('gun'), 3)}
        {CB(X - W + 3, Bt + 2, 2 * W - 6, 9, f('gun'), 3)}
        {CB(X - W - 2, Bt + 8, 2 * W + 4, PB - Bt - 8, f('olive'), 5)}
        {CB(X - 7, Bt + 8, 14, PB - Bt - 6, f('gun'), 3, 1.5)}
        {CB(X - S - 2, T - 1, 2 * S + 4, H + 3, f('gun'), 8, 2)}
        {CB(X - S, T + 2, S - 1, H * 0.62, f('sand'), 5)}
        {CB(X + 1, T + 2, S - 1, H * 0.62, f('sand'), 5)}
        {CB(X - S + 4, T + H * 0.64, 2 * S - 8, H * 0.34, f('olive'), 4)}
        {strip(X - 1.5, T + 8, 3, H * 0.44)}
        {CB(X - 12, T - 7, 24, 11, f('gun'), 3, 1.6)}
        {i >= 1 && <g>{CB(X - S * 0.7, T + H * 0.68, S * 1.4, H * 0.24, f('dk'), 3, 1.5)}{L(D`M${X - S * 0.55} ${T + H * 0.75}H${X + S * 0.55}M${X - S * 0.55} ${T + H * 0.84}H${X + S * 0.55}`, '#0e100d', 2)}{strip(X - S + 5, T + H * 0.72, 4, H * 0.18)}{strip(X + S - 9, T + H * 0.72, 4, H * 0.18)}</g>}
        {sides((d, sx, sy) => (
          <g>
            {CB(sx - pr - 1, sy - pr * 0.7, 2 * pr + 2, pr * 1.6, f('gun'), 5)}
            {CB(sx - pr + 1, sy - pr * 0.95, 2 * pr - 2, pr * 1.15, f('sand'), 5)}
            {i >= 2 && <g>{CB(sx - pr * 0.6, sy - pr * 1.2, pr * 1.2, pr * 0.6, f('olive'), 3, 1.5)}{strip(sx - pr * 0.6 + d * 0, sy + pr * 0.45, pr * 1.2, 2.6)}</g>}
          </g>
        ))}
      </g>
    );
  return (
    <g>
      {sides((d) => <g>{B(X + d * (S - 8) - 5, T - 16, 10, 18, f('gun4'), 3)}{lamp(c, X + d * (S - 8), T - 17, 2.6)}</g>)}
      {CB(X - W + 1, Bt - 6, 2 * W - 2, 18, f('gun4'), 5)}
      {P(D`M${X - W - 3} ${Bt + 7}H${X + W + 3}L${X + W} ${PB - 3}L${X + 6} ${PB + 2}H${X - 6}L${X - W} ${PB - 3}Z`, f('gun4'), 1.9)}
      {P(D`M${X - S} ${T + 2}C${X - S * 0.5} ${T - 5} ${X + S * 0.5} ${T - 5} ${X + S} ${T + 2}L${X + S - 2} ${T + H * 0.62}C${X + S * 0.7} ${Bt + 4} ${X - S * 0.7} ${Bt + 4} ${X - S + 2} ${T + H * 0.62}Z`, f('olive4'), 2.2)}
      {P(D`M${X - S * 0.62} ${T + 8}L${X} ${T + H * 0.72}L${X + S * 0.62} ${T + 8}L${X + S * 0.5} ${Bt - 3}H${X - S * 0.5}Z`, f('sand4'), 1.7)}
      {glow(D`M${X - S + 5} ${T + 5}L${X} ${T + H * 0.7}L${X + S - 5} ${T + 5}`, 1.4)}
      {P(D`M${X - 14} ${T - 7}L${X + 14} ${T - 7}L${X + 10} ${T + 5}H${X - 10}Z`, f('gun4'), 1.6)}
      {spec(X - S * 0.55, T + 6, S * 0.28, 3)}
      {sides((d, sx, sy) => (
        <g>
          {i >= 1 && B(sx - pr * 0.7, sy - pr - 7, pr * 1.4, 10, f('gun4'), 4)}
          {P(D`M${sx - pr - 1} ${sy + pr * 0.6}C${sx - pr - 2} ${sy - pr * 1.3} ${sx + pr + 2} ${sy - pr * 1.3} ${sx + pr + 1} ${sy + pr * 0.6}Q${sx} ${sy + pr * 0.2} ${sx - pr - 1} ${sy + pr * 0.6}Z`, f('sand4'), 2)}
          {glow(D`M${sx - pr + 2} ${sy + pr * 0.45}Q${sx} ${sy + pr * 0.1} ${sx + pr - 2} ${sy + pr * 0.45}`, 1.1)}
          {spec(sx - pr * 0.35, sy - pr * 0.55, pr * 0.35, 2.4)}
          {i >= 2 && strip(sx - 5, sy - 3, 10, 2.6)}
        </g>
      ))}
    </g>
  );
}

// ---------- arms ----------
const ARM_DEG = 7;
/** Near (d=1) hand centre after the arm's outward swing. */
function handAt(r: D, d = 1) {
  const sx = X + d * (r.sw + r.aw * 0.5), sy = r.tt + 8, dy = r.pb - 2 + r.aw * 0.65 - sy;
  const a = (ARM_DEG * Math.PI) / 180;
  return {x: sx + d * dy * Math.sin(a) + d * 4, y: sy + dy * Math.cos(a)};
}
function arm(c: C, d: number) {
  const {r, s, i, f} = c;
  const aw = r.aw, fw = aw * 1.3, hs = aw * 1.4;
  const sx = X + d * (r.sw + aw * 0.5), sy = r.tt + 8, ey = (sy + r.pb) / 2, wy = r.pb - 2, wx = sx + d * 4;
  const ua = ey - sy;
  let body;
  if (s === 0)
    body = (
      <g>
        {B(sx - aw * 0.3, sy, aw * 0.6, ua, f('joint'), 2)}
        {L(D`M${sx + d * aw * 0.55} ${sy + 5}V${ey - 5}`, '#cfcabb', 2)}
        {L(D`M${sx - aw * 0.3} ${ey}q-5 9 1 15`, '#b8412f', 1.6)}
        <g transform={rot(d * 4, wx, ey)}>{B(wx - fw / 2, ey + 3, fw, wy - ey - 3, f(d < 0 ? 'scrap' : 'rust'), 3)}{riv(wx - fw / 2 + 3, ey + 7, wx + fw / 2 - 3, ey + 7)}</g>
        {Ci(sx, ey + 1, aw * 0.42, f('joint'))}
        {[-1, 0, 1].map((k) => <g key={k}>{P(D`M${wx + k * fw * 0.32 - 2.2} ${wy - 1}h4.4l-0.8 ${hs * 0.9}l-2.6 2.4Z`, f('scrap'), 1.3)}</g>)}
      </g>
    );
  else if (s === 1)
    body = (
      <g>
        {B(sx - aw / 2, sy, aw, ua, f('olive'), 3)}
        {B(wx - fw / 2, ey + 2, fw, wy - ey - 2, f(i ? 'olive' : 'rust'), 4)}
        {weld(D`M${wx - fw / 2 + 2} ${ey + 8}h${fw - 4}`)}
        {Ci(sx + d, ey + 1, aw * 0.42, f('joint'))}
        {B(wx - hs / 2, wy - 2, hs, hs, f('scrap'), 4)}
        {L(D`M${wx - hs * 0.2} ${wy + hs * 0.45}v${hs * 0.45}M${wx + hs * 0.12} ${wy + hs * 0.45}v${hs * 0.45}`, OL, 1)}
        {i >= 1 && B(wx - fw / 2 - 1, wy - 12, fw + 2, 4.5, f('dk'), 1.5, 1.3)}
      </g>
    );
  else if (s === 2)
    body = (
      <g>
        {B(sx - aw / 2, sy, aw, ua, f('gun'), 3)}
        {CB(sx - aw / 2 - 1, sy + 5, aw + 2, ua * 0.6, f('olive'), 3)}
        {CB(wx - fw / 2, ey + 4, fw, wy - ey - 4, f('olive'), 4)}
        {i >= 1 && B(wx - fw / 2 - 1, ey + 9, fw + 2, 9, f('sand'), 2, 1.5)}
        {CB(sx + d * 2 - aw * 0.55, ey - 4, aw * 1.1, 10, f(i >= 2 ? 'sand' : 'gun'), 3)}
        {B(wx - fw / 2 - 1, wy - 6, fw + 2, 6, f('gun'), 2, 1.5)}
        {CB(wx - hs / 2, wy - 1, hs, hs, f('gun'), 4)}
        {L(D`M${wx - hs * 0.35} ${wy + hs * 0.5}h${hs * 0.7}`, OL, 1.1)}
        {i >= 2 && CB(sx - aw / 2 - 3, sy - 2, aw + 6, ua * 0.42, f('sand'), 3, 1.5)}
      </g>
    );
  else if (s === 3)
    body = (
      <g>
        {B(sx - aw / 2, sy, aw, ua, f('gun'), 3)}
        {CB(sx - aw / 2 - 2, sy + 2, aw + 4, ua * 0.55, f('sand'), 4)}
        {i >= 1 && CB(sx - aw / 2 - 2, sy + ua * 0.5, aw + 4, ua * 0.45, f('olive'), 3, 1.5)}
        {CB(wx - fw * 0.55, ey + 3, fw * 1.1, wy - ey - 3, f('sand'), 5)}
        {CB(wx + (d > 0 ? fw * 0.1 : -fw * 0.62), ey + 7, fw * 0.52, wy - ey - 12, f('olive'), 3, 1.5)}
        {P(D`M${sx - aw * 0.6} ${ey - 3}H${sx + aw * 0.6}L${sx + d * aw * 0.9} ${ey + 4}L${sx} ${ey + 8}Z`, f('gun'), 1.5)}
        {strip(wx - fw / 2 + 2, wy - 6, fw - 4, 2.8)}
                {CB(wx - hs / 2, wy - 1, hs, hs, f('gun'), 4)}
        {B(wx - hs / 2 + 1, wy - 1, hs - 2, hs * 0.4, f('olive'), 2, 1.3)}
        {i >= 2 && <g>{CB(wx - hs / 2 - 2, wy + hs * 0.45, hs + 4, hs * 0.5, f('sand'), 3, 1.5)}{strip(wx - hs * 0.35, wy + hs * 0.62, hs * 0.7, 2.6)}</g>}
      </g>
    );
  else
    body = (
      <g>
        {B(sx - aw / 2, sy, aw, ua, f('gun4'), 4)}
        {P(D`M${sx - aw * 0.65} ${sy + 2}Q${sx} ${sy - 3} ${sx + aw * 0.65} ${sy + 2}L${sx + aw * 0.5} ${sy + ua * 0.75}H${sx - aw * 0.5}Z`, f('olive4'), 1.8)}
        {P(D`M${wx - fw * 0.45} ${ey + 3}H${wx + fw * 0.45}L${wx + fw * 0.62} ${wy - 3}Q${wx} ${wy + 1} ${wx - fw * 0.62} ${wy - 3}Z`, f('sand4'), 1.9)}
        {P(D`M${wx + d * fw * 0.5} ${ey + 6}Q${wx + d * (fw * 0.5 + 7)} ${ey + 10} ${wx + d * (fw * 0.5 + 4)} ${wy - 10}L${wx + d * fw * 0.58} ${wy - 6}Z`, f('olive4'), 1.5)}
        {i >= 1 && strip(wx - fw * 0.4, wy - 7, fw * 0.8, 2.8)}
        {glow(D`M${wx - d * fw * 0.15} ${ey + 7}V${wy - 7}`, 1.1)}
        {Ci(sx + d, ey + 1, aw * 0.45, f('gun4'))}
        {i >= 1 && <g>{CB(sx + d - aw * 0.62, ey - 7, aw * 1.24, 14, f('sand4'), 4, 1.6)}{lamp(c, sx + d, ey, 2)}</g>}
        {B(wx - hs / 2, wy - 2, hs, hs, f('gun4'), 5)}
        {B(wx - hs / 2 + 1, wy - 2, hs - 2, hs * 0.42, f('olive4'), 3, 1.3)}
        {spec(wx - fw * 0.2, ey + 9, 2, 5, 0)}
      </g>
    );
  return <g transform={rot(-d * ARM_DEG, sx, sy)}>{body}</g>;
}

// ---------- legs ----------
function leg(c: C, d: number) {
  const {r, s, i, f} = c;
  const lw = r.lw, sw = lw * 1.12, bw = lw * 1.6, hx = X + d * r.hx, PT = r.pb - 10, K = r.kn, A = 228, Z = 250;
  let body;
  const boot = (m: string, extra = 0) => CB(hx - bw / 2 + d * 3, A - 2 - extra, bw, Z - A + 2 + extra, f(m), 4);
  if (s === 0)
    body = (
      <g>
        {B(hx - lw * 0.28, PT, lw * 0.56, K - PT, f('joint'), 2)}
        <g transform={rot(d * 5, hx, PT)}>{B(hx - lw * 0.5, PT + 9, lw, (K - PT) * 0.45, f(d < 0 ? 'rust' : 'scrap'), 2)}{B(hx - lw * 0.55, PT + 14, lw * 1.1, 4, '#d8c79a', 0.5, 0.9)}</g>
        {L(D`M${hx + d * lw * 0.3} ${K}q${d * 6} 7 ${d * 2} 14`, '#b8412f', 1.5)}
        <g transform={rot(-d * 3, hx, K)}>{B(hx - sw / 2, K + 4, sw, A - K - 3, f(d < 0 ? 'scrap' : 'rust'), 3)}{riv(hx - sw / 2 + 3, K + 8, hx + sw / 2 - 3, K + 8)}{L(D`M${hx - 3} ${A - 10}q3 -3 6 0`, '#3a1e10', 1.1, 0.7)}</g>
        {Ci(hx, K, lw * 0.42, f('joint'))}
        {P(D`M${hx - bw * 0.42} ${A}H${hx + bw * 0.42}L${hx + bw * 0.5 + d * 4} ${Z}H${hx - bw * 0.5 + d * 4}Z`, f('scrap'))}
      </g>
    );
  else if (s === 1)
    body = (
      <g>
        {B(hx - lw / 2, PT, lw, K - PT, f('olive'), 3)}
        {B(hx - sw / 2, K + 3, sw, A - K - 1, f(i ? 'olive' : 'rust'), 4)}
        {weld(D`M${hx - sw / 2 + 2} ${K + 10}h${sw - 4}`)}
        {Ci(hx, K + 1, lw * 0.4, f('joint'))}
        {boot('scrap')}
        {i >= 1 && <g>{B(hx - sw / 2 - 1, A - 14, sw + 2, 4.5, f('dk'), 1.5, 1.3)}{B(hx - bw * 0.3 + d * 3, A - 4, bw * 0.6, 7, f('gun'), 2, 1.3)}</g>}
      </g>
    );
  else if (s === 2)
    body = (
      <g>
        {CB(hx - lw / 2, PT, lw, K - PT, f('olive'), 3)}
        {i >= 2 && <g>{B(hx + (d > 0 ? lw * 0.15 : -lw * 0.15 - 13), PT + 10, 13, 17, f('sand'), 2.5, 1.5)}{L(D`M${hx + (d > 0 ? lw * 0.15 : -lw * 0.15 - 13)} ${PT + 16}h13`, OL, 1.2)}</g>}
        {CB(hx - sw / 2, K + 3, sw, A - K - 1, f('olive'), 4)}
        {CB(hx - sw * 0.3, K + 11, sw * 0.6, A - K - 16, f('gun'), 2, 1.5)}
        {i >= 1 && <g>{B(hx - sw * 0.56, A - 13, sw * 1.12, 8, f('sand'), 2, 1.5)}{P(D`M${hx - sw * 0.22} ${K + 17}l${sw * 0.22} -4l${sw * 0.22} 4v3.5l${-sw * 0.22} -4l${-sw * 0.22} 4Z`, f('amber'), 1)}</g>}
        {CB(hx - lw * 0.58, K - 6, lw * 1.16, 12, f('sand'), 3)}
        {boot('gun')}
        {B(hx - bw * 0.32 + d * 5, A + 7, bw * 0.5, Z - A - 7, f('sand'), 2, 1.4)}
      </g>
    );
  else if (s === 3)
    body = (
      <g>
        {CB(hx - lw / 2 - 1, PT, lw + 2, K - PT, f('sand'), 4)}
        {CB(hx + (d > 0 ? lw * 0.05 : -lw * 0.6), PT + 6, lw * 0.55, K - PT - 12, f('olive'), 2, 1.5)}
        {i >= 2 && CB(hx - lw * 0.6, PT - 4, lw * 1.2, 14, f('gun'), 3)}
        {CB(hx - sw * 0.58, K + 2, sw * 1.16, A - K, f('sand'), 5)}
        {CB(hx - sw * 0.34, K + 9, sw * 0.68, A - K - 14, f('olive'), 3, 1.5)}
        {L(D`M${hx - sw * 0.2} ${K + 17}h${sw * 0.4}M${hx - sw * 0.2} ${K + 21}h${sw * 0.4}`, OL, 1.4)}
        {P(D`M${hx - lw * 0.6} ${K - 6}H${hx + lw * 0.6}L${hx + lw * 0.4} ${K + 6}L${hx} ${K + 10}L${hx - lw * 0.4} ${K + 6}Z`, f('gun'), 1.6)}
        {lamp(c, hx, K + 1, 1.6)}
        {P(D`M${hx - d * bw * 0.5 + d * 3} ${Z - 8}l${-d * 6} 8h${d * 8}Z`, f('dk'), 1.3)}
        {boot('gun', 4)}
        {CB(hx - bw * 0.3 + d * 5, A + 4, bw * 0.55, Z - A - 4, f('olive'), 3, 1.4)}
        {i >= 1 && <g>{CB(hx - sw * 0.62, A - 14, sw * 1.24, 10, f('gun'), 3, 1.5)}{strip(hx - sw * 0.4, A - 10.5, sw * 0.8, 2.8)}</g>}
      </g>
    );
  else
    body = (
      <g>
        {P(D`M${hx - lw * 0.6} ${PT}H${hx + lw * 0.6}L${hx + lw * 0.45} ${K - 2}H${hx - lw * 0.45}Z`, f('sand4'), 1.9)}
        {B(hx + d * (sw * 0.55) - 5, K + 8, 10, 18, f('gun4'), 3)}
        {lamp(c, hx + d * sw * 0.55, K + 27, 2.2)}
        {i >= 1 && <g>{CB(hx - lw * 0.62, PT + (K - PT) * 0.35, lw * 1.24, 14, f('gun4'), 3, 1.5)}{strip(hx - lw * 0.35, PT + (K - PT) * 0.35 + 5.5, lw * 0.7, 2.8)}</g>}
        {P(D`M${hx - sw * 0.5} ${K + 2}H${hx + sw * 0.5}Q${hx + sw * 0.72} ${K + 14} ${hx + sw * 0.42} ${A}H${hx - sw * 0.42}Q${hx - sw * 0.72} ${K + 14} ${hx - sw * 0.5} ${K + 2}Z`, f('olive4'), 1.9)}
        {P(D`M${hx - sw * 0.2} ${K + 8}H${hx + sw * 0.2}L${hx + sw * 0.14} ${A - 4}H${hx - sw * 0.14}Z`, f('sand4'), 1.3)}
        {glow(D`M${hx} ${K + 10}V${A - 6}`, 1)}
        {CB(hx - lw * 0.55, K - 7, lw * 1.1, 12, f('gun4'), 4)}
        {glow(D`M${hx - lw * 0.3} ${K - 1}H${hx + lw * 0.3}`, 0.9)}
        {P(D`M${hx - bw * 0.42 + d * 2} ${A - 4}H${hx + bw * 0.42 + d * 2}Q${hx + bw * 0.62 + d * 3} ${Z - 10} ${hx + bw * 0.55 + d * 4} ${Z}H${hx - bw * 0.5 + d * 3}Z`, f('gun4'), 1.9)}
        {glow(D`M${hx - bw * 0.42 + d * 3} ${Z - 2.5}H${hx + bw * 0.45 + d * 3}`, 0.9)}
        {spec(hx - lw * 0.25, PT + 8, 2, 6, 0)}
      </g>
    );
  return <g transform={rot(-d * 3, hx, PT)}>{body}</g>;
}

// ---------- gear ----------
function drone(c: C, x: number, y: number, st: Stage, k: number) {
  const {f} = c;
  if (st === 0)
    return <g key={k}>{B(x - 8, y - 5, 16, 10, f('rust'), 2, 1.5)}{L(D`M${x - 8} ${y - 5}l-6 -5M${x + 8} ${y - 5}l7 -3`, '#34342f', 1.8)}{lamp(c, x, y, 1.6, 'a')}</g>;
  const m = st === 1 ? 'olive' : st === 2 ? 'gun' : st === 3 ? 'sand' : 'sand4';
  return (
    <g key={k}>
      {st === 4 && <ellipse className="rf-eye" cx={x} cy={y + 9} rx={11} ry={3} fill="none" stroke="#5fe3ff" strokeWidth={2} opacity={0.45} />}
      {L(D`M${x - 13} ${y - 6}H${x + 13}`, OL, 2)}
      <ellipse cx={x - 13} cy={y - 7} rx={6} ry={1.6} fill="#c9d0d4" opacity={0.6} />
      <ellipse cx={x + 13} cy={y - 7} rx={6} ry={1.6} fill="#c9d0d4" opacity={0.6} />
      {B(x - 9, y - 6, 18, 12, f(m), 5, 1.6)}
      {lamp(c, x, y + 1, 1.8, st >= 3 ? 'c' : 'a')}
    </g>
  );
}

function gear(c: C) {
  const {r, s, i, t, f, role} = c;
  const T = r.tt, S = r.sw;
  const hand = handAt(r);
  const J = s === 0 ? 'rust' : s === 1 ? 'olive' : s === 2 ? 'gun' : s === 3 ? 'olive' : 'sand4';
  if (role === 'scout') {
    const mx = X - S - 3, base = T + 14, top = Math.max(11, base - 62 - Math.min(t, 10) * 4.2);
    const segs = s === 2 ? 2 + i : s === 3 ? 3 + i : 4 + i;
    const back = (
      <g>
        {s === 0 ? tube(D`M${mx} ${base}L${mx} ${top + 16}L${mx + 7} ${top + 6}`, MID.joint, 3) : s === 1 ? tube(D`M${mx} ${base}V${top + 6}`, MID.gun, 3.2) : null}
        {s >= 2 && Array.from({length: segs}, (_, k) => {
          const y0 = base - ((base - top - 8) * k) / segs, y1 = base - ((base - top - 8) * (k + 1)) / segs, w = 7 - k * (3 / segs);
          return <g key={k}>{B(mx - w / 2, y1, w, y0 - y1 + 2, f(s === 4 ? 'gun4' : 'gun'), 1.5, 1.4)}{s >= 3 && k < (s === 3 ? 1 + i : 2 + i) && strip(mx - 1.5, y1 + 3, 3, 4)}</g>;
        })}
        {s === 0 && <g transform={rot(18, mx + 8, top + 3)}>{B(mx + 2, top - 3, 13, 11, f('scrap'), 2, 1.5)}{B(mx + 1, top + 1, 15, 3.5, '#d8c79a', 0.5, 0.8)}{lamp(c, mx + 12, top + 5, 1.5, 'a')}</g>}
        {s === 1 && <g>{P(D`M${mx - 10} ${top + 2}Q${mx} ${top + 14} ${mx + 10} ${top + 2}Z`, f('olive'), 1.6)}{i >= 1 && <g>{P(D`M${mx - 7} ${top + 24}Q${mx} ${top + 33} ${mx + 7} ${top + 24}Z`, f('olive'), 1.4)}{lamp(c, mx, top - 1, 2, 'a')}</g>}</g>}
        {s === 2 && <g>{CB(mx - 8, top - 4, 16, 12, f('sand'), 3)}{lamp(c, mx, top - 6, 2.2, 'a')}{i >= 2 && B(mx - 12, top + 16, 24, 4, f('olive'), 1.5, 1.3)}</g>}
        {s === 3 && <g>{B(mx - 17, top + 6, 34, 4, f('gun'), 1.5, 1.3)}{[-1, 1].map((k) => <g key={k}>{CB(mx + k * 14 - 5, top - 2, 10, 13, f('olive'), 3, 1.5)}{lamp(c, mx + k * 14, top + 3, 1.6)}</g>)}{CB(mx - 5, top - 6, 10, 10, f('sand'), 2, 1.5)}</g>}
        {s === 4 && <g>{B(mx - 17, top + 2, 34, 7, f('sand4'), 3.5, 1.6)}{lamp(c, mx - 17, top + 5.5, 2.2)}{lamp(c, mx + 17, top + 5.5, 2.2)}{CB(mx - 6, top - 7, 12, 11, f('olive4'), 3, 1.5)}{lamp(c, mx, top - 2, 2.2)}<ellipse className="rf-eye" cx={mx} cy={top + 22} rx={11} ry={3} fill="none" stroke="#5fe3ff" strokeWidth={1.8} opacity={0.45} />{i >= 1 && <ellipse className="rf-eye" cx={mx} cy={top + 36} rx={8} ry={2.4} fill="none" stroke="#5fe3ff" strokeWidth={1.6} opacity={0.45} />}</g>}
        {CB(X - S - 7, T - 5, 2 * S + 14, 28, f(s === 0 ? 'scrap' : J), 4)}
      </g>
    );
    const gun =
      s === 0 ? (
        <g>
          {B(-6, -4, 40, 8, f('joint'), 2)}
          {P('M-28 -5L-6 -4V5L-24 9Z', f('rust'))}
          {B(4, -5.5, 4, 11, '#d8c79a', 0.5, 0.9)}{B(20, -5.5, 4, 11, '#d8c79a', 0.5, 0.9)}
          {B(-4, 3, 7, 12, f('rust'), 2, 1.4)}
        </g>
      ) : s === 1 ? (
        <g>
          {P('M-28 -5L-8 -5V6L-25 9Z', f('rust'))}
          {B(12, -3.5, 26, 7, f('gun'), 2)}
          {i >= 1 && B(2, 4, 8, 14, f('olive'), 2, 1.5)}
          {B(-10, -7, 24, 13, f('scrap'), 3)}
        </g>
      ) : s === 2 ? (
        <g>
          {P('M-30 -6L-9 -6V6L-27 10Z', f('gun'))}
          {B(14, -3.5, 28, 7, f('gun'), 2)}{B(40, -5, 7, 10, f('dk'), 2, 1.4)}
          {B(1, 4, 8, 15, f('sand'), 2, 1.5)}
          {CB(-10, -8, 26, 15, f('olive'), 4)}
          {i >= 1 && <g>{B(-6, -15, 18, 7, f('dk'), 2, 1.4)}{lamp(c, 12, -11.5, 1.6, 'a')}</g>}
          {i >= 2 && <g>{B(22, 3, 6, 10, f('olive'), 2, 1.4)}{B(-8, -2, 22, 3.5, f('sand'), 1, 1)}</g>}
        </g>
      ) : s === 3 ? (
        <g>
          {P('M-30 -7L-9 -6V6L-26 11Z', f('olive'))}
          {B(18, -3.5, 26, 7, f('gun'), 2)}
          {i >= 1 ? Ci(5, 12, 8, f('olive')) : B(1, 4, 8, 15, f('olive'), 2, 1.5)}
          {P('M-12 -9H16L26 -4V6L16 9H-12Z', f('sand'))}
          {strip(-4, -3, 18, 3)}
          {i >= 2 && <g>{B(20, 5, 16, 7, f('gun'), 2, 1.4)}{lamp(c, 36, 8.5, 1.6)}</g>}
        </g>
      ) : (
        <g>
          {P('M-32 -7L-10 -6V7L-27 12Z', f('olive4'))}
          {B(20, -4, 28, 8, f('gun4'), 3)}
          {Array.from({length: 2 + i}, (_, k) => <g key={k}>{glow(`M${24 + k * 6} -6V6`, 1.2)}</g>)}
          {P('M-14 -10H18L28 -3V7L16 11H-14Z', f('sand4'))}
          {glow('M-8 1H18', 1.1)}
          {lamp(c, 50, 0, 3.2)}
          {spec(0, -5.5, 9, 1.8, 0)}
        </g>
      );
    return {back, front: <g transform={`translate(${Math.round(hand.x)} ${Math.round(hand.y)}) rotate(38)`}>{gun}</g>};
  }
  if (role === 'assault') {
    const back = <g>{CB(X - S * 0.75, T - 12, S * 1.5, 34, f(s === 0 ? 'scrap' : s === 2 ? 'gun' : s === 4 ? 'gun4' : 'olive'), 5)}{s === 3 && [-1, 1].map((k) => <g key={k}>{Ci(X + k * S * 0.55, T - 8, 8, f('sand'))}</g>)}</g>;
    const drums = s < 2 ? 0 : s === 2 ? Math.min(i, 2) : 1 + Math.min(i, 2);
    const can =
      s === 0 ? (
        <g>
          {L('M-10 16L6 -2M-2 18L14 0', '#34342f', 2.2)}
          {B(-16, -10, 20, 20, f('rust'), 2)}
          {B(-2, -6, 50, 12, f('joint'), 3)}
          {B(10, -8, 5, 16, '#d8c79a', 0.5, 0.9)}{B(30, -8, 5, 16, '#d8c79a', 0.5, 0.9)}
        </g>
      ) : s === 1 ? (
        <g>
          {i >= 1 && <g>{B(-26, 6, 24, 20, f('olive'), 2)}{B(-26, 12, 24, 5, f('sand'), 1, 1.2)}{L('M-4 10Q4 8 6 2', '#c9a13b', 2.5)}</g>}
          {B(0, -6, 52, 12, f('gun'), 3)}
          {CB(-16, -12, 22, 24, f('olive'), 4)}
          {riv(-12, -8, 2, -8, -12, 8, 2, 8)}
        </g>
      ) : s === 2 ? (
        <g>
          {B(12, -6.5, 42, 13, f('gun'), 3)}
          {CB(52, -10, 11, 20, f('dk'), 3)}
          {L('M26 -6.5v13M38 -6.5v13', OL, 1.4)}
          {CB(-18, -14, 34, 28, f('olive'), 6)}
          {CB(-10, -10, 20, 10, f('sand'), 2, 1.4)}
        </g>
      ) : s === 3 ? (
        <g>
          {B(16, -13, 42, 10, f('gun'), 3)}{B(16, 3, 42, 10, f('gun'), 3)}
          {CB(56, -15, 10, 14, f('dk'), 3, 1.5)}{CB(56, 1, 10, 14, f('dk'), 3, 1.5)}
          {P('M-20 -16H14L24 -6V8L14 18H-20L-24 8V-8Z', f('sand'))}
          {CB(-14, -6, 22, 14, f('olive'), 3, 1.5)}
          {lamp(c, 16, 0, 2.4)}
          {i >= 2 && strip(-16, -12, 26, 3)}
        </g>
      ) : (
        <g>
          {P('M-4 -20L30 -12L22 -8ZM-4 20L30 12L22 8Z', f('olive4'), 1.5)}
          {B(18, -7, 44, 14, f('gun4'), 4)}
          {Array.from({length: 3 + i}, (_, k) => <g key={k}>{glow(`M${28 + k * 8} -8V8`, 1.4)}</g>)}
          {lamp(c, 64, 0, 4.5)}
          {P('M-22 -16H12L28 -6V8L12 18H-22L-26 8V-8Z', f('sand4'), 2)}
          {glow('M-14 2H18', 1.3)}
          {spec(-6, -9, 10, 2.4, 0)}
        </g>
      );
    const front = (
      <g transform={`translate(${Math.round(X + S + 2)} ${T - 16}) rotate(-28)`}>
        {Array.from({length: drums}, (_, k) => <g key={k}>{Ci(-10 - k * 18, 22, 11, f(s === 4 ? 'sand4' : 'sand'))}{Ci(-10 - k * 18, 22, 4, f('dk'), 1.2)}</g>)}
        {can}
      </g>
    );
    return {back, front};
  }
  // support
  const nDrones = s < 2 ? 1 : s === 2 ? (i >= 1 ? 2 : 1) : s === 3 ? (i >= 1 ? 3 : 2) : i >= 1 ? 4 : 3;
  const spots = [[X - S - 16, T - 22], [X - S - 2, T - 58], [X - S - 32, T - 52], [X + S + 22, T - 66]];
  const back = (
    <g>
      {CB(X - S - 5, T - 18, 2 * S + 10, 48, f(s === 0 ? 'rust' : s === 1 ? 'olive' : s === 2 ? 'gun' : s === 3 ? 'olive' : 'gun4'), 6)}
      {s === 0 && <g>{L(D`M${X - S + 2} ${T - 18}V${T + 30}M${X + S - 2} ${T - 18}V${T + 30}`, '#3a2c1c', 3)}{B(X - 7, T - 25, 14, 8, f('scrap'), 2, 1.4)}</g>}
      {s === 1 && i >= 1 && <g>{L(D`M${X + S - 2} ${T - 18}V${T - 38}`, '#34342f', 2)}{lamp(c, X + S - 2, T - 39, 1.8, 'a')}{[-1, 1].map((k) => <g key={k}>{B(X + k * (S + 3) - 6, T - 10, 12, 22, f('sand'), 3)}</g>)}</g>}
      {s >= 2 && [-1, 1].map((k) => <g key={k}>{B(X + k * (S + 3) - 5, T - 12, 10, 26, f(s === 4 ? 'sand4' : 'sand'), 4)}</g>)}
      {s === 2 && i >= 2 && <g>{B(X - S - 8, T - 26, 2 * S + 16, 10, f('sand'), 3)}{L(D`M${X - S} ${T - 25}l6 8m6 -8l6 8m6 -8l6 8m6 -8l6 8`, OL, 2.2)}</g>}
      {s >= 3 && (s === 4 || i >= 2) && strip(X - S + 2, T - 14, 2 * S - 4, 3)}
      {Array.from({length: nDrones}, (_, k) => drone(c, spots[k][0], s === 0 ? T - 23 : spots[k][1], s, k))}
          </g>
  );
  const b0 = {x: X + S - 4, y: T - 14}, el = {x: X + S + 16, y: T - 40}, tip = {x: X + S + 30, y: T - 18};
  const path = D`M${b0.x} ${b0.y}L${el.x} ${el.y}L${tip.x} ${tip.y}`;
  const col = s === 0 ? MID.joint : s === 1 ? MID.olive : s === 2 ? MID.olive : s === 3 ? MID.sand : MID.sand;
  const front = (
    <g>
      {tube(path, col, s === 0 ? 4 : 6.5)}
      {s >= 1 && Ci(el.x, el.y, s === 0 ? 3 : 5, f(s === 4 ? 'gun4' : 'gun'), 1.5)}
      {s === 0 && <g>{P(D`M${tip.x - 5} ${tip.y}l-3 12l4 0l3 -7l3 7l4 0l-3 -12Z`, f('scrap'), 1.4)}{B(el.x - 3, el.y + 8, 6, 5, '#d8c79a', 0.5, 0.8)}</g>}
      {s === 1 && <g>{B(tip.x - 4, tip.y - 2, 8, 12, f('gun'), 2, 1.4)}{i >= 1 && lamp(c, tip.x, tip.y + 12, 2.4, 'a')}</g>}
      {s === 2 && <g>{L(D`M${b0.x + 4} ${b0.y}L${el.x + 4} ${el.y + 2}`, '#2d2d29', 1.4)}{CB(tip.x - 6, tip.y - 3, 12, 12, f('sand'), 3, 1.5)}{L(D`M${tip.x - 4} ${tip.y + 9}l-2 6M${tip.x + 4} ${tip.y + 9}l2 6`, OL, 2.2)}{lamp(c, tip.x, tip.y + 3, 1.8, 'a')}{i >= 2 && B(tip.x + 6, tip.y - 1, 9, 5, f('gun'), 1.5, 1.2)}</g>}
      {s === 3 && <g>{CB(tip.x - 7, tip.y - 4, 14, 13, f('olive'), 3, 1.5)}{lamp(c, tip.x, tip.y + 12, 2.4)}{i >= 2 && B(tip.x + 7, tip.y - 1, 10, 5, f('gun'), 1.5, 1.2)}</g>}
      {s === 4 && <g>{P(D`M${tip.x - 8} ${tip.y - 5}H${tip.x + 8}L${tip.x + 5} ${tip.y + 10}H${tip.x - 5}Z`, f('gun4'), 1.6)}{glow(D`M${tip.x} ${tip.y + 12}L${tip.x - 4} ${tip.y + 30}`, 1.2)}{lamp(c, tip.x, tip.y + 12, 3)}{i >= 1 && glow(path, 0.7)}</g>}
    </g>
  );
  return {back, front};
}

// ---------- assembly ----------
function ctx(role: RobotRole, tier: number, f: (m: string) => string): C {
  const t = Math.min(12, Math.max(0, Math.floor(tier || 0)));
  const s = figureStage(t);
  return {r: DIMS[role] ?? DIMS.scout, role, t, s, i: t - STAGE_START[s], f};
}
/** Gear behind the body is clipped out of the torso core, so a lone gear part overlays a figure drawn with hide="gear" exactly. */
function layers(role: RobotRole, parts: Partial<Record<PartSlot, number>>, u: string): [PartSlot, unknown][] {
  const f = urlOf(u);
  const c = (slot: PartSlot) => ctx(role, parts[slot] ?? 0, f);
  const g = gear(c('gear')), cl = c('legs'), ca = c('arms'), r = cl.r;
  return [
    ['gear', (
      <g clipPath={f('bk')}>
        <clipPath id={u + 'bk'}>
          <path clipRule="evenodd" d={D`M-60 -60H260V320H-60ZM${X - r.sw - r.aw} ${r.tt}H${X + r.sw + r.aw}V${r.pb + 20}H${X - r.sw - r.aw}Z`} />
        </clipPath>
        {g.back}
      </g>
    )],
    ['legs', <g>{leg(cl, -1)}{leg(cl, 1)}</g>],
    ['arms', <g>{arm(ca, -1)}{arm(ca, 1)}</g>],
    ['torso', torso(c('torso'))],
    ['head', head(c('head'))],
    ['gear', g.front],
  ];
}
const uid = (raw: string) => 'rf' + raw.replace(/[^a-zA-Z0-9_-]/g, '') + '-';
const urlOf = (u: string) => (m: string) => `url(#${u}${m})`;

export interface RobotFigureProps {
  role: RobotRole;
  parts: Record<PartSlot, number>;
  height?: number;
  status?: FigureStatus;
  highlight?: PartSlot | null;
  hide?: PartSlot | null;
  mirror?: boolean;
  idle?: boolean;
  className?: string;
  title?: string;
}

export function RobotFigureGroup(props: Omit<RobotFigureProps, 'height' | 'className' | 'title'>) {
  const {role, parts, status = 'ready', highlight = null, hide = null, mirror = false, idle = false} = props;
  const u = uid(useId());
  const f = urlOf(u);
  const r = DIMS[role] ?? DIMS.scout;
  const down = status === 'disabled' || status === 'destroyed';
  const dead = status === 'destroyed';
  const body = layers(role, parts, u).map(([slot, el], k) => {
    if (slot === hide) return null;
    let node = el;
    if (dead && slot === 'head') node = <g transform={`translate(10 16) ${rot(38, X, r.hy)}`}>{el}</g>;
    else if (status === 'disabled' && slot === 'head') node = <g transform={rot(18, X, r.tt)}>{el}</g>;
    return (
      <g key={k} className={`rf-slot rf-${slot}`}>
        {slot === highlight && <g className="rf-hl" filter={f('hl')}>{el}</g>}
        {node}
      </g>
    );
  });
  const tilt = dead ? `translate(-6 26) ${rot(-24, X, 250)}` : status === 'disabled' ? `translate(0 8) ${rot(-9, X, 250)}` : undefined;
  return (
    <g className={`rf-root rf-${status}`}>
      <Defs u={u} />
      <ellipse cx={X} cy={251} rx={r.sw + 22} ry={7} fill="#000" opacity={0.28} />
      <g transform={mirror ? 'matrix(-1 0 0 1 200 0)' : undefined}>
        <g transform={tilt}>
          <g className={idle && !down ? 'rf-idle' : undefined}>
            <g filter={dead ? f('char') : undefined}>
              <g filter={f('ol')}>{body}</g>
            </g>
          </g>
          {status === 'disabled' && (
            <g className="rf-spark">
              {L(D`M${X - 10} ${r.tt - 2}l4 -7l1 5l5 -6M${X + r.sw} ${r.tt + 22}l6 -3l-2 5l7 -2`, '#ffd65a', 1.8)}
            </g>
          )}
          {dead && <g className="rf-spark">{L(D`M${X - 8} ${r.cb - 18}l5 -6l1 5l6 -5M${X + 14} ${r.tt + 6}l6 -4l-1 5l6 -3`, '#ffb13b', 1.8)}</g>}
        </g>
        {dead && [0, 1, 2].map((k) => <circle key={k} className="rf-smoke" cx={X - 36 + k * 12} cy={r.tt + 34} r={10 + k * 2} fill="#4a4843" style={{animationDelay: `${k * 0.8}s`}} />)}
      </g>
    </g>
  );
}

export function robotFigureTitle(role: RobotRole, parts: Record<PartSlot, number>) {
  const name = role.charAt(0).toUpperCase() + role.slice(1);
  return `${name} robot: ${SLOTS.map((s) => `${s} Mk ${Math.max(0, Math.floor(parts[s] ?? 0)) + 1}`).join(', ')} (temporary vector art)`;
}

export function RobotFigure(props: RobotFigureProps) {
  const {height = 160, className, title, ...rest} = props;
  const label = title ?? robotFigureTitle(props.role, props.parts);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${FIGURE_VIEWBOX.width} ${FIGURE_VIEWBOX.height}`} height={height} width={(height * FIGURE_VIEWBOX.width) / FIGURE_VIEWBOX.height} className={`rf-svg${className ? ' ' + className : ''}`} role="img" aria-label={label}>
      <title>{label}</title>
      <RobotFigureGroup {...rest} />
    </svg>
  );
}

export function RobotPartSvg(props: {role: RobotRole; slot: PartSlot; tier: number; height?: number; className?: string}) {
  const {role, slot, tier, height = 160, className} = props;
  const u = uid(useId());
  const f = urlOf(u);
  const parts = {head: 0, torso: 0, legs: 0, arms: 0, gear: 0, [slot]: tier};
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${FIGURE_VIEWBOX.width} ${FIGURE_VIEWBOX.height}`} height={height} width={(height * FIGURE_VIEWBOX.width) / FIGURE_VIEWBOX.height} className={`rf-svg${className ? ' ' + className : ''}`} aria-hidden="true">
      <Defs u={u} />
      <g filter={f('ol')}>
        {layers(role, parts, u).filter(([s]) => s === slot).map(([, el], k) => <g key={k}>{el}</g>)}
      </g>
    </svg>
  );
}

// ---------- Dominion (Iron Dominion rogue machines) ----------
export type DominionKind = 'crawler' | 'walker';
export interface DominionFigureProps {
  kind: DominionKind;
  height?: number;
  status?: 'ready' | 'destroyed';
  mirror?: boolean;
  className?: string;
  title?: string;
}
const limb = (x1: number, y1: number, x2: number, y2: number, w: number, fill: string, sw = 2.2) => {
  const l = Math.hypot(x2 - x1, y2 - y1) || 1, nx = (-(y2 - y1) / l) * (w / 2), ny = ((x2 - x1) / l) * (w / 2);
  return (
    <g>
      {P(D`M${x1 + nx} ${y1 + ny}L${x2 + nx * 0.8} ${y2 + ny * 0.8}L${x2 - nx * 0.8} ${y2 - ny * 0.8}L${x1 - nx} ${y1 - ny}Z`, fill, sw)}
      {L(D`M${x1 + nx * 0.6} ${y1 + ny * 0.6 + 3}L${x2 + nx * 0.5} ${y2 + ny * 0.5 - 3}`, '#fff', 1.4, 0.35)}
    </g>
  );
};

function crawler(f: (m: string) => string, dead: boolean) {
  const legs = (far: boolean) =>
    [-1, 1].map((d) => {
      const hx = 130 + d * (far ? 34 : 42), hy = far ? 100 : 124;
      const kx = 130 + d * (far ? 90 : 84), ky = dead ? 150 : far ? 56 : 92;
      const fx = 130 + d * (far ? 112 : 74), fy = 186;
      return (
        <g key={d}>
          {limb(hx, hy, kx, ky, far ? 20 : 26, f(far ? 'iron' : 'iron4'))}
          {limb(kx, ky, fx, fy - 10, far ? 16 : 21, f(far ? 'iron' : 'blood4'))}
          {Ci(kx, ky, far ? 11 : 14, f(far ? 'iron' : 'blood4'), 2.2)}
          {P(D`M${fx - 11} ${fy - 16}H${fx + 11}L${fx + d * 4} ${fy + 2}Z`, f('iron4'), 2.2)}
        </g>
      );
    });
  return (
    <g transform="translate(160 210) scale(1.2) translate(-130 -190)">
      <g opacity={0.9}>{legs(true)}</g>
      <g transform={dead ? 'translate(0 40) rotate(-7 130 120)' : undefined}>
        {P('M70 118Q72 62 130 56Q188 62 190 118L174 144H86Z', f('iron4'), 2.4)}
        {P('M90 82Q130 60 170 82L162 98Q130 86 98 98Z', f('blood4'), 2)}
        {P('M80 108Q130 90 180 108L176 122Q130 106 84 122Z', f('blood'), 2)}
        {L('M130 60V84', '#0c0d10', 2)}
        {riv(96, 112, 164, 112, 108, 88, 152, 88)}
        {CB(98, 110, 64, 38, f('iron4'), 8, 2.2)}
        {P('M104 120H156L150 134H110Z', '#120606', 1.8)}
        {glow('M110 127H150', 1.8, true)}
        {lamp(f, 116, 127, 3.4, 'r')}
        {lamp(f, 130, 128, 4.2, 'r')}
        {lamp(f, 144, 127, 3.4, 'r')}
        {B(94, 138, 11, 24, f('iron'), 3)}
        {B(155, 138, 11, 24, f('iron'), 3)}
        {lamp(f, 99.5, 163, 2.4, 'r')}
        {lamp(f, 160.5, 163, 2.4, 'r')}
        {spec(104, 72, 14, 3.5, -18)}
      </g>
      {legs(false)}
    </g>
  );
}

function walker(f: (m: string) => string, dead: boolean) {
  const sw = 3;
  const leg = (d: number) => (
    <g key={d}>
      {limb(210 + d * 50, 330, 210 + d * 96, 425, 56, f('iron4'), sw)}
      {limb(210 + d * 96, 425, 210 + d * 76, 535, 44, f('iron'), sw)}
      {CB(210 + d * 96 - 34, 392, 68, 58, f('blood4'), 12, sw)}
      {strip(210 + d * 96 - 18, 426, 36, 6, true)}
      {P(D`M${210 + d * 76 - 52} ${590}L${210 + d * 76 - 38} ${532}H${210 + d * 76 + 38}L${210 + d * 76 + 52} ${590}Z`, f('iron4'), sw)}
      {B(210 + d * 76 - 30, 548, 60, 14, f('blood'), 4, 2.4)}
    </g>
  );
  const upper = (
    <g>
      {[-1, 1].map((d) => <g key={d}>{B(210 + d * 70 - 12, 44, 24, 90, f('iron'), 5, sw)}{lamp(f, 210 + d * 70, 44, 6, 'r')}</g>)}
      {CB(150, 296, 120, 64, f('iron4'), 14, sw)}
      {P('M84 196Q94 118 210 106Q326 118 336 196L300 318H120Z', f('iron4'), 3.4)}
      {CB(124, 190, 78, 76, f('blood4'), 14, sw)}
      {CB(218, 190, 78, 76, f('blood4'), 14, sw)}
      {CB(176, 262, 68, 44, '#140808', 8, 2.4)}
      {[0, 1, 2].map((k) => <g key={k}>{glow(`M188 ${274 + k * 11}H232`, 2.2, true)}</g>)}
      {riv(132, 198, 194, 198, 226, 198, 288, 198)}
      {spec(150, 140, 30, 6, -12)}
      {/* claw arm */}
      {limb(84, 190, 62, 318, 44, f('iron'), sw)}
      {CB(18, 300, 84, 120, f('blood4'), 16, sw)}
      {strip(34, 330, 52, 7, true)}
      {[0, 1, 2].map((k) => <g key={k}>{P(D`M${26 + k * 26} 416h20l-8 46l-10 6Z`, f('iron4'), 2.6)}</g>)}
      {/* cannon arm */}
      {limb(336, 190, 356, 290, 44, f('iron'), sw)}
      <g transform="translate(356 300) rotate(62)">
        {[-22, 0, 22].map((k) => <g key={k}>{B(60, k - 8, 118, 16, f('iron'), 5, 2.6)}</g>)}
        {CB(166, -40, 24, 80, f('iron4'), 8, sw)}
        {lamp(f, 190, 0, 9, 'r')}
        {CB(-40, -52, 124, 104, f('iron4'), 18, sw)}
        {CB(-18, -40, 80, 34, f('blood4'), 10, 2.6)}
        {strip(-14, 12, 72, 7, true)}
        {riv(-30, -40, 72, -40, -30, 40, 72, 40)}
      </g>
      {/* shoulders */}
      {[-1, 1].map((d) => <g key={d}>{CB(210 + d * 118 - 54, 118, 108, 88, f('blood4'), 20, 3.2)}{CB(210 + d * 118 - 40, 196, 80, 22, f('iron'), 8, 2.6)}{spec(210 + d * 118 - 22, 134, 20, 4, -10)}</g>)}
      {/* head */}
      {CB(174, 96, 72, 62, f('iron4'), 14, sw)}
      {P('M184 118H236L228 144H192Z', '#120606', 2.4)}
      {lamp(f, 198, 128, 5.5, 'r')}
      {lamp(f, 222, 128, 5.5, 'r')}
      {lamp(f, 210, 140, 4.5, 'r')}
      {CB(196, 86, 28, 16, f('blood4'), 5, 2.4)}
    </g>
  );
  return (
    <g>
      <g transform={dead ? 'translate(0 590) scale(1 0.5) translate(0 -590)' : undefined}>{[-1, 1].map(leg)}</g>
      <g transform={dead ? 'translate(20 190) rotate(16 210 330)' : undefined}>{upper}</g>
    </g>
  );
}

export function DominionFigureGroup(props: Omit<DominionFigureProps, 'height' | 'className' | 'title'>) {
  const {kind, status = 'ready', mirror = false} = props;
  const u = uid(useId());
  const f = urlOf(u);
  const vb = DOMINION_VIEWBOX[kind] ?? DOMINION_VIEWBOX.crawler;
  const dead = status === 'destroyed';
  const cx = vb.width / 2, gy = vb.height - 10;
  return (
    <g className={`rf-root rf-${dead ? 'destroyed' : 'ready'}`}>
      <Defs u={u} />
      <ellipse cx={cx} cy={gy} rx={vb.width * 0.38} ry={kind === 'walker' ? 16 : 9} fill="#000" opacity={0.3} />
      <g transform={mirror ? `matrix(-1 0 0 1 ${vb.width} 0)` : undefined}>
        <g filter={dead ? f('char') : undefined}>
          <g filter={f('ol')}>{kind === 'walker' ? walker(f, dead) : crawler(f, dead)}</g>
        </g>
        {dead && (
          <g>
            <g className="rf-spark">{L(D`M${cx - 20} ${gy - vb.height * 0.3}l8 -10l2 8l10 -8`, '#ffb13b', kind === 'walker' ? 3 : 1.8)}</g>
            {[0, 1, 2].map((k) => <circle key={k} className="rf-smoke" cx={cx - vb.width * 0.08 + k * vb.width * 0.08} cy={gy - vb.height * 0.4} r={vb.width * (0.05 + k * 0.012)} fill="#4a4843" style={{animationDelay: `${k * 0.8}s`}} />)}
          </g>
        )}
      </g>
    </g>
  );
}

export function DominionFigure(props: DominionFigureProps) {
  const {height = 160, className, title, ...rest} = props;
  const vb = DOMINION_VIEWBOX[props.kind] ?? DOMINION_VIEWBOX.crawler;
  const label = title ?? `Dominion ${props.kind === 'walker' ? 'Walker' : 'Crawler'} (temporary vector art)`;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${vb.width} ${vb.height}`} height={height} width={(height * vb.width) / vb.height} className={`rf-svg${className ? ' ' + className : ''}`} role="img" aria-label={label}>
      <title>{label}</title>
      <DominionFigureGroup {...rest} />
    </svg>
  );
}
