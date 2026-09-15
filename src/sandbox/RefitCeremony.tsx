/**
 * The install ceremony for every upgrade that is not a robot level: an
 * Asset's Service Rank or package, and the Field Workshop.
 *
 * Matt: "Animated upgrades at each level even if its just one item", and the
 * upgrade direction: the asset goes into its shop and the part is visibly
 * replaced, while a fixed structure is upgraded on site. So:
 *
 *   Asset   -> in the Hangar bay, the gantry lifts the old component (or rank
 *              plate) off the Asset's own render and drops the new one on;
 *              at a milestone rank the render itself changes to the next
 *              stage (the existing r10 art).
 *   Workshop -> on site, over Matt's building art, the crane lowers the new
 *              fitting into place.
 *
 * Then the real numbers: the live attributes (shared/upgrades.ts) for an
 * Asset, the sandbox's own test-only Workshop factors for the Workshop.
 * Skippable; skipping or finishing records it as seen. Reduced motion opens
 * on the finished result.
 */
import {type ReactNode, useEffect, useState} from 'react';
import {assetArtUrl} from '../../shared/assetVisuals';
import {type Refit, type TaskAsset, assetOf, assetStats, workshopArmour, workshopRepairFactor} from '../../shared/sandbox';
import {PACKAGE_ATTRIBUTE, PACKAGE_LABEL, type Packages} from '../../shared/upgrades';
import {AssetKitGroup, AssetKitPartGroup, KIT_VIEWBOX, RankPlateGroup, WORKSHOP_VIEWBOX, WorkshopFittingGroup, WorkshopFittingsGroup} from './RefitArt';
import {TempArtTag, primary} from './ui';

const REVEAL_MS = 3300;
const ART = 230;

const ATTR_LABEL = {firepower: 'Firepower', armour: 'Armour', mobility: 'Mobility', range: 'Range', detection: 'Detection'} as const;

function Arms() {
  return (
    <>
      <div className="sbx-arm absolute top-0" style={{left: '24%'}} aria-hidden="true">
        <div className="mx-auto h-24 w-2.5 rounded bg-gradient-to-b from-neutral-600 to-neutral-400" />
        <div className="-mt-1 h-3 w-8 rounded-sm bg-amber-500" />
      </div>
      <div className="sbx-arm absolute top-0" style={{right: '24%'}} aria-hidden="true">
        <div className="mx-auto h-24 w-2.5 rounded bg-gradient-to-b from-neutral-600 to-neutral-400" />
        <div className="-mt-1 h-3 w-8 rounded-sm bg-amber-500" />
      </div>
    </>
  );
}

function Rows({rows}: {rows: Array<[string, string, string, boolean]>}) {
  return (
    <>
      {rows.map(([name, b, a, up]) => (
        <div key={name} className="flex items-baseline justify-between border-b border-neutral-800/70 py-1 text-[14px] last:border-0">
          <span className="text-neutral-400">{name}</span>
          <span className="font-mono">
            {b} → <span className={up ? 'text-emerald-300' : ''}>{a}</span>
          </span>
        </div>
      ))}
    </>
  );
}

const fmt = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

/** The Asset as it was before this refit (the engine records only the changed track). */
function assetBefore(refit: Extract<Refit, {kind: 'asset-rank' | 'asset-package'}>, now: TaskAsset): {rank: number; packages: Packages} {
  if (refit.kind === 'asset-rank') return {rank: refit.from, packages: now.packages};
  return {rank: now.rank, packages: {...now.packages, [refit.pkg]: refit.from}};
}

export default function RefitCeremony({refit, assets, reduced, onDone}: {refit: Refit; assets: TaskAsset[]; reduced: boolean; onDone: () => void}) {
  const [revealed, setRevealed] = useState(reduced);
  useEffect(() => {
    if (reduced) return;
    const id = window.setTimeout(() => setRevealed(true), REVEAL_MS);
    return () => window.clearTimeout(id);
  }, [reduced]);

  let title: string;
  let removed: string;
  let fitted: string;
  let rows: Array<[string, string, string, boolean]>;
  let stage: ReactNode;
  let note: string;

  if (refit.kind === 'workshop') {
    title = `Field Workshop · Level ${refit.to}`;
    removed = `Level ${refit.from} yard`;
    fitted = `Level ${refit.to} fitting`;
    rows = [
      ['Damage taken', `x${workshopArmour(refit.from).toFixed(2)}`, `x${workshopArmour(refit.to).toFixed(2)}`, workshopArmour(refit.to) < workshopArmour(refit.from)],
      ['Robot repair time', `x${workshopRepairFactor(refit.from).toFixed(2)}`, `x${workshopRepairFactor(refit.to).toFixed(2)}`, workshopRepairFactor(refit.to) < workshopRepairFactor(refit.from)],
    ];
    note = 'Upgraded on site. Workshop numbers are sandbox test-only; the fittings are temporary prototype art over the existing building art.';
    const w = 340;
    const h = (w * WORKSHOP_VIEWBOX.height) / WORKSHOP_VIEWBOX.width;
    stage = (
      <div className="relative" style={{width: w, height: h}}>
        <img src="/base/building-fabrication-shop.webp" alt="Field Workshop" className="absolute inset-0 h-full w-full" />
        <svg viewBox={`0 0 ${WORKSHOP_VIEWBOX.width} ${WORKSHOP_VIEWBOX.height}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
          <WorkshopFittingsGroup level={refit.to} hide={revealed ? null : refit.to} highlight={revealed ? refit.to : null} />
        </svg>
        {!revealed && (
          <>
            <svg viewBox={`0 0 ${WORKSHOP_VIEWBOX.width} ${WORKSHOP_VIEWBOX.height}`} className="sbx-part-in pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
              <WorkshopFittingGroup level={refit.to} />
            </svg>
            <div className="sbx-weld-burst pointer-events-none absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 rounded-full bg-amber-200/70 blur-md" />
            <div className="sbx-power-flash pointer-events-none absolute inset-0 rounded-full bg-amber-200/30 blur-2xl" />
          </>
        )}
      </div>
    );
  } else {
    const now = assets.find((a) => a.assetId === refit.assetId);
    const asset = assetOf(refit.assetId);
    if (!now || !asset) return null;
    const before = assetBefore(refit, now);
    const b = assetStats({assetId: now.assetId, ...before});
    const a = assetStats(now);
    const keys = refit.kind === 'asset-package' ? [PACKAGE_ATTRIBUTE[refit.pkg]] : (['firepower', 'armour', 'mobility', 'range', 'detection'] as const);
    rows = [
      ...keys.map((k): [string, string, string, boolean] => [ATTR_LABEL[k], fmt(b.attributes[k]), fmt(a.attributes[k]), a.attributes[k] > b.attributes[k]]),
      ['Sandbox max HP', String(b.maxHp), String(a.maxHp), a.maxHp > b.maxHp],
      ['Sandbox volley', String(b.volley), String(a.volley), a.volley > b.volley],
    ];
    const oldUrl = assetArtUrl(refit.assetId, before.rank);
    const newUrl = assetArtUrl(refit.assetId, now.rank);
    const renderChanges = oldUrl !== newUrl;
    if (refit.kind === 'asset-rank') {
      title = `${asset.name} · Service Rank ${refit.to}`;
      removed = `Rank ${refit.from} plate`;
      fitted = renderChanges ? `Rank ${refit.to} plate and the milestone render` : `Rank ${refit.to} plate`;
    } else {
      title = `${asset.name} · ${PACKAGE_LABEL[refit.pkg]} ${refit.to}`;
      removed = refit.from === 1 ? `Empty ${PACKAGE_LABEL[refit.pkg]} mount` : `${PACKAGE_LABEL[refit.pkg]} ${refit.from} module`;
      fitted = `${PACKAGE_LABEL[refit.pkg]} ${refit.to} module`;
    }
    note = `Attributes are the live game's (Service Rank and packages, shared/upgrades.ts). Sandbox HP and volley use them with test-only scaling. The ${renderChanges ? 'rank 10 render is existing art; the ' : ''}kit and rank plate are temporary prototype art.`;
    const hidePart = refit.kind === 'asset-rank' ? 'rank' : refit.pkg;
    stage = (
      <div className="relative" style={{width: ART, height: ART}}>
        {renderChanges && !revealed && oldUrl && <img src={oldUrl} alt="" className="sbx-render-out absolute inset-0 h-full w-full object-contain" />}
        {newUrl && <img src={newUrl} alt={`${asset.name} rank ${now.rank}`} className={`absolute inset-0 h-full w-full object-contain ${renderChanges && !revealed ? 'sbx-render-in' : ''} ${revealed ? 'sbx-powered' : ''}`} />}
        <svg viewBox={`0 0 ${KIT_VIEWBOX} ${KIT_VIEWBOX}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
          <AssetKitGroup category={asset.category} packages={now.packages} rank={now.rank} hide={revealed ? null : hidePart} highlight={revealed ? hidePart : null} />
        </svg>
        {!revealed && (
          <>
            <svg viewBox={`0 0 ${KIT_VIEWBOX} ${KIT_VIEWBOX}`} className="sbx-part-out pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
              {refit.kind === 'asset-rank' ? <RankPlateGroup rank={refit.from} /> : <AssetKitPartGroup category={asset.category} pkg={refit.pkg} level={refit.from} />}
            </svg>
            <svg viewBox={`0 0 ${KIT_VIEWBOX} ${KIT_VIEWBOX}`} className="sbx-part-in pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
              {refit.kind === 'asset-rank' ? <RankPlateGroup rank={refit.to} /> : <AssetKitPartGroup category={asset.category} pkg={refit.pkg} level={refit.to} />}
            </svg>
            <div className="sbx-weld-burst pointer-events-none absolute left-1/2 top-1/3 h-14 w-14 -translate-x-1/2 rounded-full bg-amber-200/70 blur-md" />
            <div className="sbx-power-flash pointer-events-none absolute inset-0 rounded-full bg-cyan-300/40 blur-2xl" />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#05080a] text-neutral-100" role="dialog" aria-label={`Upgrade: ${title}`}>
      <div className="flex items-center justify-between px-3" style={{paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)'}}>
        <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-amber-300">{refit.kind === 'workshop' ? 'On site' : 'Hangar bay'}</p>
        {!revealed && (
          <button className="min-h-11 px-3 text-[14px] text-neutral-300 underline underline-offset-4" onClick={() => setRevealed(true)}>
            Skip
          </button>
        )}
      </div>
      <p className="px-3 text-center text-[16px] font-bold">{title}</p>
      <div className={`relative mx-auto mt-1 flex w-full max-w-sm flex-1 items-center justify-center overflow-hidden ${reduced ? 'sbx-still' : ''}`} style={{minHeight: ART + 60}}>
        <div className="absolute inset-x-6 bottom-6 top-4 rounded-t-[40px] border-2 border-amber-900/60 bg-gradient-to-b from-[#1a1710] via-[#12100b] to-[#0a0907]" />
        <div className="absolute inset-x-10 bottom-4 h-5 rounded-full bg-amber-900/30 blur-[1px]" />
        <Arms />
        <div className="relative">{stage}</div>
      </div>
      <div className="mx-auto w-full max-w-sm px-3" style={{paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)'}}>
        <p className="text-center text-[14px] leading-snug text-neutral-300">
          Removed <b className="text-neutral-100">{removed}</b>
          <br />
          Fitted <b className="text-amber-200">{fitted}</b>
        </p>
        <div className={`mt-2 rounded-lg border border-neutral-800 bg-black/40 px-3 py-1 transition-opacity duration-500 ${revealed ? 'opacity-100' : 'opacity-0'}`} aria-hidden={!revealed}>
          <Rows rows={rows} />
        </div>
        <p className={`mt-1 text-[11px] leading-snug text-neutral-500 ${revealed ? '' : 'invisible'}`}>{note}</p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <TempArtTag />
          <button className={`${primary} flex-1`} disabled={!revealed} onClick={onDone}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
