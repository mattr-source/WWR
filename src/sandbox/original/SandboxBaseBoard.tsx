/**
 * The base board, ported from src/live/BaseBoard.tsx for the practice sandbox.
 *
 * Same presentation and interaction as the live board: the painting COVERS
 * the viewport and pans (drag or wheel), it opens at the top, buildings stand
 * at their pads with no permanent labels, one tap names a building above its
 * roof and a second tap on it opens it, the Command Center is a hit box over
 * the painting, and the four Task Force slabs sit outside the southern gate.
 *
 * What differs, because the sandbox never talks to the server:
 * - placements are the defaults (the live board reads the server's record);
 * - press-and-hold does not lift a building - moving buildings is saved on the
 *   server, so the sandbox says so instead;
 * - the Task Force line reads the practice Task Force (Alpha), not /api/squads.
 * Strings are the live English strings (src/i18n).
 */
import {type PointerEvent as ReactPointerEvent, useEffect, useRef, useState} from 'react';
import {t} from './strings';
import {
  ART_W,
  BOARD_BUILDINGS,
  BOARD_BUILDING_BY_ID,
  BOARD_H,
  BOARD_IMAGE,
  BOARD_W,
  COMMAND_CENTER_BOX,
  COMMAND_CENTER_ENTRY,
  COMMAND_CENTER_ID,
  PAD_H,
  PAD_W,
  PADS,
  TASK_FORCE_PADS,
  VEHICLE_W,
  type BuildingEntry,
} from '../../../shared/base';
import {type SandboxState, assetNeedsRepair, robotNeedsRepair, ROLES} from '../../../shared/sandbox';

const HOLD_MS = 320;
const SLOP_PX = 10;
export const MOVE_NOT_IN_SANDBOX = 'Moving buildings is saved on the game server: not in the practice sandbox.';

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function fitBoard(vw: number, vh: number) {
  const scale = Math.max(vw / BOARD_W, vh / BOARD_H);
  return {w: BOARD_W * scale, h: BOARD_H * scale, scale};
}

/** A practice-only status line under a selected building's name (the live board has none to show). */
function statusOf(id: string, state: SandboxState): string | null {
  if (id === 'recovery_yard') {
    const hurt = ROLES.some((r) => state.robots[r].status === 'destroyed' || robotNeedsRepair(state.robots[r])) || state.assets.some((a) => assetNeedsRepair(a));
    return hurt ? 'Needs repair' : null;
  }
  if (id === 'fabrication_shop' && (ROLES.some((r) => state.robots[r].status === 'upgrading') || state.workshop.job)) return 'Working';
  return null;
}

export default function SandboxBaseBoard({state, onOpen, bottomInset = 0}: {state: SandboxState; onOpen: (entry: BuildingEntry) => void; bottomInset?: number}) {
  const box = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState({w: 360, h: 640});
  const [pan, setPan] = useState<{x: number; y: number} | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setView({w: el.clientWidth, h: el.clientHeight}));
    ro.observe(el);
    setView({w: el.clientWidth, h: el.clientHeight});
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!note) return;
    const id = window.setTimeout(() => setNote(null), 3200);
    return () => window.clearTimeout(id);
  }, [note]);

  const fit = fitBoard(view.w, view.h);
  const minX = view.w - fit.w;
  const minY = view.h - fit.h;
  const cur = pan ?? {x: minX / 2, y: 0};
  const px = clamp(cur.x, minX, 0);
  const py = clamp(cur.y, minY, 0);

  function tapBuilding(id: string) {
    const entry: BuildingEntry | undefined = id.startsWith('tf:') ? {kind: 'taskforce', squad: id.slice(3)} : id === COMMAND_CENTER_ID ? COMMAND_CENTER_ENTRY : BOARD_BUILDING_BY_ID[id]?.entry;
    if (!entry) return;
    if (selected === id) {
      onOpen(entry);
      return;
    }
    setSelected(id);
  }

  const press = useRef<{id: string | null; startX: number; startY: number; panX: number; panY: number; mode: 'undecided' | 'pan'; timer: number | null; pointerId: number} | null>(null);

  function onDown(e: ReactPointerEvent, id: string | null) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const b = id ? BOARD_BUILDING_BY_ID[id] ?? null : null;
    const p: NonNullable<typeof press.current> = {id, startX: e.clientX, startY: e.clientY, panX: px, panY: py, mode: 'undecided', timer: null, pointerId: e.pointerId};
    press.current = p;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    if (id) {
      p.timer = window.setTimeout(() => {
        if (press.current === p && p.mode === 'undecided') {
          setNote(b && !b.fixed ? MOVE_NOT_IN_SANDBOX : b ? t('board.fixedRunway') : id.startsWith('tf:') ? t('board.tfLine') : t('board.fixed'));
        }
      }, HOLD_MS);
    }
  }

  function onMove(e: ReactPointerEvent) {
    const p = press.current;
    if (!p || p.pointerId !== e.pointerId) return;
    const dx = e.clientX - p.startX;
    const dy = e.clientY - p.startY;
    if (p.mode === 'undecided' && Math.hypot(dx, dy) > SLOP_PX) {
      p.mode = 'pan';
      if (p.timer) window.clearTimeout(p.timer);
    }
    if (p.mode === 'pan') setPan({x: p.panX + dx, y: p.panY + dy});
  }

  function onUp(e: ReactPointerEvent) {
    const p = press.current;
    if (!p || p.pointerId !== e.pointerId) return;
    press.current = null;
    if (p.timer) window.clearTimeout(p.timer);
    if (p.mode === 'undecided') {
      if (p.id) tapBuilding(p.id);
      else setSelected(null);
    }
  }

  function onCancel() {
    const p = press.current;
    if (p?.timer) window.clearTimeout(p.timer);
    press.current = null;
  }

  const labelPx = Math.max(11, Math.round(fit.w * 0.03));
  const drawn = [...BOARD_BUILDINGS].map((b) => ({b, pad: PADS.find((p) => p.id === b.defaultPad)!})).sort((p, q) => p.pad.y - q.pad.y);
  const ccSel = selected === COMMAND_CENTER_ID;
  const m = state.march;

  return (
    <div
      ref={box}
      data-scene="base"
      aria-label="My base"
      className="absolute inset-x-0 top-0 select-none overflow-hidden bg-[#0a0906]"
      style={{bottom: bottomInset}}
      onWheel={(e) => setPan({x: px, y: py - e.deltaY})}
    >
      {note && (
        <p className="pointer-events-none absolute left-3 z-30 rounded bg-black/70 px-2 py-1 text-xs text-neutral-200" style={{top: 'calc(env(safe-area-inset-top) + 3.75rem)'}} role="status">
          {note}
        </p>
      )}

      <div
        className="absolute left-0 top-0"
        data-board
        style={{width: fit.w, height: fit.h, transform: `translate(${px}px, ${py}px)`, touchAction: 'none'}}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'IMG') onDown(e, null);
        }}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
      >
        <img src={BOARD_IMAGE} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full" decoding="async" />

        <div
          className="absolute"
          data-guide="building:command_center"
          role="button"
          aria-label="Command Center"
          style={{left: `${COMMAND_CENTER_BOX.x * 100}%`, top: `${COMMAND_CENTER_BOX.y * 100}%`, width: `${COMMAND_CENTER_BOX.w * 100}%`, height: `${COMMAND_CENTER_BOX.h * 100}%`, zIndex: 12, touchAction: 'none'}}
          onPointerDown={(e) => {
            e.stopPropagation();
            onDown(e, COMMAND_CENTER_ID);
          }}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onCancel}
          onDoubleClick={() => onOpen(COMMAND_CENTER_ENTRY)}
        >
          {ccSel && (
            <div className="pointer-events-none absolute inset-x-0 top-[62%] z-20 flex flex-col items-center" style={{fontSize: labelPx}} data-label>
              <span className="whitespace-nowrap rounded bg-black/80 px-2 py-0.5 font-semibold text-neutral-50 shadow">Command Center</span>
              <span className="mt-0.5 rounded bg-black/60 px-1.5 text-[0.8em] text-neutral-300">{t('board.openHintFixed')}</span>
            </div>
          )}
          {ccSel && <div className="pointer-events-none absolute inset-[6%] rounded-lg ring-2 ring-white/70" />}
        </div>

        {TASK_FORCE_PADS.map(({padId, squad}) => {
          const pad = PADS.find((p) => p.id === padId)!;
          // The practice sandbox has one Task Force (Alpha); the others are empty, as a new commander's are.
          const practice = squad === 'Alpha';
          const out = practice && !!m;
          const stateText = out ? t('board.tfOut') : practice ? t('board.tfHome') : t('board.tfEmpty');
          const tint = out ? 'text-orange-300' : practice ? 'text-emerald-300' : 'text-neutral-500';
          const tfId = `tf:${squad}`;
          const tfSel = selected === tfId;
          return (
            <div
              key={padId}
              data-guide={`slab:${squad}`}
              role="button"
              aria-label={`Task Force ${squad}: ${stateText}`}
              className={`absolute flex flex-col items-center justify-center text-center ${tfSel ? 'rounded ring-2 ring-white/70' : ''}`}
              style={{left: `${pad.x * 100}%`, top: `${pad.y * 100}%`, width: `${PAD_W * 100}%`, height: `${PAD_H * 100}%`, transform: 'translate(-50%, -50%)', fontSize: labelPx * 0.85, zIndex: 8, touchAction: 'none'}}
              onPointerDown={(e) => {
                e.stopPropagation();
                onDown(e, tfId);
              }}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onCancel}
              onDoubleClick={() => onOpen({kind: 'taskforce', squad})}
            >
              <span className="whitespace-nowrap font-semibold uppercase tracking-wider text-neutral-800/90">{squad}</span>
              <span className={`mt-0.5 rounded bg-black/70 px-1.5 text-[0.85em] font-semibold ${tint}`}>{stateText}</span>
              {tfSel && <span className="mt-0.5 rounded bg-black/60 px-1.5 text-[0.75em] text-neutral-300">{t('board.openHintFixed')}</span>}
            </div>
          );
        })}

        {drawn.map(({b, pad}) => {
          const isSel = selected === b.id;
          const vehicle = b.draw === 'vehicle';
          const y = pad.y + (vehicle ? 0 : PAD_H / 2);
          const status = isSel ? statusOf(b.id, state) : null;
          return (
            <div
              key={b.id}
              data-guide={`building:${b.id}`}
              className="absolute transition-[left,top] duration-200"
              style={{left: `${pad.x * 100}%`, top: `${y * 100}%`, width: `${(vehicle ? VEHICLE_W : ART_W) * 100}%`, transform: vehicle ? 'translate(-50%, -50%)' : 'translate(-50%, -100%)', zIndex: 10 + Math.round(pad.y * 10)}}
            >
              {isSel && (
                <div className={`pointer-events-none absolute inset-x-0 z-20 flex flex-col items-center ${pad.y < 0.2 ? '-bottom-1 translate-y-full' : '-top-1 -translate-y-full'}`} style={{fontSize: labelPx}} data-label>
                  <span className="whitespace-nowrap rounded bg-black/80 px-2 py-0.5 font-semibold text-neutral-50 shadow">{b.name}</span>
                  {status && <span className="mt-0.5 rounded bg-red-800/90 px-1.5 text-[0.8em] font-semibold text-white">{status}</span>}
                  <span className="mt-0.5 whitespace-nowrap rounded bg-black/60 px-1.5 text-[0.8em] text-neutral-300">{t('board.openHintFixed')}</span>
                </div>
              )}
              <img
                src={b.art}
                alt={b.name}
                role="button"
                aria-label={b.name}
                draggable={false}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onDown(e, b.id);
                }}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onCancel}
                onDoubleClick={() => onOpen(b.entry)}
                decoding="async"
                className={`block w-full cursor-pointer ${isSel ? 'drop-shadow-[0_0_10px_rgba(255,255,255,0.7)]' : ''}`}
                style={{touchAction: 'none'}}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
