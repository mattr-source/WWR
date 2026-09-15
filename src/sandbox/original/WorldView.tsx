/**
 * The World view, laid out as src/live/WorldMap.tsx lays out the live map,
 * over the practice sector (SectorMap.tsx on the live Season 1 terrain).
 *
 * Same controls in the same places, with the live English strings:
 * - top strip: Task Forces (grid icon) left; the world card (world, where you
 *   are, the RST clock) centre; account portrait and "My base" right, with
 *   "Task forces out" and its Recall under them while a column is out;
 * - bottom column, above the Comms bar: the selection panel (name, blurb,
 *   reward, ✕), then + / − zoom bottom-left and Reports and Home bottom-right.
 *
 * Attack, as Matt specified for squads: tap a target once, the Attack button
 * appears in the selection panel, press it and Task Force Alpha's saved
 * line-up (set on the base's Task Force slab) marches. No chooser sheet.
 *
 * What differs: the live map is a pannable canvas of the whole server world
 * fetched from the server; the sandbox map is one fixed practice sector, so
 * + / − and Home zoom and centre that sector. The sandbox's march test skip
 * sits in the Task forces out panel, marked as a test control.
 */
import {type ReactNode, useRef, useState} from 'react';
import {t} from './strings';
import {type SandboxState, type Site, describeReward, findSite, siteLabel, siteReward} from '../../../shared/sandbox';
import {EXERCISES} from '../../../shared/exercises';
import SectorMap, {VIEW_H, VIEW_W} from '../SectorMap';
import {HOME_ANCHOR} from '../worldGround';
import {clock} from '../ui';
import {GameClock} from './GameClock';

const ZOOM_MIN = 1;
const ZOOM_MAX = 2.6;
const HOME_ZOOM = 1.7;

export function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

export interface MarchLine {
  title: string;
  detail: string | null;
  canRecall: boolean;
  skipLabel: string | null;
}

export default function WorldView({
  state,
  now,
  roundMs,
  pulseSite,
  account,
  march,
  bottomInset,
  overlay,
  notice,
  onSelectSite,
  renderAction,
  onOpenBase,
  onOpenSquads,
  onOpenReports,
  onRecall,
  onSkip,
}: {
  state: SandboxState;
  now: number;
  roundMs: number;
  pulseSite: string | null;
  account: ReactNode;
  march: MarchLine | null;
  bottomInset: number;
  overlay?: ReactNode;
  /** A practice-only label (temporary art), kept in the bottom column so it never sits on a target. */
  notice?: ReactNode;
  onSelectSite: (id: string | null) => void;
  /** What the selection panel offers for a target: the Attack button, or why the squad cannot go. */
  renderAction: (site: Site) => ReactNode;
  onOpenBase: () => void;
  onOpenSquads: () => void;
  onOpenReports: () => void;
  onRecall: () => void;
  onSkip: () => void;
}) {
  const [cam, setCam] = useState({zoom: ZOOM_MIN, cx: VIEW_W / 2, cy: VIEW_H / 2});
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{x: number; y: number; cx: number; cy: number; moved: boolean} | null>(null);
  const selected = state.selectedSite ? findSite(state, state.selectedSite) : null;
  const spec = selected && selected.kind !== 'patrol' && selected.kind !== 'rival_base' ? EXERCISES[selected.kind] : null;
  const done = selected ? state.cleared.includes(selected.id) : false;
  const reward = selected ? siteReward(selected, state) : null;

  const clampCam = (c: {zoom: number; cx: number; cy: number}) => {
    const zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, c.zoom));
    const hw = VIEW_W / 2 / zoom;
    const hh = VIEW_H / 2 / zoom;
    return {zoom, cx: Math.max(hw, Math.min(VIEW_W - hw, c.cx)), cy: Math.max(hh, Math.min(VIEW_H - hh, c.cy))};
  };
  // Zoom about the sector centre point cx,cy: the map layer is scaled and shifted, the HUD stays put.
  const shiftX = (VIEW_W / 2 - cam.cx) / VIEW_W;
  const shiftY = (VIEW_H / 2 - cam.cy) / VIEW_H;

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0a0906]" data-world-view>
      <div
        ref={box}
        className="absolute inset-x-0 top-0 overflow-hidden"
        style={{bottom: bottomInset, touchAction: cam.zoom > 1 ? 'none' : 'auto'}}
        onPointerDown={(e) => {
          if (cam.zoom <= 1) return;
          drag.current = {x: e.clientX, y: e.clientY, cx: cam.cx, cy: cam.cy, moved: false};
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          const el = box.current;
          if (!d || !el) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (!d.moved && Math.hypot(dx, dy) < 10) return;
          d.moved = true;
          const unit = Math.min(el.clientWidth / VIEW_W, el.clientHeight / VIEW_H) * cam.zoom;
          setCam((c) => clampCam({...c, cx: d.cx - dx / unit, cy: d.cy - dy / unit}));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <div className="absolute inset-0 origin-center transition-transform duration-200 motion-reduce:transition-none" style={{transform: `scale(${cam.zoom}) translate(${shiftX * 100}%, ${shiftY * 100}%)`}} data-map-layer>
          <SectorMap state={state} now={now} roundMs={roundMs} selectedSite={state.selectedSite} pulseSite={pulseSite} onSelectSite={(id) => onSelectSite(id)} onBaseTap={onOpenBase} />
        </div>
        {overlay}
      </div>

      {/* Task Forces left, My base right - the same two corners the base screen uses (WorldMap.tsx). */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 grid grid-cols-[auto_1fr_auto] items-start gap-2 p-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <button onClick={onOpenSquads} aria-label={t('nav.squads')} data-guide="squads" className="pointer-events-auto flex min-h-11 items-center gap-2 justify-self-start rounded border border-neutral-700 bg-black/70 px-3 py-2 text-sm font-medium text-neutral-200 backdrop-blur transition hover:border-orange-500 hover:text-orange-200">
          <GridIcon />
          <span className="hidden sm:inline">{t('nav.squads')}</span>
        </button>

        <div className="pointer-events-auto flex min-w-0 items-center justify-center gap-x-2 rounded border border-neutral-800 bg-black/70 px-3 py-1.5 text-center backdrop-blur" data-world-card>
          <span className="truncate text-xs font-semibold text-neutral-100">
            <span className="mr-1 text-[9px] uppercase tracking-[0.2em] text-orange-500">Practice</span>
            Dry Basin
          </span>
          <span className="shrink-0 border-l border-neutral-800 pl-2 text-[11px]">
            <GameClock />
          </span>
        </div>

        <div className="flex flex-col items-end gap-2 justify-self-end">
          <div className="flex items-center gap-2">
            {account}
            <button data-guide="my-base" onClick={onOpenBase} className="pointer-events-auto min-h-11 rounded bg-neutral-800 px-3 py-2 text-sm font-medium text-neutral-100 backdrop-blur transition hover:bg-neutral-700">
              {t('nav.myBase')}
            </button>
          </div>

          {march && (
            <div className="pointer-events-auto w-56 rounded border border-neutral-800 bg-black/70 backdrop-blur" data-guide="squads-out">
              <p className="border-b border-neutral-800 px-3 py-1.5 text-[10px] uppercase tracking-[0.25em] text-orange-500">{t('map.squadsOut')}</p>
              <div className="px-3 py-2">
                <p className="text-xs font-semibold text-neutral-100">{march.title}</p>
                {march.detail && <p className="text-[11px] text-neutral-400">{march.detail}</p>}
                <div className="mt-1.5 flex gap-2">
                  {march.canRecall && (
                    <button onClick={onRecall} className="min-h-11 flex-1 rounded border border-neutral-700 px-2 text-xs font-semibold text-neutral-200 hover:border-orange-600">
                      {t('map.recall')}
                    </button>
                  )}
                  {march.skipLabel && (
                    <button onClick={onSkip} aria-label={march.skipLabel} className="min-h-11 flex-1 rounded border-2 border-dashed border-amber-600/80 bg-amber-950/60 px-2 text-xs font-semibold text-amber-200">
                      Test ⏩
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Everything pinned to the bottom of the map, in one column (WorldMap.tsx), above Comms and General Rider. */}
      <div className="pointer-events-none absolute inset-x-3 z-30 flex flex-col gap-2" style={{bottom: `calc(${bottomInset + 16}px)`}} data-bottom-column>
        {selected && (
          <div className="pointer-events-auto rounded border border-neutral-800 bg-black/85 p-3 backdrop-blur" role="dialog" aria-label={siteLabel(selected.kind)} data-selection-panel>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-[11px] text-neutral-500">practice sector</p>
                <p className={`truncate font-semibold ${selected.battle ? 'text-amber-200' : 'text-amber-200'}`}>{siteLabel(selected.kind)}</p>
                <p className="text-xs text-neutral-400">{spec ? `Daily map exercise · ${spec.action}` : selected.kind === 'patrol' ? 'Dominion patrol · test-only enemies' : 'Mock rival base · a simulated commander, not a player'}</p>
              </div>
              <button onClick={() => onSelectSite(null)} className="-mr-2 -mt-2 min-h-11 min-w-11 shrink-0 text-neutral-500 hover:text-neutral-200" aria-label={t('nav.close')}>
                ✕
              </button>
            </div>
            {spec && <p className="mt-2 text-[11px] leading-snug text-neutral-300">{spec.blurb}</p>}
            <p className="mt-1 text-[11px] text-neutral-400">
              Reward: <span className="font-mono text-emerald-300">{reward ? describeReward(reward) : 'none (practice mock)'}</span>
              {spec && <span className="text-neutral-600"> · Daily Operations: {spec.lane}</span>}
            </p>
            {done ? <p className="mt-2 rounded border border-emerald-800 bg-emerald-950/30 px-2 py-1 text-xs text-emerald-200">Secured today.</p> : renderAction(selected)}
          </div>
        )}

        <div className="flex items-end justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {[
              {label: '+', delta: 1.3, aria: 'Zoom in'},
              {label: '−', delta: 1 / 1.3, aria: 'Zoom out'},
            ].map((b) => (
              <button key={b.label} aria-label={b.aria} onClick={() => setCam((c) => clampCam({...c, zoom: c.zoom * b.delta}))} className="pointer-events-auto h-11 w-11 rounded border border-neutral-700 bg-black/70 text-lg text-neutral-200 backdrop-blur hover:border-orange-600">
                {b.label}
              </button>
            ))}
            <span className="min-w-0 max-w-[7.5rem]">{notice}</span>
          </div>

          <div className="flex flex-col items-end gap-2">
            <button onClick={onOpenReports} title="Battle reports" data-guide="reports" className="pointer-events-auto flex h-11 items-center gap-2 rounded border border-neutral-700 bg-black/70 px-4 text-sm font-semibold text-neutral-100 backdrop-blur transition hover:border-red-600 hover:text-red-200">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4v16" />
                <path d="M4 5h11l-1.5 3L15 11H4" />
              </svg>
              {t('map.reports')}
            </button>
            <button data-guide="home" onClick={() => setCam(clampCam({zoom: HOME_ZOOM, cx: HOME_ANCHOR.x, cy: HOME_ANCHOR.y - 40}))} title="Back to your base" className="pointer-events-auto flex h-11 items-center gap-2 rounded border border-neutral-700 bg-black/70 px-4 text-sm font-semibold text-neutral-100 backdrop-blur transition hover:border-fuchsia-500 hover:text-fuchsia-200">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 10.5 12 3l9 7.5" />
                <path d="M5 9.5V20h14V9.5" />
              </svg>
              {t('map.home')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Where Task Force Alpha is, for the "Task forces out" panel. */
export function marchLine(state: SandboxState, now: number, fightOver: boolean | null, round: number | null, rounds: number): MarchLine | null {
  const m = state.march;
  if (!m) return null;
  const where = siteLabel(findSite(state, m.siteId)?.kind ?? 'patrol');
  const title =
    m.phase === 'outbound'
      ? `Alpha · marching on ${where} · ${clock(m.arriveAt - now)}`
      : m.phase === 'engaged'
        ? fightOver === false && round !== null
          ? `Alpha · attacking · round ${round + 1} of ${rounds}`
          : 'Alpha · battle over'
        : m.phase === 'holding'
          ? `Alpha · holding ${where} · ${clock((m.holdUntil ?? now) - now)}`
          : `Alpha · ${t('map.homeIn', {time: clock((m.returnAt ?? now) - now)})}`;
  const detail = m.phase === 'returning' && m.outcome ? (m.outcome === 'won' ? 'Victory' : m.outcome === 'lost' ? 'Defeat: damaged units are coming home' : m.outcome === 'held' ? 'Hold complete, reward banked' : 'Recalled, no reward') : null;
  const skipLabel = m.phase !== 'engaged' ? 'Test clock: skip ahead' : fightOver === false ? 'Test clock: skip the fight' : null;
  return {title, detail, canRecall: m.phase === 'outbound' || m.phase === 'holding', skipLabel};
}
