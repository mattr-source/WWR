/**
 * The World Map ground for the sandbox: the live game's Season 1 terrain,
 * painted the way the live World Map paints it.
 *
 * The generator is the real one and is imported from shared/ (`groundAt`,
 * `propsInPlot`, the prop atlas frames) - the same deterministic Dry Basin
 * every player sees. The per-pixel painting (palette, lit height field, salt
 * cracks, wadis, props with contact shadows) is a trimmed port of
 * src/live/terrainPaint.ts: the sandbox may not import src/live, so the
 * presentation arithmetic is copied, not the module. Nothing here touches
 * the network; the atlas is a static image from public/.
 */
import {BANDS, type Ground, TERRAIN_VERSION, between, fbm, groundAt, legacyTerrainSeed} from '../../shared/terrain';
import {PROP_ATLAS_SRC, PROP_FRAMES} from '../../shared/terrainAtlas';
import {propsInPlot} from '../../shared/terrainProps';

/** The live world's size in plots each way from the centre (WorldMap.tsx default). */
export const WORLD_EXTENT = 200;
/** Practice world id for the seed. A fixed, honest stand-in: the sandbox has no server world. */
export const SANDBOX_WORLD_ID = 1;
export const SANDBOX_SEASON = 1;
/** Where the practice home base stands, in world plots: out on the sand band, near salt flats. */
export const HOME_PLOT = {x: 34, y: 22};
/** Map units (the 360 x 600 sector viewBox) per plot. About the live map's home zoom on a phone. */
export const UNITS_PER_PLOT = 45;
/** The home plot's centre in the sector viewBox (where the Task Force parks). */
export const HOME_ANCHOR = {x: 180, y: 462};

const seed = legacyTerrainSeed(SANDBOX_WORLD_ID, SANDBOX_SEASON);

/** Sector viewBox units to world plots. */
export function toPlot(vx: number, vy: number): {x: number; y: number} {
  return {x: HOME_PLOT.x + 0.5 + (vx - HOME_ANCHOR.x) / UNITS_PER_PLOT, y: HOME_PLOT.y + 0.5 + (vy - HOME_ANCHOR.y) / UNITS_PER_PLOT};
}

// Palette and lighting from src/live/terrainPaint.ts (Season 1, The Dry Basin).
const P = {
  salt: [227, 221, 201],
  saltCrack: [199, 191, 169],
  hardpan: [210, 193, 156],
  sand: [198, 172, 126],
  wadi: [154, 130, 89],
  wadiDeep: [122, 103, 70],
  scrub: [154, 150, 104],
  stone: [176, 138, 96],
} as const;
const LIGHT_X = -0.62;
const LIGHT_Y = -0.78;

function fbm4(x: number, y: number, s: number): number {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < 4; i += 1) {
    v += fbm(x * f, y * f, s + i * 131) * amp;
    f *= 2.07;
    amp *= 0.5;
  }
  return v / 0.9375;
}

function heightAt(x: number, y: number, detail: number): number {
  const rolling = fbm4(x * 0.022, y * 0.022, seed + 51);
  const dune = fbm(x * 0.09, y * 0.09, seed + 77) * 0.28;
  const grain = fbm4(x * 0.55, y * 0.55, seed + 909) * 0.055;
  const distance = Math.sqrt(x * x + y * y) / WORLD_EXTENT;
  const warp = (fbm(x * 0.035, y * 0.035, seed) - 0.5) * 0.22;
  const banded = distance + warp;
  const rockAmt = between(BANDS.middle - 0.12, BANDS.middle + 0.06, banded);
  const terrace = Math.floor(fbm(x * 0.05, y * 0.05, seed + 17) * 6) / 6;
  const shelf = terrace * rockAmt * 0.55;
  const river = Math.abs(fbm(x * 0.045, y * 0.045, seed + 3301) - 0.5);
  const channel = between(0.055, 0.012, river) * (banded > BANDS.inner * 0.6 ? 1 : 0.2);
  const micro = fbm4(x * 2.4, y * 2.4, seed + 1212) * 0.075 * detail;
  return rolling * 0.5 + dune + shelf + grain + micro - channel * 0.3;
}

/** One ground colour at a world point, lit. */
export function groundColour(wx: number, wy: number, zoom: number): [number, number, number] {
  const g: Ground = groundAt(seed, WORLD_EXTENT, wx, wy);
  const grain = fbm4(wx * 0.7, wy * 0.7, seed + 611);
  let tot = 0.22;
  let r = (P.hardpan[0] + (grain - 0.5) * 18) * 0.22;
  let gr = (P.hardpan[1] + (grain - 0.5) * 16) * 0.22;
  let b = (P.hardpan[2] + (grain - 0.5) * 14) * 0.22;
  const mix = (col: readonly number[], w: number) => {
    r += col[0] * w;
    gr += col[1] * w;
    b += col[2] * w;
    tot += w;
  };
  mix(P.salt, g.salt);
  mix(P.stone, g.rock);
  mix(P.scrub, g.scrub);
  mix(P.sand, g.sand);
  r /= tot;
  gr /= tot;
  b /= tot;
  if (g.wadi > 0.001) {
    const t = g.wadi;
    r = r * (1 - t) + P.wadi[0] * t;
    gr = gr * (1 - t) + P.wadi[1] * t;
    b = b * (1 - t) + P.wadi[2] * t;
    const deep = between(0.55, 1, t) * 0.6;
    r = r * (1 - deep) + P.wadiDeep[0] * deep;
    gr = gr * (1 - deep) + P.wadiDeep[1] * deep;
    b = b * (1 - deep) + P.wadiDeep[2] * deep;
  }
  const crackAmt = between(30, 85, zoom);
  if (g.salt > 0.25 && crackAmt > 0) {
    const cr = Math.abs(fbm(wx * 5.5, wy * 5.5, seed + 4242) - 0.5);
    const crack = between(0.03, 0.006, cr) * g.salt * crackAmt * 0.6;
    r = r * (1 - crack) + P.saltCrack[0] * crack;
    gr = gr * (1 - crack) + P.saltCrack[1] * crack;
    b = b * (1 - crack) + P.saltCrack[2] * crack;
  }
  const detail = between(30, 90, zoom);
  const eps = Math.max(0.012, 1.1 / zoom);
  const hC = heightAt(wx, wy, detail);
  const gx = (heightAt(wx + eps, wy, detail) - hC) / eps;
  const gy = (heightAt(wx, wy + eps, detail) - hC) / eps;
  const lam = Math.max(0.52, Math.min(1.48, 1 + (gx * LIGHT_X + gy * LIGHT_Y) * 0.55));
  const ao = 1 - Math.max(0, Math.min(1, (0.34 - hC) * 0.5));
  const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
  return [clamp(r * lam * ao), clamp(gr * lam * ao), clamp(b * lam * ao)];
}

let atlas: HTMLImageElement | null = null;
function loadAtlas(): Promise<HTMLImageElement> {
  if (!atlas) {
    atlas = new Image();
    atlas.decoding = 'async';
    atlas.src = PROP_ATLAS_SRC;
  }
  const img = atlas;
  return img.complete && img.naturalWidth ? Promise.resolve(img) : new Promise((ok) => img.addEventListener('load', () => ok(img), {once: true}));
}

export interface GroundView {
  /** Canvas size in CSS pixels. */
  w: number;
  h: number;
  /** Screen pixels per sector viewBox unit, and the viewBox origin on screen (the SVG's "meet" fit). */
  scale: number;
  ox: number;
  oy: number;
  /** Plots that must stay clear of props (targets, the base, the route). */
  clear: ReadonlySet<string>;
  /** Sector positions no prop may stand near (targets, the base, the Task Force), and how near, in viewBox units. */
  avoid?: ReadonlyArray<{x: number; y: number}>;
  avoidRadius?: number;
}

/** Paint the ground (and, once the atlas is in, the props) into a canvas. Returns when both are done. */
export async function paintWorldGround(canvas: HTMLCanvasElement, v: GroundView, isStale: () => boolean): Promise<void> {
  const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
  canvas.width = Math.round(v.w * dpr);
  canvas.height = Math.round(v.h * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const zoom = v.scale * UNITS_PER_PLOT; // screen px per plot
  const worldAt = (sx: number, sy: number) => toPlot((sx - v.ox) / v.scale, (sy - v.oy) / v.scale);

  // Ground at a quarter of the CSS resolution, smoothed up: soft terrain, cheap on a phone.
  const step = 4;
  const iw = Math.ceil(v.w / step);
  const ih = Math.ceil(v.h / step);
  const img = ctx.createImageData(iw, ih);
  for (let j = 0; j < ih; j += 1) {
    for (let i = 0; i < iw; i += 1) {
      const p = worldAt(i * step + step / 2, j * step + step / 2);
      const [r, g, b] = groundColour(p.x, p.y, zoom);
      const o = (j * iw + i) * 4;
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = b;
      img.data[o + 3] = 255;
    }
  }
  const scratch = document.createElement('canvas');
  scratch.width = iw;
  scratch.height = ih;
  scratch.getContext('2d')?.putImageData(img, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(scratch, 0, 0, iw, ih, 0, 0, iw * step, ih * step);
  if (isStale()) return;

  const sheet = await loadAtlas();
  if (isStale()) return;
  const tl = worldAt(0, 0);
  const br = worldAt(v.w, v.h);
  const sx = (px: number) => v.ox + (HOME_ANCHOR.x + (px - HOME_PLOT.x - 0.5) * UNITS_PER_PLOT) * v.scale;
  const sy = (py: number) => v.oy + (HOME_ANCHOR.y + (py - HOME_PLOT.y - 0.5) * UNITS_PER_PLOT) * v.scale;
  for (let py = Math.floor(tl.y) - 1; py <= Math.ceil(br.y) + 1; py += 1) {
    for (let px = Math.floor(tl.x) - 1; px <= Math.ceil(br.x) + 1; px += 1) {
      if (v.clear.has(`${px},${py}`)) continue;
      for (const item of propsInPlot(seed, TERRAIN_VERSION, WORLD_EXTENT, px, py)) {
        const frame = PROP_FRAMES[item.prop.id];
        if (!frame) continue;
        const width = item.prop.span * zoom;
        const height = (width * frame.h) / frame.w;
        const gx = sx(item.px + item.ox);
        const gy = sy(item.py + item.oy);
        if (v.avoid && v.avoidRadius) {
          const ux = (gx - v.ox) / v.scale;
          const uy = (gy - v.oy) / v.scale;
          const r = v.avoidRadius + (item.prop.span * UNITS_PER_PLOT) / 2;
          if (v.avoid.some((pt) => (pt.x - ux) ** 2 + (pt.y - uy) ** 2 < r * r)) continue;
        }
        const dx = gx - width * item.prop.anchor.x;
        const dy = gy - height * item.prop.anchor.y;
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = '#3c2d1c';
        ctx.beginPath();
        ctx.ellipse(gx + width * 0.06, gy, width * 0.34, width * 0.1, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        if (item.flip) {
          ctx.save();
          ctx.translate(dx + width, dy);
          ctx.scale(-1, 1);
          ctx.drawImage(sheet, frame.x, frame.y, frame.w, frame.h, 0, 0, width, height);
          ctx.restore();
        } else {
          ctx.drawImage(sheet, frame.x, frame.y, frame.w, frame.h, dx, dy, width, height);
        }
      }
    }
  }
  ctx.globalAlpha = 1;
}

/** The plots a set of sector positions stand on, with a margin, so no rock is painted under a target. */
export function clearPlots(points: Array<{x: number; y: number}>, margin = 1): Set<string> {
  const out = new Set<string>();
  for (const pt of points) {
    const p = toPlot(pt.x, pt.y);
    const fx = Math.floor(p.x);
    const fy = Math.floor(p.y);
    for (let dx = -margin; dx <= margin; dx += 1) for (let dy = -margin; dy <= margin; dy += 1) out.add(`${fx + dx},${fy + dy}`);
  }
  return out;
}
