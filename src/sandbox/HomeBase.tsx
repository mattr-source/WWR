/**
 * Home Base: the live game's base board, as the sandbox's home screen.
 *
 * Everything drawn here is the live base's own design, read from
 * shared/base.ts - Matt's board painting (board-v5), the nineteen pads, every
 * department and asset building's art at its default pad, the Command Center
 * box painted into the board and the Task Force line outside the gate. The
 * sandbox reuses the layout and the art, not src/live/BaseBoard.tsx, which
 * talks to the server.
 *
 * Buildings that run a practice-sandbox function open it (Robot Bay, repairs,
 * the Hangar per Asset, Operations, reports). The rest are drawn as the real
 * base has them and say plainly that they have no function in the sandbox.
 * Tapping the Task Force on its slab goes to the World Map.
 */
import {type ReactNode, useEffect, useRef} from 'react';
import {ART_W, BOARD_BUILDINGS, BOARD_H, BOARD_IMAGE, BOARD_W, COMMAND_CENTER_BOX, PADS, PAD_H, PAD_W, type BoardBuilding, TASK_FORCE_PADS, VEHICLE_W, resolvePlacements} from '../../shared/base';
import {assetArtUrl} from '../../shared/assetVisuals';
import {ROLES, type SandboxState, assetNeedsRepair, assetOf, findSite, partsAt, robotNeedsRepair, siteLabel} from '../../shared/sandbox';
import {BUILDING_ROLE, type BaseTarget} from './baseRoles';
import {AssetKitOverlay} from './RefitArt';
import {RobotFigure} from './RobotFigure';

export {BUILDING_ROLE, type BaseTarget, buildingLabel} from './baseRoles';

export default function HomeBase({state, highlight, onOpen}: {state: SandboxState; highlight: BaseTarget['kind'] | null; onOpen: (t: BaseTarget) => void}) {
  const scroller = useRef<HTMLDivElement>(null);
  // Open on the middle of the board, with the Task Force line one scroll away.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = Math.max(0, (el.scrollHeight - el.clientHeight) * 0.42);
  }, []);

  const placements = resolvePlacements([]);
  const drawn = placements.map((p) => ({b: BOARD_BUILDINGS.find((x) => x.id === p.buildingId)!, pad: PADS.find((x) => x.id === p.padId)!}));
  const needsRepair = ROLES.some((r) => state.robots[r].status === 'destroyed' || robotNeedsRepair(state.robots[r])) || state.assets.some((a) => assetNeedsRepair(a));
  const upgrading = ROLES.some((r) => state.robots[r].status === 'upgrading') || !!state.workshop.job;
  const m = state.march;
  const site = m ? findSite(state, m.siteId) : null;

  const badge = (b: BoardBuilding): ReactNode => {
    if (b.id === 'recovery_yard' && needsRepair) return <span className="rounded bg-red-700 px-1 text-[10px] font-bold text-white">Needs repair</span>;
    if (b.id === 'fabrication_shop' && upgrading) return <span className="rounded bg-cyan-800 px-1 text-[10px] font-bold text-cyan-50">Working</span>;
    const hangar = BUILDING_ROLE[b.id]?.target;
    if (hangar?.kind === 'hangar' && hangar.assetId) {
      const a = state.assets.find((x) => x.assetId === hangar.assetId);
      if (a) return <span className="rounded bg-black/70 px-1 font-mono text-[10px] text-amber-200">R{a.rank}</span>;
    }
    return null;
  };

  return (
    <div ref={scroller} className="absolute inset-0 overflow-y-auto overscroll-contain bg-[#2b2418]" data-scene="base" aria-label="Home Base">
      <div className="relative mx-auto w-full max-w-[560px]" style={{aspectRatio: `${BOARD_W} / ${BOARD_H}`}}>
        <img src={BOARD_IMAGE} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full" decoding="async" />

        {/* The Command Center, painted into the board. */}
        <button
          className="absolute rounded-lg focus-visible:ring-2 focus-visible:ring-white/80"
          style={{left: `${COMMAND_CENTER_BOX.x * 100}%`, top: `${COMMAND_CENTER_BOX.y * 100}%`, width: `${COMMAND_CENTER_BOX.w * 100}%`, height: `${COMMAND_CENTER_BOX.h * 100}%`, zIndex: 12}}
          onClick={() => onOpen({kind: 'command'})}
          aria-label="Command Center: Task Force record and test controls"
        >
          <span className="pointer-events-none absolute inset-x-0 top-[64%] flex flex-col items-center">
            <span className="whitespace-nowrap rounded bg-black/80 px-2 py-0.5 text-[11px] font-semibold text-neutral-50 shadow">Command Center</span>
            <span className="mt-0.5 rounded bg-black/60 px-1.5 text-[10px] text-amber-200">Task Force record</span>
          </span>
        </button>

        {/* The Task Force line outside the gate. */}
        {TASK_FORCE_PADS.map(({padId, squad}, i) => {
          const pad = PADS.find((p) => p.id === padId)!;
          if (i > 0) {
            return (
              <div
                key={padId}
                className="pointer-events-none absolute flex flex-col items-center justify-center text-center"
                style={{left: `${pad.x * 100}%`, top: `${pad.y * 100}%`, width: `${PAD_W * 100}%`, height: `${PAD_H * 100}%`, transform: 'translate(-50%, -50%)', zIndex: 8}}
              >
                <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-800/90">{squad}</span>
                <span className="rounded bg-black/60 px-1 text-[10px] text-neutral-400">Not in sandbox</span>
              </div>
            );
          }
          return (
            <button
              key={padId}
              onClick={() => onOpen({kind: 'world'})}
              aria-label={m ? `Task Force ${squad}: out on the World Map` : `Task Force ${squad}: go to the World Map`}
              data-taskforce={squad}
              className={`absolute flex flex-col items-center justify-end rounded-md ${highlight === 'world' ? 'sbx-attention' : ''}`}
              style={{left: `${pad.x * 100}%`, top: `${(pad.y + PAD_H / 2) * 100}%`, width: `${PAD_W * 100}%`, minHeight: `${PAD_H * 100}%`, transform: 'translate(-50%, -100%)', zIndex: 14}}
            >
              {!m && (
                <span className="pointer-events-none flex flex-col items-center">
                  <span className="flex items-end justify-center">
                    {ROLES.map((r) => (
                      <span key={r} className="-mx-1 inline-block">
                        <RobotFigure role={r} parts={partsAt(state.robots[r].level)} height={30} status={state.robots[r].status === 'destroyed' || state.robots[r].status === 'disabled' ? state.robots[r].status : 'ready'} />
                      </span>
                    ))}
                  </span>
                  <span className="-mt-1 flex items-end justify-center">
                    {state.assets.map((a) => {
                      const asset = assetOf(a.assetId);
                      const url = assetArtUrl(a.assetId, a.rank);
                      return (
                        <span key={a.assetId} className="relative -mx-2 inline-block h-12 w-12">
                          {url && <img src={url} alt="" className={`absolute inset-0 h-full w-full object-contain ${a.status === 'disabled' ? 'brightness-50' : ''}`} />}
                          {asset && <AssetKitOverlay category={asset.category} packages={a.packages} rank={a.rank} detail="map" />}
                        </span>
                      );
                    })}
                  </span>
                </span>
              )}
              <span className="whitespace-nowrap rounded bg-black/85 px-1 text-[10px] font-semibold leading-tight text-neutral-50">
                {squad} · <span className={m ? 'text-orange-300' : 'text-emerald-300'}>{m ? (m.phase === 'returning' ? 'Returning' : 'Out') : 'Home'}</span>
              </span>
              <span className="mt-0.5 whitespace-nowrap rounded bg-cyan-800 px-1.5 text-[11px] font-semibold leading-5 text-cyan-50">World Map ›</span>
              {m && site && <span className="mt-0.5 max-w-[9rem] truncate rounded bg-black/70 px-1 text-[10px] text-orange-200">{siteLabel(site.kind)}</span>}
            </button>
          );
        })}

        {drawn.map(({b, pad}) => {
          const vehicle = b.draw === 'vehicle';
          const y = pad.y + (vehicle ? 0 : PAD_H / 2);
          const role = BUILDING_ROLE[b.id];
          const lit = role && highlight && role.target.kind === highlight;
          const extra = badge(b);
          return (
            <button
              key={b.id}
              data-building={b.id}
              onClick={() => onOpen(role ? role.target : {kind: 'info', buildingId: b.id})}
              aria-label={role ? `${role.role}: ${b.name}` : `${b.name}: not in the practice sandbox`}
              className={`absolute block rounded-md ${lit ? 'sbx-attention' : ''}`}
              style={{
                left: `${pad.x * 100}%`,
                top: `${y * 100}%`,
                width: `${(vehicle ? VEHICLE_W : ART_W) * 100}%`,
                transform: vehicle ? 'translate(-50%, -50%)' : 'translate(-50%, -100%)',
                zIndex: 10 + Math.round(pad.y * 10),
              }}
            >
              <img src={b.art} alt="" draggable={false} decoding="async" className={`pointer-events-none block w-full ${role ? '' : 'saturate-[0.7]'}`} />
              <span className={`pointer-events-none absolute inset-x-0 flex flex-col items-center ${vehicle ? 'top-[70%]' : 'bottom-[4%]'}`}>
                <span className="flex items-center gap-0.5">
                  <span className={`whitespace-nowrap rounded px-1.5 text-[10px] font-semibold shadow ${role ? 'bg-black/85 text-amber-100' : 'bg-black/55 text-neutral-300'}`}>{role ? role.role : b.name}</span>
                  {extra}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mx-auto max-w-[560px] px-3 py-2 text-center text-[11px] text-neutral-400">
        The live base board and building art. Buildings marked with a role open a practice-sandbox function; the others have none here.
      </p>
    </div>
  );
}
