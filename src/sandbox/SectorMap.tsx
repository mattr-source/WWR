/**
 * The sector map: where the whole Field Sandbox loop is seen happening.
 *
 * The base sits at the bottom, today's targets across the salt flats. A
 * Task Force - its starter Assets with the humanoid robot troops in front -
 * marches out along its route, forms up on a friendly ring against the
 * target's red reticle, and fights the rounds the engine resolved (beats.ts):
 * shells and rounds from the units that really fired, the Dominion answering,
 * wrecks and knock-outs exactly as they happened. Then the column turns for
 * home, damaged Assets smoking or on fire.
 *
 * Art: Asset heroes are the game's own renders (shared/assetVisuals.ts), the
 * base is Matt's building art, ground props come from the live terrain atlas,
 * the convoy exercise uses the Alliance Convoy truck. Robots and Dominion
 * machines are temporary vector art (RobotFigure.tsx), labelled as such.
 */
import {type CSSProperties, type ReactNode, memo} from 'react';
import {convoyTruckUrl} from '../../shared/allianceConvoyVisuals';
import {assetArtUrl} from '../../shared/assetVisuals';
import {
  BASE_AT,
  type Enemy,
  type Role,
  type SandboxState,
  type Site,
  type TaskAsset,
  assetOf,
  type UnitRef,
  assetStats,
  findSite,
  partsAt,
  robotStats,
  sandboxDay,
  siteEnemies,
  siteLabel,
  sitesFor,
} from '../../shared/sandbox';
import {PROP_ATLAS_H, PROP_ATLAS_SRC, PROP_ATLAS_W, PROP_FRAMES} from '../../shared/terrainAtlas';
import {type BattleFrame, type Fx, type FxRef, battleFrame} from './beats';
import {DominionFigureGroup, FIGURE_VIEWBOX, DOMINION_VIEWBOX, RobotFigureGroup} from './RobotFigure';
import {AssetKitGroup, KIT_VIEWBOX, WORKSHOP_VIEWBOX, WorkshopFittingsGroup} from './RefitArt';

export const VIEW_W = 360;
export const VIEW_H = 600;

type Pt = {x: number; y: number};

/** Where the Task Force parks at home, in front of the base buildings. */
const PARK: Pt = {x: 180, y: 462};
const ASSET_SIZE = 50;
const ROBOT_H = 36;

/* -------------------------------------------------------------------------- */
/* Ground                                                                     */
/* -------------------------------------------------------------------------- */

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

const CRACKS = (() => {
  const r = stream(2207);
  return Array.from({length: 34}, () => {
    let x = -60 + r() * 480;
    let y = -20 + r() * 640;
    let d = `M${x.toFixed(0)} ${y.toFixed(0)}`;
    for (let s = 0; s < 3 + Math.floor(r() * 3); s += 1) {
      x += (r() - 0.5) * 50;
      y += (r() - 0.4) * 30;
      d += ` L${x.toFixed(0)} ${y.toFixed(0)}`;
    }
    return d;
  });
})();

/** Terrain props from the live atlas, placed clear of targets, routes and the base. */
const PROPS: Array<{name: string; x: number; y: number; w: number}> = [
  {name: 'boulder_cluster_a', x: 336, y: 180, w: 58},
  {name: 'thorn_brush_a', x: 22, y: 232, w: 44},
  {name: 'dry_grass_a', x: 240, y: 96, w: 46},
  {name: 'scrap_pile_b', x: 336, y: 486, w: 52},
  {name: 'hardy_tree_c', x: 18, y: 430, w: 50},
  {name: 'sandstone_shelf_b', x: 118, y: 62, w: 70},
  {name: 'thorn_brush_c', x: 214, y: 330, w: 38},
  {name: 'dry_grass_b', x: 350, y: 372, w: 44},
  {name: 'boulder_cluster_a', x: 30, y: 590, w: 50},
];

function Prop({name, x, y, w, opacity = 1}: {name: string; x: number; y: number; w: number; opacity?: number}) {
  const f = PROP_FRAMES[name];
  if (!f) return null;
  const h = (w * f.h) / f.w;
  return (
    <g opacity={opacity}>
      <ellipse cx={x} cy={y - 2} rx={w * 0.42} ry={w * 0.1} fill="#3a2f20" opacity="0.22" />
      <svg x={x - w / 2} y={y - h} width={w} height={h} viewBox={`${f.x} ${f.y} ${f.w} ${f.h}`} overflow="hidden">
        <image href={PROP_ATLAS_SRC} width={PROP_ATLAS_W} height={PROP_ATLAS_H} />
      </svg>
    </g>
  );
}

const Ground = memo(function Ground() {
  return (
    <g aria-hidden="true">
      <defs>
        <radialGradient id="sm-ground" cx="0.5" cy="0.55" r="0.8">
          <stop offset="0" stopColor="#d9cdae" />
          <stop offset="0.7" stopColor="#c7b894" />
          <stop offset="1" stopColor="#a8986f" />
        </radialGradient>
        <filter id="sm-dim">
          <feColorMatrix type="matrix" values="0.45 0 0 0 0.02  0 0.42 0 0 0.01  0 0 0.4 0 0  0 0 0 1 0" />
        </filter>
        <filter id="sm-scorch">
          <feColorMatrix type="matrix" values="0.75 0.1 0 0 0.02  0 0.65 0 0 0  0 0 0.6 0 0  0 0 0 1 0" />
        </filter>
      </defs>
      <rect x="-400" y="-200" width="1160" height="1000" fill="url(#sm-ground)" />
      <g stroke="#ad9f80" strokeWidth="1" fill="none" opacity="0.45">
        {CRACKS.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      {PROPS.map((p, i) => (
        <g key={i}>
          <Prop {...p} />
        </g>
      ))}
    </g>
  );
});

/* -------------------------------------------------------------------------- */
/* Base                                                                       */
/* -------------------------------------------------------------------------- */

const Base = memo(function Base({workshopLevel, busy}: {workshopLevel: number; busy: boolean}) {
  const sx = 132 / WORKSHOP_VIEWBOX.width;
  const sy = 85 / WORKSHOP_VIEWBOX.height;
  return (
    <g aria-hidden="true">
      <ellipse cx={BASE_AT.x} cy={560} rx={170} ry={46} fill="#8f8163" opacity="0.35" />
      {/* Matt's base building art (shared/base.ts). */}
      <image href="/base/building-fabrication-shop.webp" x={52} y={496} width={132} height={85} />
      {/* Every Workshop level-up leaves its fitting on the building (temporary prototype art). */}
      <g transform={`translate(52 496) scale(${sx} ${sy})`}>
        <WorkshopFittingsGroup level={workshopLevel} />
      </g>
      <image href="/base/building-recovery-yard.webp" x={190} y={500} width={124} height={80} />
      {busy && (
        <g className="sbx-weld">
          <path d="M112 548 l-8 -6 M116 544 l2 -10 M120 548 l9 -5" stroke="#ffe08a" strokeWidth="2" strokeLinecap="round" />
        </g>
      )}
      <Chip x={118} y={582} text={`ROBOT BAY · WORKSHOP LV ${workshopLevel}`} tone="#f5d28a" />
      <Chip x={254} y={582} text="REPAIR YARD" tone="#cfe8d6" />
    </g>
  );
});

/* -------------------------------------------------------------------------- */
/* Pieces                                                                     */
/* -------------------------------------------------------------------------- */

function Chip({x, y, text, tone, bg = '#15110c'}: {x: number; y: number; text: string; tone: string; bg?: string}) {
  const w = text.length * 5.6 + 12;
  return (
    <g>
      <rect x={x - w / 2} y={y} width={w} height={15} rx={7.5} fill={bg} opacity="0.86" />
      <text x={x} y={y + 11} textAnchor="middle" fontSize="9.5" fontWeight="700" fill={tone} style={{letterSpacing: '0.04em'}}>
        {text}
      </text>
    </g>
  );
}

function HpBar({x, y, w, value, max, tone}: {x: number; y: number; w: number; value: number; max: number; tone: string}) {
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  return (
    <g>
      <rect x={x - w / 2 - 1} y={y - 1} width={w + 2} height={5} rx={2} fill="#1b1712" opacity="0.85" />
      <rect x={x - w / 2} y={y} width={w * pct} height={3} rx={1.5} fill={tone} />
    </g>
  );
}

/** Smoke and fire on a damaged Asset: more of both the worse it is. */
function Damage({share, x, y, heavy}: {share: number; x: number; y: number; heavy?: boolean}) {
  if (share >= 1) return null;
  const fire = share < 0.5 || heavy;
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      <g className="sbx-smoke">
        <circle cx="-4" cy="-10" r={fire ? 9 : 6} fill="#3d372f" opacity="0.55" />
        <circle cx="6" cy="-22" r={fire ? 8 : 5} fill="#57504a" opacity="0.4" />
        {fire && <circle cx="-2" cy="-34" r="7" fill="#6b645c" opacity="0.3" />}
      </g>
      {fire && (
        <g className="sbx-flame">
          <path d="M-7 0 C-9 -8 -3 -10 -2 -18 C2 -11 8 -9 6 0 Z" fill="#ff8a2a" />
          <path d="M-3 0 C-4 -5 -1 -7 0 -12 C2 -7 4 -5 3 0 Z" fill="#ffd86b" />
        </g>
      )}
    </g>
  );
}

function AssetSprite({held, x, y, share, disabled, mirror, motion}: {held: TaskAsset; x: number; y: number; share: number; disabled: boolean; mirror: boolean; motion?: ReactNode}) {
  const url = assetArtUrl(held.assetId, held.rank);
  const category = assetOf(held.assetId)?.category;
  const s = ASSET_SIZE;
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="-2" rx={s * 0.42} ry={s * 0.12} fill="#2d2418" opacity="0.3" />
      <g transform={mirror ? 'scale(-1 1)' : undefined}>
        {motion}
        {url && <image href={url} x={-s / 2} y={-s * 0.9} width={s} height={s} filter={disabled ? 'url(#sm-dim)' : share < 0.5 ? 'url(#sm-scorch)' : undefined} />}
        {/* The fitted kit stays on the Asset out on the map too (temporary prototype art). */}
        {category && (
          <g data-kit="1" transform={`translate(${-s / 2} ${-s * 0.9}) scale(${s / KIT_VIEWBOX})`}>
            <AssetKitGroup category={category} packages={held.packages} rank={held.rank} detail="map" />
          </g>
        )}
      </g>
      <Damage share={share} x={4} y={-s * 0.45} heavy={disabled} />
    </g>
  );
}

function RobotSprite({state, role, x, y, status, mirror}: {state: SandboxState; role: Role; x: number; y: number; status: string; mirror: boolean}) {
  const k = ROBOT_H / FIGURE_VIEWBOX.height;
  const w = FIGURE_VIEWBOX.width * k;
  const figureStatus = status === 'destroyed' ? 'destroyed' : status === 'disabled' ? 'disabled' : 'ready';
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="-1" rx={w * 0.34} ry={3.5} fill="#2d2418" opacity="0.3" />
      <g transform={`translate(${-w / 2} ${-ROBOT_H}) scale(${k})`}>
        <RobotFigureGroup role={role} parts={partsAt(state.robots[role].level)} status={figureStatus} mirror={mirror} />
      </g>
    </g>
  );
}

function EnemySprite({kind, x, y, dead, mirror}: {kind: Enemy['kind']; x: number; y: number; dead: boolean; mirror?: boolean}) {
  // Same scale as the robot troops: a Walker stands several troopers tall.
  const vb = DOMINION_VIEWBOX[kind];
  const k = ROBOT_H / FIGURE_VIEWBOX.height;
  const h = vb.height * k;
  const w = vb.width * k;
  return (
    <g transform={`translate(${x} ${y})`} className={dead ? 'sbx-wreck-fade' : undefined}>
      <ellipse cx="0" cy="-1" rx={w * 0.4} ry={4} fill="#2d2418" opacity="0.3" />
      <g transform={`translate(${-w / 2} ${-h}) scale(${k})`}>
        <DominionFigureGroup kind={kind} status={dead ? 'destroyed' : 'ready'} mirror={mirror} />
      </g>
    </g>
  );
}

/* -------------------------------------------------------------------------- */
/* Geometry                                                                   */
/* -------------------------------------------------------------------------- */

const lerp = (a: Pt, b: Pt, t: number): Pt => ({x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t});

/** Where a Task Force forms up to attack or hold a site: short of it, on the side it came from. */
export function stagingPoint(site: Pt): Pt {
  const dx = site.x - PARK.x;
  const dy = site.y - PARK.y;
  const d = Math.hypot(dx, dy) || 1;
  return {x: site.x - (dx / d) * 64, y: site.y - (dy / d) * 64 + 18};
}

interface Formation {
  robots: Array<{role: Role; at: Pt}>;
  assets: Array<{assetId: string; at: Pt}>;
}

/** Robots in front, Assets behind them, across the direction of travel. */
function formation(center: Pt, toward: Pt, robots: Role[], assets: string[]): Formation {
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  const d = Math.hypot(dx, dy) || 1;
  const fx = dx / d;
  const fy = dy / d;
  const px = -fy;
  const py = fx;
  return {
    robots: robots.map((role, i) => {
      const o = (i - (robots.length - 1) / 2) * 24;
      return {role, at: {x: center.x + px * o + fx * 16, y: center.y + py * o * 0.55 + fy * 16 + 6}};
    }),
    assets: assets.map((assetId, i) => {
      const o = (i - (assets.length - 1) / 2) * 44;
      return {assetId, at: {x: center.x + px * o - fx * 20, y: center.y + py * o * 0.55 - fy * 20 + 8}};
    }),
  };
}

function enemyLayout(site: Pt, enemies: Enemy[]): Record<string, Pt> {
  const out: Record<string, Pt> = {};
  const n = enemies.length;
  enemies.forEach((e, i) => {
    const o = (i - (n - 1) / 2) * 30;
    out[e.id] = {x: site.x + o, y: site.y + 10 + (i % 2) * 8 - (e.kind === 'walker' ? 6 : 0)};
  });
  return out;
}

/* -------------------------------------------------------------------------- */
/* Map                                                                        */
/* -------------------------------------------------------------------------- */

const SITE_PROP: Partial<Record<string, {prop?: string; image?: string; w: number}>> = {
  signal_relay: {prop: 'power_pylon_a', w: 26},
  fuel_silo: {prop: 'fuel_drums_a', w: 46},
  abandoned_convoy: {image: convoyTruckUrl(1), w: 58},
  factory_probe: {prop: 'rusted_pipe_run_a', w: 60},
  disabled_mech_patrol: {prop: 'scrap_pile_a', w: 50},
};

export interface SectorMapProps {
  state: SandboxState;
  now: number;
  roundMs: number;
  selectedSite: string | null;
  pulseSite: string | null;
  onSelectSite: (siteId: string) => void;
  onBaseTap: () => void;
}

export default function SectorMap({state, now, roundMs, selectedSite, pulseSite, onSelectSite, onBaseTap}: SectorMapProps) {
  const day = sandboxDay(state, now);
  const sites = sitesFor(state, day);
  const m = state.march;
  const marchSite = m ? findSite(state, m.siteId) : null;
  const e = state.encounter && m && state.encounter.marchId === m.id ? state.encounter : null;
  const frame: BattleFrame | null = e && m?.phase === 'engaged' ? battleFrame(e, now, roundMs) : null;
  const upgrading = Object.values(state.robots).some((r) => r.status === 'upgrading') || !!state.workshop.job;

  // Units at home (not on the march).
  const homeRobots = (Object.keys(state.robots) as Role[]).filter((r) => !m || !m.robots.includes(r));
  const homeAssets = state.assets.filter((a) => !m || !m.assets.includes(a.assetId)).map((a) => a.assetId);

  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full select-none" style={{overflow: 'visible'}} role="img" aria-label="Sector map">
      <Ground />

      {/* The route out and back. */}
      {m && marchSite && (
        <line
          className={m.phase === 'returning' ? undefined : 'sm-route'}
          x1={PARK.x}
          y1={PARK.y}
          x2={stagingPoint(marchSite).x}
          y2={stagingPoint(marchSite).y}
          stroke={m.phase === 'returning' ? '#6b7280' : '#f97316'}
          strokeWidth="2.5"
          strokeDasharray="7 6"
          opacity={m.phase === 'returning' ? 0.5 : 0.8}
        />
      )}

      <g onClick={onBaseTap} style={{cursor: 'pointer'}} role="button" aria-label="Open the Robot Bay">
        <Base workshopLevel={state.workshop.level} busy={upgrading} />
      </g>

      {/* Today's targets. */}
      {sites.map((site) => (
        <g key={site.id}>
          <SiteMarker
            state={state}
            site={site}
            selected={selectedSite === site.id}
            pulse={pulseSite === site.id}
            engaged={!!frame && marchSite?.id === site.id}
            onSelect={() => onSelectSite(site.id)}
          />
        </g>
      ))}

      {/* The Task Force at home. */}
      <HomeCluster state={state} robots={homeRobots} assets={homeAssets} />

      {/* The Task Force out on the map. */}
      {m && marchSite && <Column state={state} now={now} site={marchSite} frame={frame} />}

      {/* Battle effects for the round now playing. */}
      {frame && e && marchSite && (
        <g key={`${e.id}-${frame.round}`}>
          <Effects frame={frame} state={state} site={marchSite} />
        </g>
      )}
    </svg>
  );
}

function SiteMarker({state, site, selected, pulse, engaged, onSelect}: {state: SandboxState; site: Site; selected: boolean; pulse: boolean; engaged: boolean; onSelect: () => void}) {
  const done = state.cleared.includes(site.id);
  const art = SITE_PROP[site.kind];
  const enemies = site.battle && !engaged ? siteEnemies(site, state) : [];
  const layout = enemyLayout(site, enemies);
  const label = `${siteLabel(site.kind)}${done ? ' ✓' : ''}`;
  return (
    <g onClick={onSelect} style={{cursor: 'pointer'}} role="button" aria-label={`${siteLabel(site.kind)}${done ? ', done today' : ''}`} opacity={done ? 0.6 : 1}>
      <circle cx={site.x} cy={site.y} r="40" fill="transparent" />
      {site.battle ? (
        <g className={engaged ? 'sm-reticle-live' : undefined}>
          <ellipse cx={site.x} cy={site.y + 12} rx="46" ry="17" fill="#e5483a" opacity="0.12" stroke="#e5483a" strokeWidth="2" strokeDasharray="10 6" />
          <path d={`M${site.x - 50} ${site.y + 12} h8 M${site.x + 42} ${site.y + 12} h8 M${site.x} ${site.y - 8} v6 M${site.x} ${site.y + 26} v6`} stroke="#e5483a" strokeWidth="3" />
        </g>
      ) : (
        <ellipse cx={site.x} cy={site.y + 12} rx="36" ry="13" fill="#f5d28a" opacity="0.14" stroke="#e0b25a" strokeWidth="1.5" strokeDasharray="4 4" />
      )}
      {(selected || pulse) && <ellipse className="sbx-pulse" cx={site.x} cy={site.y + 12} rx="54" ry="21" fill="none" stroke="#67e8f9" strokeWidth="3" />}
      {site.kind === 'rival_base' && (
        <g>
          <image href="/base/building-garrison-barracks.webp" x={site.x - 48} y={site.y - 58} width={96} height={62} />
          <path d={`M${site.x + 36} ${site.y - 54} v-22`} stroke="#2a2618" strokeWidth="2" />
          <path d={`M${site.x + 36} ${site.y - 76} h16 l-4 5 l4 5 h-16 Z`} fill="#b91c1c" />
        </g>
      )}
      {art?.prop && <Prop name={art.prop} x={site.x + (site.battle ? 30 : 0)} y={site.y + 14} w={art.w} />}
      {art?.image && <image href={art.image} x={site.x - art.w / 2} y={site.y - art.w * 0.55} width={art.w} height={art.w} />}
      {enemies.slice(0, 4).map((x) => (
        <g key={x.id}>
          <EnemySprite kind={x.kind} x={layout[x.id].x} y={layout[x.id].y} dead={false} />
        </g>
      ))}
      <Chip x={site.x} y={site.y + 32} text={label} tone={site.battle ? '#ffb4a8' : '#f5d28a'} />
    </g>
  );
}

function HomeCluster({state, robots, assets}: {state: SandboxState; robots: Role[]; assets: string[]}) {
  const f = formation(PARK, {x: PARK.x, y: PARK.y - 100}, robots, assets);
  return (
    <g pointerEvents="none">
      {f.assets.map(({assetId, at}) => {
        const a = state.assets.find((x) => x.assetId === assetId)!;
        const share = a.hp / assetStats(a).maxHp;
        return (
          <g key={assetId}>
            <AssetSprite held={a} x={at.x} y={at.y} share={a.status === 'repairing' ? 1 : share} disabled={a.status === 'disabled'} mirror={false} />
            {a.status === 'repairing' && <Chip x={at.x} y={at.y + 2} text="REPAIRING" tone="#9ae6b4" />}
          </g>
        );
      })}
      {f.robots.map(({role, at}) => {
        const r = state.robots[role];
        const busy = r.status === 'repairing' || r.status === 'remanufacturing' || r.status === 'upgrading';
        return (
          <g key={role}>
            {r.status === 'remanufacturing' ? (
              <g transform={`translate(${at.x} ${at.y - 16})`} className="sbx-beacon">
                <circle r="12" fill="none" stroke="#67e8f9" strokeWidth="2" strokeDasharray="5 4" />
              </g>
            ) : r.status === 'upgrading' ? null : (
              <RobotSprite state={state} role={role} x={at.x} y={at.y} status={r.status} mirror={false} />
            )}
            {busy && <Chip x={at.x} y={at.y + 2} text={r.status === 'upgrading' ? 'IN BAY' : r.status === 'repairing' ? 'REPAIR' : 'REBUILD'} tone="#9ae6b4" />}
          </g>
        );
      })}
    </g>
  );
}

function Column({state, now, site, frame}: {state: SandboxState; now: number; site: Site; frame: BattleFrame | null}) {
  const m = state.march!;
  const stage = stagingPoint(site);
  let at: Pt;
  let heading: Pt;
  if (m.phase === 'outbound') {
    const t = Math.max(0, Math.min(1, (now - m.departAt) / Math.max(1, m.arriveAt - m.departAt)));
    at = lerp(PARK, stage, t);
    heading = stage;
  } else if (m.phase === 'returning' && m.returnAt !== null) {
    // A recall turns the column round where it was; otherwise it leaves from the target.
    // The engine sets returnAt = recall time + time already travelled.
    const leg = m.arriveAt - m.departAt;
    const recalledOnTheWay = m.outcome === 'recalled' && m.returnAt - m.departAt < 2 * leg;
    const startedAt = recalledOnTheWay ? (m.returnAt + m.departAt) / 2 : m.outcome === 'recalled' ? m.returnAt - leg : (m.holdUntil ?? m.arriveAt);
    const from = recalledOnTheWay ? lerp(PARK, stage, Math.max(0, Math.min(1, (startedAt - m.departAt) / Math.max(1, leg)))) : stage;
    const t = Math.max(0, Math.min(1, (now - startedAt) / Math.max(1, m.returnAt - startedAt)));
    at = lerp(from, PARK, t);
    heading = PARK;
  } else {
    at = stage;
    heading = site;
  }
  const mirror = heading.x < at.x - 1;
  // Destroyed robots do not come home: their wrecks stay at the target until the column leaves.
  const robots = m.robots.filter((r) => (frame ? true : m.phase !== 'returning' || state.robots[r].status !== 'destroyed'));
  const f = formation(at, heading, robots, m.assets);
  const moving = m.phase === 'outbound' || m.phase === 'returning';
  const enemyEntries = frame && state.encounter ? state.encounter.enemiesStart : [];
  const layout = enemyLayout(site, enemyEntries);

  return (
    <g pointerEvents="none">
      <ellipse cx={at.x} cy={at.y + 8} rx="62" ry="22" fill="#22d3ee" opacity="0.12" stroke="#22d3ee" strokeWidth="2" strokeOpacity="0.7" />
      {f.assets.map(({assetId, at: p}) => {
        const live = frame ? frame.assets[assetId] : undefined;
        const a = state.assets.find((x) => x.assetId === assetId)!;
        const hp = live?.hp ?? a.hp;
        const status = live?.status ?? a.status;
        const max = assetStats(a).maxHp;
        return (
          <g key={assetId} className={moving ? 'sm-drive' : undefined}>
            <AssetSprite held={a} x={p.x} y={p.y} share={hp / max} disabled={status === 'disabled'} mirror={mirror} />
            {(frame || hp < max) && <HpBar x={p.x} y={p.y + 3} w={34} value={hp} max={max} tone={status === 'disabled' ? '#ef5a4a' : hp / max > 0.5 ? '#43d17a' : '#f2b233'} />}
          </g>
        );
      })}
      {f.robots.map(({role, at: p}) => {
        const live = frame ? frame.robots[role] : undefined;
        const r = state.robots[role];
        const hp = live?.hp ?? r.hp;
        const status = live?.status ?? r.status;
        const max = robotStats(role, r.level).maxHp;
        return (
          <g key={role} className={moving && status === 'ready' ? 'sm-march' : undefined}>
            <RobotSprite state={state} role={role} x={p.x} y={p.y} status={status} mirror={mirror} />
            {(frame || hp < max) && status !== 'destroyed' && <HpBar x={p.x} y={p.y + 3} w={22} value={hp} max={max} tone={status === 'ready' ? (hp / max > 0.5 ? '#43d17a' : '#f2b233') : '#ef5a4a'} />}
          </g>
        );
      })}
      {m.phase === 'holding' && m.holdUntil !== null && (
        <HoldRing at={{x: site.x, y: site.y - 8}} pct={1 - (m.holdUntil - now) / Math.max(1, m.holdUntil - m.arriveAt)} />
      )}
      {frame &&
        enemyEntries.map((x) => {
          const hp = frame.enemies[x.id] ?? x.hp;
          const p = layout[x.id];
          return (
            <g key={x.id}>
              <EnemySprite kind={x.kind} x={p.x} y={p.y} dead={hp <= 0} mirror={p.x > at.x} />
              {hp > 0 && <HpBar x={p.x} y={p.y + 3} w={x.kind === 'walker' ? 34 : 22} value={hp} max={x.maxHp} tone="#e5483a" />}
            </g>
          );
        })}
    </g>
  );
}

function HoldRing({at, pct}: {at: Pt; pct: number}) {
  const p = Math.max(0, Math.min(1, pct));
  return (
    <g transform={`translate(${at.x} ${at.y})`}>
      <circle r="13" fill="#15110c" opacity="0.8" />
      <circle r="10" fill="none" stroke="#3b3326" strokeWidth="3.5" />
      <circle r="10" fill="none" stroke="#f5d28a" strokeWidth="3.5" strokeDasharray={`${(2 * Math.PI * 10 * p).toFixed(1)} 999`} transform="rotate(-90)" />
    </g>
  );
}

/* -------------------------------------------------------------------------- */
/* Effects                                                                    */
/* -------------------------------------------------------------------------- */

function Effects({frame, state, site}: {frame: BattleFrame; state: SandboxState; site: Site}) {
  const m = state.march!;
  const stage = stagingPoint(site);
  const f = formation(stage, site, m.robots, m.assets);
  const layout = enemyLayout(site, state.encounter?.enemiesStart ?? []);
  const locate = (ref: FxRef | undefined): Pt => {
    if (!ref) return site;
    if (ref.side === 'enemy') {
      const p = layout[ref.id] ?? site;
      return {x: p.x, y: p.y - 14};
    }
    const u: UnitRef = ref.unit;
    if (u.kind === 'robot') {
      const p = f.robots.find((x) => x.role === u.role)?.at ?? stage;
      return {x: p.x, y: p.y - 18};
    }
    const p = f.assets.find((x) => x.assetId === u.assetId)?.at ?? stage;
    return {x: p.x, y: p.y - 22};
  };
  return (
    <g pointerEvents="none">
      {frame.fx.map((fx, i) => (
        <g key={i}>{renderFx(fx, locate, frame.inRound)}</g>
      ))}
    </g>
  );
}

function style(f: Fx, inRound: number, extra: Record<string, string> = {}): CSSProperties {
  return {animationDelay: `${f.at - inRound}ms`, animationDuration: `${Math.max(1, f.dur)}ms`, ...extra} as CSSProperties;
}

function renderFx(f: Fx, locate: (r: FxRef | undefined) => Pt, inRound: number): ReactNode {
  if (f.at + f.dur < inRound && f.type !== 'float') return null;
  const to = locate(f.to);
  const from = locate(f.from);
  const px = (n: number) => `${n.toFixed(1)}px`;
  switch (f.type) {
    case 'shot':
    case 'bolt': {
      const vars = {'--fx': px(from.x), '--fy': px(from.y), '--tx': px(to.x), '--ty': px(to.y)};
      return (
        <g className={`sbx-travel${f.heavy ? ' sbx-travel-arc' : ''}`} style={style(f, inRound, vars)}>
          {f.type === 'shot' ? (
            f.heavy ? (
              <>
                <circle r="4.5" fill="#fff1b0" />
                <circle r="9" fill="#ffb23a" opacity="0.45" />
              </>
            ) : (
              <>
                <circle r="2.5" fill="#d9fbff" />
                <circle r="6" fill="#67e8f9" opacity="0.4" />
              </>
            )
          ) : (
            <>
              <circle r="4" fill="#ff6a3d" />
              <circle r="8" fill="#ff3b1f" opacity="0.4" />
            </>
          )}
        </g>
      );
    }
    case 'heal':
      return <line className="sbx-beam" x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="#5ef0a0" strokeWidth="4" strokeLinecap="round" style={style(f, inRound)} />;
    case 'flash':
      return (
        <g transform={`translate(${from.x} ${from.y})`}>
          <g className="sbx-pop" style={style(f, inRound)}>
            <path d="M0 -10 L3 -3 L10 0 L3 3 L0 10 L-3 3 L-10 0 L-3 -3 Z" fill={f.from?.side === 'enemy' ? '#ff8a4a' : f.heavy ? '#fff1a8' : '#c9fbff'} />
          </g>
        </g>
      );
    case 'mark':
      return (
        <g transform={`translate(${to.x} ${to.y})`}>
          <g className="sbx-mark" style={style(f, inRound)}>
            <circle r="20" fill="none" stroke="#ff4d4d" strokeWidth="2.5" strokeDasharray="7 5" />
            <path d="M0 -27 V-17 M0 17 V27 M-27 0 H-17 M17 0 H27" stroke="#ff4d4d" strokeWidth="2.5" />
          </g>
        </g>
      );
    case 'impact':
      return (
        <g transform={`translate(${to.x} ${to.y})`}>
          <g className="sbx-pop" style={style(f, inRound)}>
            <circle r="11" fill="#ffd27a" opacity="0.85" />
            <circle r="5" fill="#fff" />
          </g>
        </g>
      );
    case 'explosion':
      return (
        <g transform={`translate(${to.x} ${to.y})`}>
          <g className="sbx-boom" style={style(f, inRound)}>
            <circle r="24" fill="#ff7a2f" opacity="0.9" />
            <circle r="14" fill="#ffd36b" />
            <circle r="34" fill="none" stroke="#fff1c2" strokeWidth="2.5" opacity="0.8" />
          </g>
          <g className="sbx-debris" style={style(f, inRound)}>
            <path d="M0 0 L-24 -20 M0 0 L26 -16 M0 0 L-18 22 M0 0 L22 20" stroke="#3a2d22" strokeWidth="3" strokeLinecap="round" strokeDasharray="3 14" />
          </g>
        </g>
      );
    case 'sparks':
      return (
        <g transform={`translate(${to.x} ${to.y})`}>
          <g className="sbx-sparks" style={style(f, inRound)}>
            <path d="M-5 -3 l-10 -6 M3 -6 l5 -11 M6 2 l11 -2 M-2 6 l-5 10" stroke="#ffe08a" strokeWidth="2" strokeLinecap="round" />
          </g>
        </g>
      );
    case 'float': {
      const color = f.tone === 'damage' ? '#ffe2d6' : f.tone === 'heal' ? '#c9ffd9' : f.tone === 'kill' ? '#ffd36b' : '#ffffff';
      const edge = f.tone === 'damage' ? '#b91c1c' : f.tone === 'heal' ? '#166534' : f.tone === 'kill' ? '#7a3b10' : '#2a2a2a';
      return (
        <g transform={`translate(${to.x} ${to.y - (f.tone === 'kill' ? 30 : 12)})`}>
          <g className="sbx-float" style={style(f, inRound)}>
            <text textAnchor="middle" fontSize={f.tone === 'damage' ? 15 : 11} fontWeight="800" fill={color} stroke={edge} strokeWidth="3.5" paintOrder="stroke">
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
