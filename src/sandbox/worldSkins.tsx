/**
 * Bases on the World Map, drawn the way the live map draws them: the base
 * SKIN art standing on its plot with the callsign NAMEPLATE along the bottom.
 *
 * Identity (names, starter flags) is shared/skins.ts. The drawing values are
 * a trimmed port of the live presentation, because the sandbox may not import
 * src/live:
 * - src/live/skins.ts PRESENTATION: every starter skin is one 512x640 frame,
 *   overhang 0.25, fill 1.12;
 * - src/live/skinArt.ts drawSkinArt: drawn size x fill wide and
 *   size x (1 + overhang) x fill tall, bottom-anchored to the plot's lower edge,
 *   extra width spilling evenly to both sides;
 * - src/live/WorldMap.tsx drawNameplate: an opaque rounded plate just inside
 *   the plot's bottom edge, font min(13, max(8, size x 0.2)), padding
 *   0.55 x font, height 1.7 x font, lifted size x 0.05, at most size x 1.6
 *   wide, a long name cut from the middle keeping its tail; orange gradient
 *   with a pale rim for your own base, dark gradient for anyone else's.
 * Skins used: the live default starter (circular_shield_bunker) for the
 * practice base and another starter for the mock rival. Never an exclusive.
 */
import {useId} from 'react';
import {SKIN_IDENTITY, STARTER_SKIN_IDS, type SkinId} from '../../shared/skins';

export const SKIN_ART = {frameW: 512, frameH: 640, overhang: 0.25, fill: 1.12} as const;
/** The practice base: the live default skin (STARTER_SKIN_IDS[0]). */
export const PRACTICE_SKIN: SkinId = STARTER_SKIN_IDS[0];
/** The mock rival: a different starter, so it never reads as the player's own base. */
export const RIVAL_SKIN: SkinId = STARTER_SKIN_IDS.includes('desert_command_citadel') ? 'desert_command_citadel' : STARTER_SKIN_IDS[1];

export function skinSrc(id: SkinId): string {
  return `/skins/${id}.webp`;
}

/** Approximate width of 600-weight UI sans text, for the plate budget (the canvas measures; SVG cannot before layout). */
function textWidth(text: string, font: number): number {
  let w = 0;
  for (const ch of text) w += /[A-Z0-9MW]/.test(ch) ? font * 0.64 : /[il.,'| ]/.test(ch) ? font * 0.3 : font * 0.53;
  return w;
}

/** The live nameplate's cut: one size down first, then from the middle, keeping the tail. */
export function plateLabel(name: string, size: number): {label: string; font: number} {
  const font = Math.min(13, Math.max(8, size * 0.2));
  const padX = font * 0.55;
  const budget = Math.max(0, size * 1.6 - padX * 2);
  if (textWidth(name, font) <= budget) return {label: name, font};
  const smaller = Math.max(8, Math.floor(font * 0.85));
  if (textWidth(name, smaller) <= budget) return {label: name, font: smaller};
  const tailMatch = /\d{3,}$/.exec(name);
  const tail = tailMatch ? tailMatch[0].slice(-6) : name.slice(-4);
  let head = name.slice(0, name.length - tail.length);
  while (head.length > 0 && textWidth(`${head}…${tail}`, font) > budget) head = head.slice(0, -1);
  return {label: head.length > 0 ? `${head}…${tail}` : `…${tail}`, font};
}

/**
 * One base: skin art bottom-anchored on a plot whose lower edge is `footY`,
 * centred on `cx`, `size` map units square, with its nameplate.
 */
export function SkinBase({skin, cx, footY, size, name, isYou, part = 'both'}: {skin: SkinId; cx: number; footY: number; size: number; name: string; isYou: boolean; part?: 'art' | 'plate' | 'both'}) {
  const gid = useId().replace(/:/g, '');
  const drawW = size * SKIN_ART.fill;
  const drawH = size * (1 + SKIN_ART.overhang) * SKIN_ART.fill;
  const {label, font} = plateLabel(name, size);
  const padX = font * 0.55;
  const boxH = font * 1.7;
  const boxW = Math.min(size * 1.6, textWidth(label, font) + padX * 2);
  const boxX = cx - boxW / 2;
  const boxY = footY - boxH - size * 0.05;
  const r = boxH / 2;
  return (
    <g data-skin={part === 'plate' ? undefined : skin} data-nameplate={part === 'art' ? undefined : name}>
      {part !== 'plate' && <title>{`${name} · ${SKIN_IDENTITY[skin].name}`}</title>}
      {part !== 'plate' && <image href={skinSrc(skin)} x={cx - drawW / 2} y={footY - drawH} width={drawW} height={drawH} preserveAspectRatio="none" />}
      {part !== 'art' && (
      <>
      <defs>
        <linearGradient id={`plate-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={isYou ? '#f97316' : '#2c2e2c'} />
          <stop offset="1" stopColor={isYou ? '#9a3412' : '#111311'} />
        </linearGradient>
        <filter id={`plate-shadow-${gid}`} x="-30%" y="-60%" width="160%" height="260%">
          <feDropShadow dx="0" dy={Math.max(1, font * 0.12)} stdDeviation={Math.max(2, font * 0.35)} floodColor="#000" floodOpacity="0.85" />
        </filter>
      </defs>
      <rect x={boxX} y={boxY} width={boxW} height={boxH} rx={r} fill={`url(#plate-${gid})`} filter={`url(#plate-shadow-${gid})`} />
      <rect x={boxX + 0.5} y={boxY + 0.5} width={boxW - 1} height={boxH - 1} rx={r} fill="none" stroke={isYou ? '#ffd0a8' : 'rgba(255,255,255,0.45)'} strokeWidth="1" />
      <path d={`M${boxX + r} ${boxY + 1} H${boxX + boxW - r}`} stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
      <text x={boxX + padX} y={boxY + boxH / 2} dominantBaseline="central" fontSize={font} fontWeight="600" fill={isYou ? '#fff7ed' : '#e9eae8'} style={{fontFamily: 'ui-sans-serif, system-ui, sans-serif'}} data-plate-text>
        {label}
      </text>
      </>
      )}
    </g>
  );
}
