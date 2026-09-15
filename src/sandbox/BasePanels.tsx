/**
 * Art-led pieces for the sandbox sheets: building-art
 * cards for the Operations and Reports panels, the Materials Recovery Yard's
 * repair line-up and the honest sheet for a building with no sandbox job.
 *
 * All art is the game's own: building and vehicle art from public/base (as
 * named in shared/base.ts), the board painting, terrain props from the live
 * prop atlas, Asset renders and the provisional robot figures.
 */
import type {ReactNode} from 'react';
import {BOARD_BUILDINGS, BOARD_IMAGE} from '../../shared/base';
import {assetArtUrl} from '../../shared/assetVisuals';
import {PROP_ATLAS_H, PROP_ATLAS_SRC, PROP_ATLAS_W, PROP_FRAMES} from '../../shared/terrainAtlas';
import {ROLES, type Role, type SandboxAction, type SandboxState, assetNeedsRepair, assetOf, assetRepairQuote, assetStats, partsAt, remanufactureQuote, repairQuote, robotNeedsRepair, robotStats} from '../../shared/sandbox';
import {SANDBOX_SEASON_1_TEST} from '../../shared/sandboxSeason';
import {AssetKitOverlay} from './RefitArt';
import {RobotFigure} from './RobotFigure';
import {Bar, CostLine, clock, minutesLabel, primary, secondary} from './ui';

const CONFIG = SANDBOX_SEASON_1_TEST;

/** A building's art, by its shared/base.ts id. */
export function buildingArt(id: string): string {
  return BOARD_BUILDINGS.find((b) => b.id === id)?.art ?? BOARD_IMAGE;
}

/** One terrain prop from the live atlas. */
export function PropThumb({name}: {name: string}) {
  const f = PROP_FRAMES[name];
  if (!f) return null;
  const box = 40;
  const s = box / Math.max(f.w, f.h);
  return (
    <span aria-hidden className="relative block h-full w-full overflow-hidden rounded-sm bg-[#c9b894]">
      <span
        className="absolute left-1/2 top-1/2"
        style={{
          width: f.w * s,
          height: f.h * s,
          transform: 'translate(-50%, -50%)',
          backgroundImage: `url(${PROP_ATLAS_SRC})`,
          backgroundSize: `${PROP_ATLAS_W * s}px ${PROP_ATLAS_H * s}px`,
          backgroundPosition: `${-f.x * s}px ${-f.y * s}px`,
        }}
      />
    </span>
  );
}

/** A card led by a piece of the game's art. */
export function ArtCard({art, title, right, done, children}: {art: ReactNode; title: ReactNode; right?: ReactNode; done?: boolean; children?: ReactNode}) {
  return (
    <div className={`flex gap-2 rounded-lg border p-1.5 ${done ? 'border-emerald-800 bg-emerald-950/30' : 'border-neutral-800 bg-black/30'}`}>
      <div className="flex h-16 w-16 shrink-0 items-end justify-center overflow-hidden rounded-md bg-gradient-to-b from-[#3a3122] to-[#1a150e]">{art}</div>
      <div className="min-w-0 flex-1 py-0.5">
        <p className="flex items-baseline justify-between gap-2 text-[14px]">
          <b className={done ? 'text-emerald-200' : 'text-neutral-100'}>
            {done ? '✓ ' : ''}
            {title}
          </b>
          {right}
        </p>
        {children}
      </div>
    </div>
  );
}

export function BuildingImg({id, className = ''}: {id: string; className?: string}) {
  return <img src={buildingArt(id)} alt="" draggable={false} className={`h-full w-full object-contain ${className}`} />;
}

/** The Materials Recovery Yard: everything damaged, in art, with the repair it needs. */
export function RepairYard({state, now, onAct, onOpenBay, onOpenHangar}: {state: SandboxState; now: number; onAct: (a: SandboxAction) => void; onOpenBay: (role: Role) => void; onOpenHangar: (assetId: string) => void}) {
  const busy = (ids: string[]) => !!state.march && ids.some((id) => state.march!.robots.includes(id as Role) || state.march!.assets.includes(id));
  const robots = ROLES.filter((r) => ['destroyed', 'disabled', 'repairing', 'remanufacturing'].includes(state.robots[r].status) || robotNeedsRepair(state.robots[r]));
  const assets = state.assets.filter((a) => a.status !== 'ready' || assetNeedsRepair(a));
  return (
    <>
      <div className="relative -mx-1 overflow-hidden rounded-lg border border-neutral-800 bg-gradient-to-b from-[#3a3122] to-[#16120c]">
        <img src={buildingArt('recovery_yard')} alt="Materials Recovery Yard" className="mx-auto block h-32 object-contain" />
        <p className="bg-black/70 px-2 py-1 text-[12px] text-neutral-300">
          Damaged robots are repaired; destroyed robots are remanufactured and keep their level. Knocked-out Assets are repaired, never lost. Robot numbers are test-only; the Asset repair bill is the live formula.
        </p>
      </div>
      {robots.length === 0 && assets.length === 0 && <p className="rounded border border-emerald-900 bg-emerald-950/30 p-3 text-center text-[14px] text-emerald-200">Nothing needs repair. The whole Task Force is ready.</p>}
      {robots.map((role) => {
        const r = state.robots[role];
        const max = robotStats(role, r.level).maxHp;
        const out = busy([role]);
        const destroyed = r.status === 'destroyed';
        const q = destroyed ? remanufactureQuote(r, state.workshop.level) : repairQuote(r, state.workshop.level);
        const working = !!r.job && (r.status === 'repairing' || r.status === 'remanufacturing');
        return (
          <div key={role} data-repair={role}>
            <ArtCard
              art={<RobotFigure role={role} parts={partsAt(r.level)} height={60} status={destroyed || r.status === 'disabled' ? r.status : 'ready'} />}
              title={`${CONFIG.roles[role].label} · Lv ${r.level}`}
              right={<span className={`text-[12px] font-semibold ${destroyed ? 'text-red-300' : 'text-amber-300'}`}>{out ? 'Out' : destroyed ? 'Destroyed' : working ? `${r.status === 'remanufacturing' ? 'Rebuilding' : 'Repairing'} · ${clock(r.job!.completesAt - now)}` : 'Damaged'}</span>}
            >
              <Bar value={destroyed ? 0 : r.hp} max={max} tone="bg-amber-500" label={`${CONFIG.roles[role].label} HP`} />
              {!out && !working && (destroyed || robotNeedsRepair(r)) && (
                <>
                  <p className="mt-1 text-[12px] text-neutral-400">{destroyed ? 'Remanufacture' : 'Repair'}: {minutesLabel(q.minutes)}</p>
                  <CostLine cost={q.cost} have={state.supplies} />
                  <div className="mt-1 grid grid-cols-2 gap-1.5">
                    <button className={primary} onClick={() => onAct(destroyed ? {type: 'robot.remanufacture', role} : {type: 'robot.repair', role})}>
                      {destroyed ? 'Remanufacture' : 'Repair'}
                    </button>
                    <button className={secondary} onClick={() => onOpenBay(role)}>
                      Robot Bay ›
                    </button>
                  </div>
                </>
              )}
            </ArtCard>
          </div>
        );
      })}
      {assets.map((a) => {
        const asset = assetOf(a.assetId);
        const st = assetStats(a);
        const q = assetRepairQuote(a);
        const out = busy([a.assetId]);
        const url = assetArtUrl(a.assetId, a.rank);
        return (
          <div key={a.assetId} data-repair={a.assetId}>
            <ArtCard
              art={
                <span className="relative block h-16 w-16">
                  {url && <img src={url} alt="" className={`absolute inset-0 h-full w-full object-contain ${a.status === 'disabled' ? 'brightness-50' : ''}`} />}
                  {asset && <AssetKitOverlay category={asset.category} packages={a.packages} rank={a.rank} detail="map" className="absolute inset-0 h-full w-full" />}
                </span>
              }
              title={`${asset?.name ?? a.assetId} · R${a.rank}`}
              right={<span className="text-[12px] font-semibold text-amber-300">{out ? 'Out' : a.status === 'repairing' ? `Repairing · ${clock((a.job?.completesAt ?? now) - now)}` : a.status === 'disabled' ? 'Knocked out' : 'Damaged'}</span>}
            >
              <Bar value={a.hp} max={st.maxHp} tone="bg-amber-500" label={`${asset?.name ?? a.assetId} HP`} />
              {!out && assetNeedsRepair(a) && (
                <>
                  <p className="mt-1 text-[12px] text-neutral-400">Repair: {minutesLabel(q.minutes)}</p>
                  <CostLine cost={q.cost} have={state.supplies} />
                  <div className="mt-1 grid grid-cols-2 gap-1.5">
                    <button className={primary} onClick={() => onAct({type: 'asset.repair', assetId: a.assetId})}>
                      Repair
                    </button>
                    <button className={secondary} onClick={() => onOpenHangar(a.assetId)}>
                      Hangar ›
                    </button>
                  </div>
                </>
              )}
            </ArtCard>
          </div>
        );
      })}
    </>
  );
}

/** A base building that has no job in the practice sandbox: its art, and the plain truth. */
export function BuildingInfo({buildingId}: {buildingId: string}) {
  const b = BOARD_BUILDINGS.find((x) => x.id === buildingId);
  return (
    <div className="space-y-2" data-building-info={buildingId}>
      <div className="rounded-lg border border-neutral-800 bg-gradient-to-b from-[#3a3122] to-[#16120c] p-2">
        <img src={buildingArt(buildingId)} alt={b?.name ?? buildingId} className="mx-auto block max-h-56 object-contain" />
      </div>
      <p className="rounded border border-amber-800/70 bg-amber-950/40 px-3 py-2 text-[14px] text-amber-100">{b?.name ?? buildingId} is part of the live base, drawn here as it stands there. It has no function in the practice sandbox.</p>
      <p className="text-[12px] text-neutral-500">The sandbox runs the Robot Bay, repairs, the Hangar, Operations and reports. Nothing here is saved to the server or your real base.</p>
    </div>
  );
}
