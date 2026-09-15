/**
 * Field Sandbox refit art: TEMPORARY prototype vector overlays.
 *
 * Nothing in the existing Asset renders shows packages (the art only changes
 * at rank 10), so these bolt-on kit modules are drawn around the edges of
 * the hero render: one module per package, one rank plate, and one fitting
 * per Field Workshop level over Matt's building image. Every level draws
 * something different (level 1 = empty mount socket; after that the item
 * count equals level - 1, grouped in threes into units, plus a pip strip),
 * and whatever was fitted stays drawn afterwards because every overlay is
 * drawn straight from the real levels.
 *
 * Service Rank: every rank step 2..10 bolts on one SERVICE KIT component
 * appropriate to the Asset type (armour, rotary, aircraft), and the parts
 * already fitted stay drawn. A small blanking cover marks the mount the next
 * rank will use; the rank ceremony removes that cover and installs the part.
 * Visual only: the rank's real effect is the live attribute change.
 *
 * Styled as chunky bevelled toy blocks to match the renders: sand / olive /
 * gunmetal, dark outline, light top band, shadow band, cyan light strips.
 */
import {type CSSProperties, type ReactNode, useId} from 'react';
import type {AssetCategory} from '../../shared/assets';
import type {PackageKey, Packages} from '../../shared/upgrades';
// refitArt.css is imported by Sandbox.tsx, so this file stays importable from node tests.

export const KIT_VIEWBOX = 100;
export const WORKSHOP_VIEWBOX = {width: 512, height: 328};

const OL = '#1b1f1a';
const CY = '#5fe3ff';
const AMB = '#ffb938';
type Mat = 'sand' | 'olive' | 'gun' | 'dark';
const MAT: Record<Mat, [string, string, string]> = {
  sand: ['#f8cd86', '#e0a04a', '#a5661f'],
  olive: ['#a0b05c', '#6b7a3a', '#414a21'],
  gun: ['#949ca4', '#5b636b', '#373c42'],
  dark: ['#595e58', '#343831', '#1e211d'],
};
const PKGS: PackageKey[] = ['protection', 'propulsion', 'electronics', 'armament'];

const lvl = (n: number) => Math.max(1, Math.min(10, Math.floor(Number(n) || 1)));
const seq = (n: number) => Array.from({length: Math.max(0, n)}, (_, i) => i);
const fill = (u: string, m: Mat) => `url(#${u}${m})`;
function useUid() {
  return 'ra' + useId().replace(/[^a-zA-Z0-9]/g, '');
}
/** Items = level - 1, grouped in threes: [1], [2], [3], [3,1] ... [3,3,3]. */
function units(level: number) {
  const n = level - 1;
  return seq(Math.ceil(n / 3)).map((i) => Math.min(3, n - i * 3));
}

function Defs({u}: {u: string}) {
  return (
    <defs>
      {(Object.keys(MAT) as Mat[]).map((m) => (
        <linearGradient key={m} id={u + m} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={MAT[m][0]} />
          <stop offset="0.45" stopColor={MAT[m][1]} />
          <stop offset="1" stopColor={MAT[m][2]} />
        </linearGradient>
      ))}
      <radialGradient id={u + 'glow'}>
        <stop offset="0" stopColor={CY} stopOpacity="0.8" />
        <stop offset="1" stopColor={CY} stopOpacity="0" />
      </radialGradient>
      <linearGradient id={u + 'cone'} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#eafcff" stopOpacity="0.6" />
        <stop offset="1" stopColor={CY} stopOpacity="0" />
      </linearGradient>
      <pattern id={u + 'haz'} width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="3" height="3" fill={AMB} />
        <rect width="1.5" height="3" fill={OL} />
      </pattern>
      <pattern id={u + 'hazW'} width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="12" height="12" fill={AMB} />
        <rect width="6" height="12" fill={OL} />
      </pattern>
    </defs>
  );
}

/** Bevelled block: gradient body, dark outline, light top band, shadow band. */
function blk(u: string, x: number, y: number, w: number, h: number, m: Mat = 'sand', r = 1.1, sw = 0.6) {
  const b = Math.min(h * 0.2, sw * 1.8);
  return (
    <>
      <rect x={x} y={y} width={w} height={h} rx={r} fill={fill(u, m)} stroke={OL} strokeWidth={sw} />
      <rect x={x + sw + b * 0.3} y={y + sw * 0.9} width={Math.max(0, w - 2 * sw - b * 0.6)} height={b} rx={b / 2} fill={MAT[m][0]} opacity={0.85} />
      <rect x={x + sw} y={y + h - sw - b * 0.9} width={Math.max(0, w - 2 * sw)} height={b * 0.9} rx={b / 2} fill={MAT[m][2]} opacity={0.6} />
    </>
  );
}
function lite(x: number, y: number, w: number, h: number, sw = 0.3) {
  return <rect className="ra-blink" x={x} y={y} width={w} height={h} rx={Math.min(w, h) / 2} fill={CY} stroke={OL} strokeWidth={sw} />;
}
/** Level pips: a compact 3-wide grid, one cyan dot per level above 1; the ninth is amber with a spark. */
function pips(x: number, y: number, n: number) {
  if (n <= 0) return null;
  const rows = Math.ceil(n / 3);
  return (
    <g>
      <rect x={x} y={y} width={5.2} height={1.1 + rows * 1.35} rx={0.9} fill={MAT.dark[1]} stroke={OL} strokeWidth={0.35} />
      {seq(n).map((i) => (
        <circle key={i} cx={x + 1.25 + (i % 3) * 1.35} cy={y + 1.2 + Math.floor(i / 3) * 1.35} r={0.45} fill={i === 8 ? AMB : CY} />
      ))}
      {n >= 9 && <path d={`M${x + 6.6} ${y - 1.2}l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6z`} fill={AMB} stroke={OL} strokeWidth={0.25} />}
    </g>
  );
}
function socket() {
  return (
    <g opacity={0.78}>
      <circle r={3} fill={MAT.dark[1]} stroke={OL} strokeWidth={0.6} />
      <circle r={1.7} fill="none" stroke={MAT.gun[0]} strokeWidth={0.45} strokeDasharray="0.8 0.6" className="ra-nf" />
      {[45, 135, 225, 315].map((a) => (
        <circle key={a} cx={2.3 * Math.cos((a * Math.PI) / 180)} cy={2.3 * Math.sin((a * Math.PI) / 180)} r={0.33} fill={MAT.gun[0]} />
      ))}
    </g>
  );
}

// ── Package module designs, local coords, origin = mount point ─────────────
type Design = (u: string, lv: number) => ReactNode;

/** Box launcher: rows of three tubes stacked upward off a bracket. */
const launcher: Design = (u, lv) => {
  const us = units(lv);
  return (
    <>
      {blk(u, -2.2, -3, 5, 4.4, 'gun')}
      {us.map((c, i) => {
        const x = -1 + i * 1.4;
        const y = -9 - i * 5.6;
        return (
          <g key={i}>
            {blk(u, x, y, c * 4.4 + 2.2, 6.2, i === 1 ? 'sand' : 'olive')}
            {seq(c).map((k) => (
              <g key={k}>
                <circle cx={x + 3.3 + k * 4.4} cy={y + 3.1} r={1.75} fill={MAT.dark[1]} stroke={OL} strokeWidth={0.45} />
                <circle cx={x + 3.3 + k * 4.4} cy={y + 3.1} r={0.8} fill={MAT.sand[1]} />
              </g>
            ))}
          </g>
        );
      })}
      {lv >= 5 && <rect x={-1.6} y={-8.6} width={1.6} height={5.4} fill={`url(#${u}haz)`} stroke={OL} strokeWidth={0.35} />}
      {lv >= 8 && (
        <g>
          {blk(u, 14.2, -13.2, 4.2, 3.4, 'gun')}
          {lite(15, -12, 2.6, 1)}
        </g>
      )}
      {pips(3.4, -2.2, lv - 1)}
    </>
  );
};

/** Rocket pods hung from a pylon; rocket noses show per pod. */
const pods: Design = (u, lv) => (
  <>
    {blk(u, -1.6, -1.5, 3.2, 4, 'gun')}
    {units(lv).map((c, i) => {
      const x = -6 + i * 1.2;
      const y = 2.2 + i * 4.9;
      const L = 12.5;
      return (
        <g key={i}>
          {seq(c).map((k) => (
            <path key={k} d={`M${x + L - 1} ${y + 0.75 + k * 1.3}l3 .55-3 .55z`} fill={MAT.sand[1]} stroke={OL} strokeWidth={0.3} />
          ))}
          <rect x={x} y={y} width={L} height={4.4} rx={2.2} fill={fill(u, i === 1 ? 'sand' : 'olive')} stroke={OL} strokeWidth={0.55} />
          <rect x={x + 1.2} y={y + 0.7} width={L - 4} height={0.9} rx={0.45} fill="#fff" opacity={0.35} />
          <rect x={x + 3.5} y={y} width={0.8} height={4.4} fill={MAT.dark[1]} opacity={0.7} />
          <rect x={x + L - 3} y={y + 0.2} width={2.6} height={4} rx={1.3} fill={fill(u, 'gun')} stroke={OL} strokeWidth={0.45} />
        </g>
      );
    })}
    {lv >= 8 && lite(-5.2, 17, 3.2, 0.9)}
    {pips(2.2, -1.5, lv - 1)}
  </>
);

/** Underwing hardpoints: pylons along the wing, missiles racked under each. */
const hardpoint: Design = (u, lv) => (
  <>
    {units(lv).map((c, i) => {
      const x = -i * 7.2;
      const y = i * 1.9;
      return (
        <g key={i}>
          {blk(u, x - 1.3, y - 0.5, 2.6, 3, 'gun', 0.6)}
          {seq(c).map((k) => {
            const my = y + 2.6 + k * 2.4;
            return (
              <g key={k}>
                <path d={`M${x - 4.6} ${my}l-1.4-1.1v3.4l1.4-.5z`} fill={MAT.gun[1]} stroke={OL} strokeWidth={0.3} />
                <rect x={x - 4.8} y={my - 0.1} width={9} height={1.9} rx={0.95} fill={fill(u, 'sand')} stroke={OL} strokeWidth={0.4} />
                <circle cx={x + 3.6} cy={my + 0.85} r={0.45} fill={CY} />
              </g>
            );
          })}
        </g>
      );
    })}
    {pips(3, -2.4, lv - 1)}
  </>
);

type PlateShape = 'skirt' | 'belly' | 'fairing';
/** Armour plates: rows of panels on a rail, each new row layered in front. */
const plates =
  (shape: PlateShape): Design =>
  (u, lv) => {
    const us = units(lv);
    const pw = shape === 'fairing' ? 5.8 : 5.2;
    const ph = shape === 'fairing' ? 4.2 : 6.4;
    const railW = us[0] * (pw + 0.3) + 1.8;
    const [ox, oy] = shape === 'skirt' ? [0.9, 4.4] : [1.7, 3.3];
    return (
      <>
        {blk(u, -1, -2.4, railW, 2.6, 'gun', 0.8)}
        {us.map((c, i) => (
          <g key={i}>
            {seq(c).map((k) => {
              const x = k * (pw + 0.3) + i * ox;
              const y = i * oy;
              const m: Mat = i === 1 ? 'olive' : 'sand';
              return (
                <g key={k}>
                  {shape === 'skirt' ? (
                    blk(u, x, y, pw, ph, m, 0.9)
                  ) : (
                    <path
                      d={shape === 'belly' ? `M${x} ${y}h${pw}v${ph - 2.6}q0 2.6-${pw / 2} 2.6t-${pw / 2}-2.6z` : `M${x + 1} ${y}h${pw - 2}q1 0 1 ${ph / 2}t-1 ${ph / 2}h-${pw - 2}q-1 0-1-${ph / 2}t1-${ph / 2}z`}
                      fill={fill(u, m)}
                      stroke={OL}
                      strokeWidth={0.55}
                    />
                  )}
                  <circle cx={x + 1.2} cy={y + 1.2} r={0.35} fill={OL} />
                  <circle cx={x + pw - 1.2} cy={y + 1.2} r={0.35} fill={OL} />
                </g>
              );
            })}
          </g>
        ))}
        {lv >= 8 && <rect x={2 * ox} y={2 * oy + 0.2} width={us[2] * (pw + 0.3) - 0.3} height={1.5} fill={`url(#${u}haz)`} stroke={OL} strokeWidth={0.3} />}
        {lv >= 10 && lite(2 * ox + 0.5, 2 * oy + ph - 1.6, 3 * (pw + 0.3) - 1.3, 0.8)}
        {pips(railW - 0.6, -2.9, lv - 1)}
      </>
    );
  };

/** Exhaust housings stacked down the rear; pipes stick out per housing. */
const exhaust: Design = (u, lv) => (
  <>
    {units(lv).map((c, i) => {
      const y = -i * 5.8;
      return (
        <g key={i}>
          {seq(c).map((k) => (
            <g key={k}>
              <rect x={-3.4} y={y + 0.5 + k * 1.75} width={4.5} height={1.5} rx={0.5} fill={fill(u, 'gun')} stroke={OL} strokeWidth={0.35} />
              <ellipse cx={-3.3} cy={y + 1.25 + k * 1.75} rx={0.45} ry={0.65} fill={lv >= 8 ? '#ff8a3a' : OL} />
            </g>
          ))}
          {blk(u, 0, y, 7, 5.4, i === 1 ? 'olive' : 'sand')}
          <path d={`M2 ${y + 2}h3.5M2 ${y + 3.3}h3.5`} stroke={OL} strokeWidth={0.4} className="ra-nf" />
        </g>
      );
    })}
    {lv >= 10 && lite(6.2, -10.8, 0.9, 15)}
    {pips(7.6, 0, lv - 1)}
  </>
);

/** Engine nacelles: intake fan at the front, cyan bands per nacelle. */
const turbine: Design = (u, lv) => {
  const us = units(lv);
  return (
    <>
      {blk(u, -1.2, -3, 2.4, 3.6, 'gun', 0.5)}
      {us.map((c, i) => ({c, i})).reverse().map(({c, i}) => {
        const x = -6 - i * 3.6;
        const y = -8 - i * 3.9;
        return (
          <g key={i}>
            <path d={`M${x} ${y + 1}l-1.6.6v3l1.6.6z`} fill={MAT.dark[1]} stroke={OL} strokeWidth={0.35} />
            <rect x={x} y={y} width={12} height={5} rx={2.5} fill={fill(u, i === 1 ? 'olive' : 'sand')} stroke={OL} strokeWidth={0.55} />
            <rect x={x + 1.4} y={y + 0.7} width={7} height={0.9} rx={0.45} fill="#fff" opacity={0.35} />
            {seq(c).map((k) => (
              <g key={k}>{lite(x + 2.2 + k * 2, y + 0.4, 0.8, 4.2, 0.25)}</g>
            ))}
            <ellipse cx={x + 11.4} cy={y + 2.5} rx={1.5} ry={2.5} fill={fill(u, 'gun')} stroke={OL} strokeWidth={0.5} />
            <ellipse cx={x + 11.6} cy={y + 2.5} rx={0.8} ry={1.6} fill={OL} />
            <path d={`M${x + 11.6} ${y + 1.1}v2.8M${x + 11} ${y + 2.5}h1.2`} stroke={MAT.gun[0]} strokeWidth={0.3} className="ra-nf" />
          </g>
        );
      })}
      {pips(1.8, -2.6, lv - 1)}
    </>
  );
};

/** Antenna cluster: mast groups on small bases, radar bar and dish added. */
const antenna: Design = (u, lv) => (
  <>
    {units(lv).map((c, i) => {
      const x = i * 6.4;
      const H = [7.5, 5, 9];
      return (
        <g key={i}>
          {seq(c).map((k) => (
            <g key={k}>
              <rect x={x - 1.8 + k * 1.5} y={-2.6 - H[k] - i} width={0.8} height={H[k] + i} fill={MAT.gun[0]} stroke={OL} strokeWidth={0.3} />
              <circle className="ra-blink" cx={x - 1.4 + k * 1.5} cy={-2.8 - H[k] - i} r={0.7} fill={CY} stroke={OL} strokeWidth={0.3} />
            </g>
          ))}
          {i === 1 && c === 3 && blk(u, x - 1.2, -12.2, 6, 1.9, 'sand', 0.9, 0.4)}
          {i === 2 && c === 3 && <ellipse cx={x + 1.8} cy={-7.5} rx={1.7} ry={2.8} fill={fill(u, 'gun')} stroke={OL} strokeWidth={0.4} />}
          {blk(u, x - 2.5, -3, 5, 3.2, i === 1 ? 'olive' : 'gun')}
        </g>
      );
    })}
    {pips(-2.5, 0.8, lv - 1)}
  </>
);

/** Sensor balls on a nose bracket; one cyan lens per level in each ball. */
const sensor: Design = (u, lv) => (
  <>
    {blk(u, -1.4, -1, 2.8, 3.6, 'gun', 0.6)}
    {units(lv).map((c, i) => ({c, i})).reverse().map(({c, i}) => {
      const cx = [0, -4.4, 3.6][i];
      const cy = [-4.4, -9, -10.4][i];
      const r = i === 0 ? 3.4 : 2.9;
      return (
        <g key={i}>
          <circle cx={cx} cy={cy} r={r} fill={fill(u, i === 1 ? 'sand' : 'gun')} stroke={OL} strokeWidth={0.55} />
          <path d={`M${cx - r * 0.6} ${cy - r * 0.55}a${r * 0.8} ${r * 0.8} 0 0 1 ${r * 1.1} -${r * 0.25}`} stroke="#fff" strokeWidth={0.6} opacity={0.5} className="ra-nf" />
          <ellipse cx={cx + r * 0.35} cy={cy + 0.2} rx={r * 0.5} ry={r * 0.75} fill={MAT.dark[2]} />
          {seq(c).map((k) => (
            <circle key={k} className="ra-blink" cx={cx + r * 0.35} cy={cy + 0.2 + (k - (c - 1) / 2) * 1.5} r={0.55} fill={CY} />
          ))}
        </g>
      );
    })}
    {pips(-7.2, -1, lv - 1)}
  </>
);

/** Satcom domes on a base plate; cyan band segments per dome. */
const dome: Design = (u, lv) => (
  <>
    {units(lv).map((c, i) => {
      const x = -i * 8.2;
      const y = i * 1.8;
      const w = i === 0 ? 10 : 7.6;
      return (
        <g key={i}>
          <path d={`M${x - w / 2} ${y}a${w / 2} ${w * 0.55} 0 0 1 ${w} 0z`} fill={fill(u, 'gun')} stroke={OL} strokeWidth={0.55} />
          <path d={`M${x - w * 0.3} ${y - w * 0.3}q${w * 0.2} -${w * 0.2} ${w * 0.4} -${w * 0.15}`} stroke="#fff" strokeWidth={0.7} opacity={0.55} className="ra-nf" />
          {blk(u, x - w / 2 - 0.6, y - 0.2, w + 1.2, 2.6, i === 1 ? 'olive' : 'sand', 0.8)}
          {seq(c).map((k) => (
            <g key={k}>{lite(x - w / 2 + 0.6 + k * (w / 3), y + 0.5, w / 3 - 0.8, 0.9, 0.2)}</g>
          ))}
        </g>
      );
    })}
    {pips(6.2, -0.4, lv - 1)}
  </>
);

// ── Service Rank kit: one component per rank step, per Asset family ───────

export type ServiceFamily = 'armour' | 'rotary' | 'aircraft';
export interface ServiceItem {
  id: string;
  /** The rank that installs it (2..10). */
  step: number;
  name: string;
}
type ServiceDef = {id: string; name: string; x: number; y: number; s: number; draw: (u: string) => ReactNode};

/** Which kit family an Asset category draws. Artillery and naval use the armour kit; drones and jets the aircraft kit. */
export function serviceFamily(category: AssetCategory): ServiceFamily {
  return category === 'rotary' ? 'rotary' : category === 'drone' || category === 'fixed_wing' ? 'aircraft' : 'armour';
}

const tube = (u: string, x: number, y: number, len: number, r: number, m: Mat = 'gun') => (
  <>
    <rect x={x} y={y - r} width={len} height={r * 2} rx={r} fill={fill(u, m)} stroke={OL} strokeWidth={0.45} />
    <ellipse cx={x + len} cy={y} rx={r * 0.55} ry={r} fill={MAT.dark[2]} stroke={OL} strokeWidth={0.35} />
  </>
);

const ARMOUR_KIT: ServiceDef[] = [
  {id: 'tow-shackles', name: 'Tow shackles', x: 83, y: 63, s: 1.9, draw: (u) => (
    <>
      {blk(u, -4.5, 0, 9, 2.6, 'gun', 0.6, 0.5)}
      {[-2.4, 2.4].map((dx) => (
        <path key={dx} d={`M${dx - 1.4} 2.4v2.6a1.4 1.4 0 0 0 2.8 0v-2.6`} fill="none" stroke={OL} strokeWidth={1.5} className="ra-nf" />
      ))}
      {[-2.4, 2.4].map((dx) => (
        <path key={`i${dx}`} d={`M${dx - 1.4} 2.4v2.6a1.4 1.4 0 0 0 2.8 0v-2.6`} fill="none" stroke={AMB} strokeWidth={0.7} className="ra-nf" />
      ))}
    </>
  )},
  {id: 'track-guards', name: 'Track guards', x: 84, y: 51, s: 1.4, draw: (u) => (
    <>
      <path d="M-5 0h9l2 3v5h-3l-1-4h-7z" fill={fill(u, 'olive')} stroke={OL} strokeWidth={0.55} />
      <path d="M-4.4 1h8" stroke={MAT.olive[0]} strokeWidth={0.6} className="ra-nf" />
      <rect x={3.2} y={4.4} width={2.6} height={3.4} fill={fill(u, 'dark')} stroke={OL} strokeWidth={0.35} />
    </>
  )},
  {id: 'smoke-launchers', name: 'Smoke grenade launchers', x: 23, y: 26, s: 1.9, draw: (u) => (
    <>
      {blk(u, -1, 1.5, 7, 3, 'gun', 0.6, 0.45)}
      {[0, 1, 2, 3].map((i) => (
        <g key={i} transform={`translate(${i * 1.6} 0) rotate(-35)`}>
          {tube(u, 0, 0, 4, 0.75, 'olive')}
        </g>
      ))}
    </>
  )},
  {id: 'commander-sight', name: "Commander's sight", x: 31, y: 12, s: 1.9, draw: (u) => (
    <>
      {blk(u, -3, 2, 6, 3, 'gun', 0.6, 0.45)}
      {blk(u, -2.2, -2.4, 4.4, 4.6, 'sand', 0.8, 0.5)}
      <rect x={-1.6} y={-1.6} width={3.2} height={1.5} rx={0.4} fill="#0c1417" stroke={CY} strokeWidth={0.45} className="ra-blink" />
    </>
  )},
  {id: 'spare-track', name: 'Spare track links', x: 58, y: 50, s: 1.9, draw: (u) => (
    <>
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x={i * 2.7} y={i * -0.7} width={2.5} height={5.2} rx={0.5} fill={fill(u, 'dark')} stroke={OL} strokeWidth={0.4} />
          <rect x={i * 2.7 + 0.5} y={i * -0.7 + 1.4} width={1.5} height={0.6} fill={MAT.gun[0]} />
          <rect x={i * 2.7 + 0.5} y={i * -0.7 + 3.2} width={1.5} height={0.6} fill={MAT.gun[0]} />
        </g>
      ))}
    </>
  )},
  {id: 'bustle-rack', name: 'Turret stowage rack', x: 9, y: 20, s: 1.9, draw: (u) => (
    <>
      <path d="M-4 5h10M-4 0h10M-4 0v5M1 0v5M6 0v5" stroke={OL} strokeWidth={0.9} className="ra-nf" />
      <path d="M-4 5h10M-4 0h10M-4 0v5M1 0v5M6 0v5" stroke={MAT.gun[0]} strokeWidth={0.45} className="ra-nf" />
      {blk(u, -3.4, -2.6, 4, 3.4, 'olive', 0.5, 0.4)}
      {blk(u, 1.2, -1.8, 4, 2.6, 'sand', 0.5, 0.4)}
    </>
  )},
  {id: 'jerry-cans', name: 'Jerry-can rack', x: 20, y: 39, s: 1.9, draw: (u) => (
    <>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          {blk(u, i * 3.1, 0, 2.8, 4.6, 'olive', 0.5, 0.4)}
          <path d={`M${i * 3.1 + 0.6} 1.2l1.6 2.2M${i * 3.1 + 2.2} 1.2l-1.6 2.2`} stroke={MAT.olive[2]} strokeWidth={0.4} className="ra-nf" />
        </g>
      ))}
      <rect x={-0.4} y={4.2} width={9.8} height={0.9} fill={`url(#${u}haz)`} stroke={OL} strokeWidth={0.25} />
    </>
  )},
  {id: 'weapon-station', name: 'Remote weapon station', x: 41, y: 10, s: 1.9, draw: (u) => (
    <>
      {blk(u, -3, 0, 6, 3.4, 'gun', 0.8, 0.5)}
      {tube(u, 2, 1.2, 6.5, 0.6, 'dark')}
      <rect x={-1.8} y={-1.8} width={2.6} height={2} rx={0.4} fill={fill(u, 'sand')} stroke={OL} strokeWidth={0.35} />
      <circle cx={-0.5} cy={-0.8} r={0.5} fill={CY} className="ra-blink" />
    </>
  )},
  {id: 'reactive-armour', name: 'Reactive armour bricks', x: 42, y: 34, s: 1.9, draw: (u) => (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          {blk(u, i * 3, (i % 2) * 0.4, 2.8, 3.4, i % 2 ? 'sand' : 'olive', 0.4, 0.4)}
          <circle cx={i * 3 + 1.4} cy={(i % 2) * 0.4 + 1.7} r={0.35} fill={OL} />
        </g>
      ))}
    </>
  )},
];

const ROTARY_KIT: ServiceDef[] = [
  {id: 'wire-cutter', name: 'Wire-strike cutter', x: 86, y: 43, s: 1.9, draw: (u) => (
    <>
      <path d="M0 0l5 -3l-1 3.4l3 -1.8l-1.4 3.2l-5.6 1.4z" fill={fill(u, 'gun')} stroke={OL} strokeWidth={0.45} />
      <path d="M1 0.6l4.2-2.4" stroke="#fff" strokeWidth={0.4} opacity={0.6} className="ra-nf" />
    </>
  )},
  {id: 'flare-dispensers', name: 'Flare dispensers', x: 12, y: 47, s: 1.9, draw: (u) => (
    <>
      {blk(u, 0, 0, 7, 4, 'gun', 0.6, 0.45)}
      {[0, 1, 2].map((c) => [0, 1].map((r) => <circle key={`${c}${r}`} cx={1.5 + c * 2} cy={1.2 + r * 1.6} r={0.55} fill={MAT.dark[2]} stroke={AMB} strokeWidth={0.3} />))}
    </>
  )},
  {id: 'ir-suppressor', name: 'Exhaust IR suppressor', x: 35, y: 33, s: 1.9, draw: (u) => (
    <>
      <path d="M0 0q-5 0-6 5l2.4.6q1-3 3.6-3z" fill={fill(u, 'dark')} stroke={OL} strokeWidth={0.5} />
      <path d="M-5.6 4.8q.8-2.6 3.2-2.8" stroke="#ff8a3a" strokeWidth={0.5} className="ra-nf" />
      {blk(u, -0.6, -1.6, 3.4, 3.4, 'gun', 0.5, 0.4)}
    </>
  )},
  {id: 'rescue-hoist', name: 'Rescue hoist', x: 64, y: 38, s: 1.9, draw: (u) => (
    <>
      {blk(u, -2, -1, 7, 2.6, 'sand', 0.6, 0.45)}
      <path d="M4.2 1.4v5" stroke={OL} strokeWidth={0.5} className="ra-nf" />
      <path d="M3.4 6.4a0.9 0.9 0 1 0 1.8 0" fill="none" stroke={AMB} strokeWidth={0.6} className="ra-nf" />
      <circle cx={-0.4} cy={0.3} r={0.8} fill={fill(u, 'gun')} stroke={OL} strokeWidth={0.3} />
    </>
  )},
  {id: 'laser-warning', name: 'Laser warning receivers', x: 79, y: 57, s: 1.9, draw: (u) => (
    <>
      {[0, 4.2].map((dx) => (
        <g key={dx}>
          <path d={`M${dx - 1.6} 1.2a1.6 1.6 0 0 1 3.2 0z`} fill={fill(u, 'gun')} stroke={OL} strokeWidth={0.4} />
          <circle cx={dx} cy={0.4} r={0.45} fill={CY} className="ra-blink" />
          <rect x={dx - 1.9} y={1.1} width={3.8} height={0.8} fill={MAT.dark[1]} stroke={OL} strokeWidth={0.25} />
        </g>
      ))}
    </>
  )},
  {id: 'refuel-probe', name: 'Refuelling probe', x: 84, y: 49, s: 1.2, draw: (u) => (
    <>
      {tube(u, 0, 0, 9, 0.6, 'gun')}
      <path d="M9 -1.1l1.8 1.1-1.8 1.1z" fill={AMB} stroke={OL} strokeWidth={0.3} />
      {blk(u, -1.2, -1.3, 2.6, 2.6, 'sand', 0.5, 0.35)}
    </>
  )},
  {id: 'door-gun', name: 'Door gun mount', x: 56, y: 50, s: 1.9, draw: (u) => (
    <>
      <path d="M0 0v4" stroke={OL} strokeWidth={0.8} className="ra-nf" />
      {blk(u, -1.4, -1.6, 3, 2, 'gun', 0.4, 0.35)}
      {tube(u, 1.4, -0.6, 5.5, 0.5, 'dark')}
      <rect x={-1} y={0.4} width={2.2} height={1.6} fill={fill(u, 'olive')} stroke={OL} strokeWidth={0.3} />
    </>
  )},
  {id: 'tail-rotor-guard', name: 'Tail rotor guard', x: 6, y: 40, s: 1.9, draw: (u) => (
    <>
      <path d="M-2 0a6 6 0 0 1 8 -6" fill="none" stroke={OL} strokeWidth={1.6} className="ra-nf" />
      <path d="M-2 0a6 6 0 0 1 8 -6" fill="none" stroke={MAT.sand[1]} strokeWidth={0.8} className="ra-nf" />
      <rect x={-2.8} y={-0.6} width={2} height={1.8} fill={fill(u, 'gun')} stroke={OL} strokeWidth={0.3} />
    </>
  )},
  {id: 'cockpit-armour', name: 'Cockpit armour frame', x: 72, y: 38, s: 1.9, draw: (u) => (
    <>
      <path d="M0 6l2.2-6h8.4l1.4 6" fill="none" stroke={OL} strokeWidth={1.4} className="ra-nf" />
      <path d="M0 6l2.2-6h8.4l1.4 6M6.4 0v6" fill="none" stroke={MAT.gun[0]} strokeWidth={0.7} className="ra-nf" />
      {blk(u, -0.4, 5.2, 12.8, 1.6, 'sand', 0.5, 0.35)}
    </>
  )},
];

const AIRCRAFT_KIT: ServiceDef[] = [
  {id: 'air-data-probe', name: 'Air-data probe', x: 86, y: 59, s: 1.9, draw: (u) => (
    <>
      <path d="M0 0l7 1.6" stroke={OL} strokeWidth={0.9} className="ra-nf" />
      <path d="M0 0l7 1.6" stroke={MAT.gun[0]} strokeWidth={0.45} className="ra-nf" />
      <circle cx={7} cy={1.6} r={0.45} fill={AMB} />
      {blk(u, -1.6, -1, 2.4, 2, 'gun', 0.4, 0.3)}
    </>
  )},
  {id: 'nav-lights', name: 'Wingtip navigation lights', x: 0, y: 0, s: 1, draw: () => (
    <>
      <circle cx={7} cy={65.4} r={2.4} fill="#ff4d4d" stroke={OL} strokeWidth={0.4} className="ra-blink" />
      <circle cx={95} cy={38} r={2.4} fill="#45e38a" stroke={OL} strokeWidth={0.4} className="ra-blink" />
    </>
  )},
  {id: 'gps-blades', name: 'GPS antenna blades', x: 58, y: 44, s: 1.9, draw: (u) => (
    <>
      {[0, 3.6].map((dx) => (
        <path key={dx} d={`M${dx} 0l1.2-3.6h1l-.2 3.6z`} fill={fill(u, 'dark')} stroke={OL} strokeWidth={0.35} />
      ))}
      <rect x={-0.6} y={-0.1} width={6.4} height={1} rx={0.4} fill={MAT.gun[1]} stroke={OL} strokeWidth={0.25} />
    </>
  )},
  {id: 'de-icing', name: 'Leading-edge de-icing boots', x: 70, y: 45.5, s: 1, draw: () => (
    <>
      <path d="M0 3.4L22 -6" stroke={OL} strokeWidth={1.7} strokeLinecap="round" className="ra-nf" />
      <path d="M0 3.4L22 -6" stroke={AMB} strokeWidth={0.9} strokeLinecap="round" strokeDasharray="2.2 0.8" className="ra-nf" />
    </>
  )},
  {id: 'flare-pod', name: 'Tail flare dispenser', x: 20, y: 49, s: 1.9, draw: (u) => (
    <>
      {blk(u, 0, 0, 6, 3.4, 'gun', 0.5, 0.4)}
      {[0, 1, 2].map((c) => <circle key={c} cx={1.3 + c * 1.8} cy={1.7} r={0.55} fill={MAT.dark[2]} stroke={AMB} strokeWidth={0.3} />)}
    </>
  )},
  {id: 'datalink-blade', name: 'Ventral datalink antenna', x: 62, y: 61, s: 1.9, draw: (u) => (
    <>
      <path d="M0 0h4l-1.2 4.4h-1.6z" fill={fill(u, 'dark')} stroke={OL} strokeWidth={0.4} />
      <circle cx={2} cy={3.6} r={0.45} fill={CY} className="ra-blink" />
    </>
  )},
  {id: 'conformal-tank', name: 'Conformal fuel tank', x: 36, y: 51, s: 1.9, draw: (u) => (
    <>
      <rect x={0} y={0} width={13} height={3.6} rx={1.8} fill={fill(u, 'sand')} stroke={OL} strokeWidth={0.5} />
      <rect x={1.4} y={0.6} width={8} height={0.8} rx={0.4} fill="#fff" opacity={0.4} />
      <rect x={10} y={0.3} width={0.8} height={3} fill={MAT.dark[1]} />
    </>
  )},
  {id: 'winglets', name: 'Winglets', x: 0, y: 0, s: 1, draw: (u) => (
    <>
      <path d="M93.5 39l4-9 2 .8-2.6 9.4z" fill={fill(u, 'gun')} stroke={OL} strokeWidth={0.45} />
      <path d="M7 66.2l-2.8-8.6 2-.8 3.6 8.6z" fill={fill(u, 'gun')} stroke={OL} strokeWidth={0.45} />
    </>
  )},
  {id: 'intake-guard', name: 'Engine intake guard', x: 55, y: 38, s: 1.2, draw: () => (
    <>
      <ellipse cx={0} cy={0} rx={1.6} ry={2.6} fill="none" stroke={OL} strokeWidth={1.1} className="ra-nf" />
      <path d="M0 -2.6v5.2M-1.5 -1h3M-1.5 1h3" stroke={MAT.gun[0]} strokeWidth={0.5} className="ra-nf" />
    </>
  )},
];

const SERVICE_KIT: Record<ServiceFamily, ServiceDef[]> = {armour: ARMOUR_KIT, rotary: ROTARY_KIT, aircraft: AIRCRAFT_KIT};

/** The service component a rank step installs (rank 2..10), or null. */
export function serviceItemFor(category: AssetCategory, rank: number): ServiceItem | null {
  const r = Math.floor(rank);
  const d = SERVICE_KIT[serviceFamily(category)][r - 2];
  return d ? {id: d.id, step: r, name: d.name} : null;
}

/** Every service component fitted at a rank, in install order. */
export function serviceItems(category: AssetCategory, rank: number): ServiceItem[] {
  return seq(Math.max(0, lvl(rank) - 1)).map((i) => serviceItemFor(category, i + 2)!).filter(Boolean);
}

function serviceDraw(u: string, category: AssetCategory, step: number) {
  const d = SERVICE_KIT[serviceFamily(category)][step - 2];
  if (!d) return null;
  return (
    <g data-equip={d.id} transform={`translate(${d.x} ${d.y}) scale(${d.s})`}>
      {d.draw(u)}
    </g>
  );
}

/** The blanking cover over the mount the given rank step will use. */
function serviceCover(category: AssetCategory, step: number) {
  const d = SERVICE_KIT[serviceFamily(category)][step - 2];
  if (!d) return null;
  // Items drawn in absolute coordinates (lights, winglets) put their cover at their first point.
  const [cx, cy] = d.x === 0 && d.y === 0 ? (d.id === 'nav-lights' ? [94, 38.4] : [95.6, 36]) : [d.x, d.y];
  return (
    <g data-cover={d.id} transform={`translate(${cx} ${cy})`} opacity={0.85}>
      <rect x={-1.7} y={-1.2} width={3.4} height={2.4} rx={0.5} fill={MAT.dark[1]} stroke={OL} strokeWidth={0.4} />
      <circle cx={-1} cy={0} r={0.3} fill={MAT.gun[0]} />
      <circle cx={1} cy={0} r={0.3} fill={MAT.gun[0]} />
    </g>
  );
}

/** Service components for a rank: fitted parts plus the cover on the next mount. `skipStep` leaves one step out (for the ceremony). */
function serviceKitGroup(u: string, category: AssetCategory, rank: number, skipStep: number | null, glowStep: number | null = null) {
  const r = lvl(rank);
  return (
    <g data-service={serviceFamily(category)}>
      {seq(r - 1).map((i) => (i + 2 === skipStep ? null : <g key={i}>{hl(i + 2 === glowStep, serviceDraw(u, category, i + 2))}</g>))}
      {r < 10 && skipStep === null ? serviceCover(category, r + 1) : null}
    </g>
  );
}

/** One rank step's service component alone (ceremony drop-in). */
export function ServiceItemGroup({category, step}: {category: AssetCategory; step: number}) {
  const u = useUid();
  return (
    <g>
      <Defs u={u} />
      {serviceDraw(u, category, Math.floor(step))}
    </g>
  );
}

/** The blanking cover a rank step removes (ceremony lift-off). */
export function ServiceCoverGroup({category, step}: {category: AssetCategory; step: number}) {
  return <g>{serviceCover(category, Math.floor(step))}</g>;
}

/** [design, x, y, scale, extra transform] for each package, per category. */
type Place = [Design, number, number, number, string?];
const SKIRT = plates('skirt');
const BELLY = plates('belly');
const FAIRING = plates('fairing');
const KIT: Record<AssetCategory, Record<PackageKey, Place>> = {
  armour: {armament: [launcher, 68, 28, 1.3], protection: [SKIRT, 3, 48, 1.15, 'skewY(47)'], propulsion: [exhaust, 2, 42, 1.3], electronics: [antenna, 50, 17, 1.25]},
  artillery: {armament: [launcher, 74, 44, 1.2], protection: [SKIRT, 5, 66, 1.1, 'skewY(38)'], propulsion: [exhaust, 2, 60, 1.25], electronics: [antenna, 78, 15, 1.2]},
  naval: {armament: [launcher, 64, 38, 1.3], protection: [SKIRT, 20, 70, 1.3, 'skewY(-10)'], propulsion: [exhaust, 8, 48, 1.3], electronics: [antenna, 40, 24, 1.25]},
  rotary: {armament: [pods, 25, 62, 1.3], protection: [BELLY, 38, 66, 1.25, 'skewY(12)'], propulsion: [turbine, 53, 24, 1.25], electronics: [sensor, 89, 50, 1.3]},
  drone: {armament: [hardpoint, 30, 57, 1.3], protection: [FAIRING, 44, 57, 1.15, 'skewY(8)'], propulsion: [turbine, 80, 40, 1.2], electronics: [dome, 72, 46, 1.3]},
  fixed_wing: {armament: [hardpoint, 24, 54, 1.3], protection: [FAIRING, 56, 72, 1.2, 'skewY(12)'], propulsion: [turbine, 24, 32, 1.2], electronics: [sensor, 90, 52, 1.3]},
};

function kitPart(u: string, category: AssetCategory, pkg: PackageKey, level: number) {
  const [design, x, y, s, extra] = (KIT[category] ?? KIT.armour)[pkg];
  const lv = lvl(level);
  const k = lv <= 1 ? s : s * (0.9 + lv * 0.02);
  return <g transform={`translate(${x} ${y}) scale(${k.toFixed(3)}) ${extra ?? ''}`}>{lv <= 1 ? socket() : design(u, lv)}</g>;
}

const CHEV = 'M0 3.4 2.6 1.7 5.2 3.4V1.8L2.6 0 0 1.8Z';
const SHIELD = 'M1.5 0H20.5Q22 0 22 1.5V14.5L11 23 0 14.5V1.5Q0 0 1.5 0Z';

function rankPlate(u: string, rank: number) {
  const r = lvl(rank);
  const tier = r >= 10 ? 3 : r >= 7 ? 2 : r >= 4 ? 1 : 0;
  const body: Mat = (['gun', 'olive', 'dark', 'sand'] as const)[tier];
  const trim = tier === 2 ? AMB : tier === 3 ? '#fff1c9' : MAT.sand[1];
  const cols = Math.ceil(r / 3);
  return (
    <g transform="translate(77 76)">
      {tier === 3 && <circle className="ra-nh" cx={11} cy={10} r={14} fill={`url(#${u}glow)`} />}
      <path d={SHIELD} fill={fill(u, body)} stroke={OL} strokeWidth={0.8} />
      <path d={SHIELD} transform="translate(1.7 1.5) scale(.845)" fill="none" stroke={trim} strokeWidth={0.8} className="ra-nf" />
      <rect x={2.6} y={1.2} width={16.8} height={1.1} rx={0.55} fill="#fff" opacity={0.35} />
      {tier === 3 ? (
        <path d="M11 2.6l1.9 3.9 4.3.6-3.1 3 .7 4.3-3.8-2-3.8 2 .7-4.3-3.1-3 4.3-.6z" fill={AMB} stroke={OL} strokeWidth={0.6} />
      ) : (
        seq(cols).map((c) =>
          seq(Math.min(3, r - c * 3)).map((k) => (
            <path key={`${c}-${k}`} d={CHEV} transform={`translate(${11 - 2.6 + (c - (cols - 1) / 2) * 5.9} ${11.2 - k * 3.2})`} fill={tier === 2 ? AMB : MAT.sand[0]} stroke={OL} strokeWidth={0.45} />
          )),
        )
      )}
      {tier >= 1 && tier < 3 && (
        <>
          {lite(1.6, 15.2, 2.6, 0.8, 0.2)}
          {lite(17.8, 15.2, 2.6, 0.8, 0.2)}
        </>
      )}
      <text x={11} y={20.4} fontSize={r >= 10 ? 4.8 : 5.4} fontWeight={900} textAnchor="middle" fontFamily="system-ui, sans-serif" fill="#fff6e2" stroke={OL} strokeWidth={0.9} paintOrder="stroke">
        {r}
      </text>
    </g>
  );
}

/** Highlight: an amber silhouette copy behind the part, pulsing. */
function hl(on: boolean, part: ReactNode, big = false) {
  return on ? (
    <g>
      <g className={big ? 'ra-hl ra-big' : 'ra-hl'}>{part}</g>
      {part}
    </g>
  ) : (
    part
  );
}

type Hide = PackageKey | 'rank' | null;
type KitProps = {category: AssetCategory; packages: Packages; rank: number; hide?: Hide; highlight?: Hide};

/** All fitted components for an Asset, drawn in the 100x100 box over the hero render. */
export function AssetKitGroup({category, packages, rank, hide = null, highlight = null}: KitProps) {
  const u = useUid();
  return (
    <g>
      <Defs u={u} />
      {PKGS.map((p) => (hide === p ? null : <g key={p}>{hl(highlight === p, kitPart(u, category, p, packages?.[p] ?? 1))}</g>))}
      {serviceKitGroup(u, category, rank, hide === 'rank' ? lvl(rank) : null, highlight === 'rank' ? lvl(rank) : null)}
      {hide !== 'rank' && hl(highlight === 'rank', rankPlate(u, rank))}
    </g>
  );
}

export function AssetKitOverlay({className, style, ...kit}: KitProps & {className?: string; style?: CSSProperties}) {
  return (
    <svg
      viewBox={`0 0 ${KIT_VIEWBOX} ${KIT_VIEWBOX}`}
      className={className}
      style={{position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible', ...style}}
      role="img"
    >
      <title>Fitted kit (temporary prototype art)</title>
      <AssetKitGroup {...kit} />
    </svg>
  );
}

/** One package module alone, same 100x100 coordinates (for the ceremony drop-in). */
export function AssetKitPartGroup({category, pkg, level}: {category: AssetCategory; pkg: PackageKey; level: number}) {
  const u = useUid();
  return (
    <g>
      <Defs u={u} />
      {kitPart(u, category, pkg, level)}
    </g>
  );
}

/** Rank plate: chevron badge bottom-right; rank 10 is the milestone star plate. */
export function RankPlateGroup({rank}: {rank: number}) {
  const u = useUid();
  return (
    <g>
      <Defs u={u} />
      {rankPlate(u, rank)}
    </g>
  );
}

// ── Field Workshop fittings, 512x328 over building-fabrication-shop.webp ───

const S = 1.6; // outline width at building scale

/** L2: gantry crane over the timber yard in front, lifting a crate. */
function gantry(u: string) {
  const leg = (x: number) => (
    <g>
      <path d={`M${x - 10} 312L${x - 2} 222h8L${x + 14} 312z`} fill={fill(u, 'gun')} stroke={OL} strokeWidth={S} />
      <path d={`M${x - 3} 250h10M${x - 6} 280h16`} stroke={OL} strokeWidth={1.4} className="ra-nf" />
      <rect x={x - 7} y={288} width={18} height={14} fill={`url(#${u}hazW)`} stroke={OL} strokeWidth={1.2} />
      {blk(u, x - 16, 306, 36, 10, 'dark', 3, S)}
    </g>
  );
  return (
    <g>
      <path className="ra-nh" d="M300 318H470L480 312H310Z" fill="#000" opacity={0.2} />
      {leg(300)}
      {leg(452)}
      <path d="M284 202H468L476 210H292Z" fill={MAT.sand[0]} stroke={OL} strokeWidth={S} />
      {blk(u, 284, 209, 192, 17, 'sand', 3, S)}
      <rect x={288} y={212} width={26} height={11} fill={`url(#${u}hazW)`} />
      <rect x={446} y={212} width={26} height={11} fill={`url(#${u}hazW)`} />
      {lite(330, 214, 12, 4, 1)}
      {lite(420, 214, 12, 4, 1)}
      <path d="M362 218V252M376 218V252" stroke={OL} strokeWidth={1.6} className="ra-nf" />
      {blk(u, 352, 196, 34, 20, 'gun', 3, S)}
      {lite(360, 202, 18, 4, 1)}
      {blk(u, 354, 248, 30, 9, 'olive', 2, S)}
      <path d="M369 257v5a4 4 0 1 1-6 3" stroke={OL} strokeWidth={2.2} fill="none" className="ra-nf" />
      {blk(u, 344, 266, 50, 24, 'olive', 3, S)}
      <path d="M350 270l38 16M388 270l-38 16" stroke={MAT.olive[2]} strokeWidth={2} className="ra-nf" />
      <rect x={346} y={284} width={46} height={4} fill={`url(#${u}hazW)`} opacity={0.9} />
    </g>
  );
}

/** L3: robot-bay extension on the left roof, floodlight rig on the front edge. */
function roofRig(u: string) {
  const lamps = [132, 196, 256, 316, 372];
  return (
    <g>
      {lamps.map((x) => (
        <path key={x} className="ra-nh" d={`M${x - 6} 228L${x + 6} 228L${x + 30} 312L${x - 30} 312Z`} fill={`url(#${u}cone)`} />
      ))}
      <path d="M52 100H104L110 106V160H52Z" fill={fill(u, 'gun')} stroke={OL} strokeWidth={S} />
      <path d="M60 112H98M60 122H98M60 132H98M60 142H98" stroke={MAT.gun[2]} strokeWidth={2.4} className="ra-nf" />
      {blk(u, 48, 156, 64, 44, 'olive', 3, S)}
      <rect className="ra-nh" x={60} y={166} width={40} height={34} fill={`url(#${u}glow)`} opacity={0.9} />
      <rect x={64} y={170} width={32} height={30} fill="#0c1417" stroke={CY} strokeWidth={3} className="ra-blink" />
      <path d="M67 178H93M67 185H93M67 192H93" stroke={CY} strokeWidth={1.2} opacity={0.45} className="ra-nf" />
      <rect x={50} y={158} width={9} height={40} fill={`url(#${u}hazW)`} stroke={OL} strokeWidth={1} />
      <path d="M104 214H384M104 224H384" stroke={OL} strokeWidth={5} className="ra-nf" />
      <path d="M104 214H384M104 224H384" stroke={MAT.gun[0]} strokeWidth={2.6} className="ra-nf" />
      <path d={`M104 224${seq(14).map((i) => `L${114 + i * 20} ${i % 2 ? 224 : 214}`).join('')}`} stroke={MAT.gun[1]} strokeWidth={1.8} fill="none" className="ra-nf" />
      {blk(u, 98, 204, 10, 26, 'sand', 2, S)}
      {blk(u, 380, 204, 10, 26, 'sand', 2, S)}
      {lamps.map((x) => (
        <g key={x}>
          <path d={`M${x - 8} 216h16l-3 12h-10z`} fill={fill(u, 'dark')} stroke={OL} strokeWidth={S} />
          <rect x={x - 5} y={224} width={10} height={4} rx={2} fill="#eafcff" stroke={CY} strokeWidth={1} className="ra-blink" />
        </g>
      ))}
    </g>
  );
}

/** L4: lattice comms mast with dishes and a power-cell stack beside the chimney. */
function commsMast(u: string) {
  const zig = seq(10)
    .map((i) => {
      const y = 150 - i * 14;
      const half = 15 - i * 1.2;
      return `${i ? 'L' : 'M'}${(i % 2 ? 460 - half : 460 + half).toFixed(1)} ${y}`;
    })
    .join('');
  const frame = `M444 154L456 16M476 154L464 16${zig}`;
  return (
    <g>
      <path className="ra-nh" d="M384 178H486L494 170H392Z" fill="#000" opacity={0.22} />
      <path d={frame} stroke={OL} strokeWidth={5.4} fill="none" strokeLinejoin="round" className="ra-nf" />
      <path d={frame} stroke={MAT.gun[0]} strokeWidth={2.8} fill="none" strokeLinejoin="round" className="ra-nf" />
      <path d="M460 18V0" stroke={OL} strokeWidth={2.4} className="ra-nf" />
      <circle className="ra-nh" cx={460} cy={6} r={12} fill={`url(#${u}glow)`} />
      <circle className="ra-blink" cx={460} cy={6} r={4} fill={CY} stroke={OL} strokeWidth={1.4} />
      <path d="M452 66L440 62M468 104L482 100" stroke={OL} strokeWidth={2.4} className="ra-nf" />
      <ellipse cx={438} cy={62} rx={9} ry={15} fill={fill(u, 'sand')} stroke={OL} strokeWidth={S} />
      <ellipse cx={435} cy={62} rx={4.5} ry={9} fill={MAT.sand[2]} />
      <ellipse cx={484} cy={100} rx={8} ry={13} fill={fill(u, 'gun')} stroke={OL} strokeWidth={S} />
      <ellipse cx={487} cy={100} rx={4} ry={8} fill={MAT.gun[2]} />
      {blk(u, 449, 34, 22, 11, 'olive', 2, 1.4)}
      {lite(453, 38, 14, 3.5, 0.8)}
      {blk(u, 434, 150, 52, 20, 'gun', 3, S)}
      <rect x={439} y={162} width={42} height={5} fill={`url(#${u}hazW)`} />
      <path d="M434 160Q424 172 412 166" stroke={OL} strokeWidth={2.6} fill="none" className="ra-nf" />
      {blk(u, 386, 158, 50, 14, 'dark', 3, S)}
      {[0, 1, 2].map((i) => {
        const x = 390 + i * 15;
        return (
          <g key={i}>
            <rect x={x} y={120} width={13} height={44} rx={4} fill={fill(u, 'gun')} stroke={OL} strokeWidth={S} />
            <ellipse cx={x + 6.5} cy={121} rx={6.5} ry={2.8} fill={MAT.sand[1]} stroke={OL} strokeWidth={1.4} />
            <rect className="ra-blink" x={x + 2} y={134 + i * 6} width={9} height={4} rx={2} fill={CY} stroke={OL} strokeWidth={0.8} />
          </g>
        );
      })}
    </g>
  );
}

const FITTINGS: Record<number, (u: string) => ReactNode> = {2: gantry, 3: roofRig, 4: commsMast};
/** Back to front so the front gantry overlaps the roof rig. */
const FIT_ORDER = [3, 4, 2];

/** All fittings for a workshop level, drawn in 512x328 coordinates over the building image. */
export function WorkshopFittingsGroup({level, hide = null, highlight = null}: {level: number; hide?: number | null; highlight?: number | null}) {
  const u = useUid();
  const lv = Math.floor(Number(level) || 1);
  return (
    <g>
      <Defs u={u} />
      {FIT_ORDER.map((l) => (l > lv || l === hide ? null : <g key={l}>{hl(highlight === l, FITTINGS[l](u), true)}</g>))}
    </g>
  );
}

/** One fitting alone (level 2, 3 or 4), same coordinates. */
export function WorkshopFittingGroup({level}: {level: number}) {
  const u = useUid();
  const draw = FITTINGS[Math.floor(Number(level))];
  return (
    <g>
      <Defs u={u} />
      {draw ? draw(u) : null}
    </g>
  );
}
