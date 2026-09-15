/**
 * The Field Sandbox screen (/sandbox): a private, single-player test of the
 * Season 1 loop on a sector map.
 *
 *   pick a target -> choose the robot troops and Assets -> march
 *   -> the Task Force attacks (or holds) and the fight plays out on the map
 *   -> Victory or Defeat, the battle report, the column comes home
 *   -> Robot Bay: repair, remanufacture, and a new part every level
 *   -> Hangar: repair Assets by the live repair bill
 *   -> Operations: today's Season 1 objectives, lanes and the Cache
 *
 * Everything shown comes from shared/sandbox.ts and lives in this browser
 * (src/sandbox/store.ts). There is no API call on this screen, so it works
 * signed out, and nothing on it can reach a real base, wallet, battle record
 * or PvP statistic. Every animation is drawn from state the engine already
 * decided (beats.ts, SectorMap.tsx), so a reload lands on the same moment.
 */
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {LANES, LANE_COPY, LANES_FOR_CACHE, cacheReward, laneReward} from '../../shared/season1Ops';
import {EXERCISES} from '../../shared/exercises';
import {
  ROLES,
  type Role,
  type SandboxAction,
  type SandboxState,
  SANDBOX_LANE_TRIGGER,
  SUPPLY_KINDS,
  TUTORIAL,
  assetNeedsRepair,
  assetOf,
  assetRepairQuote,
  assetStats,
  battleCasualties,
  nextAssetPackage,
  nextAssetRank,
  SANDBOX_ASSET_RANK_CAP,
  type TaskAsset,
  companyLevel,
  describeEvent,
  describeReward,
  enemyTotals,
  findSite,
  forceTotals,
  isDrone,
  lanesDone,
  marchSeconds,
  partsAt,
  robotNeedsRepair,
  robotStats,
  sandboxDay,
  sandboxNow,
  sandboxWeek,
  seasonObjectives,
  siteEnemies,
  siteLabel,
  siteReward,
  siteStrength,
  tutorialSay,
} from '../../shared/sandbox';
import {SANDBOX_SEASON_1_TEST} from '../../shared/sandboxSeason';
import {assetArtUrl} from '../../shared/assetVisuals';
import {PACKAGE_ATTRIBUTE, PACKAGE_KEYS, PACKAGE_LABEL} from '../../shared/upgrades';
import {AssetKitOverlay} from './RefitArt';
import RefitCeremony from './RefitCeremony';
import {battleFrame} from './beats';
import InstallCeremony from './InstallCeremony';
import RobotBay from './RobotBay';
import {RobotFigure} from './RobotFigure';
import SectorMap from './SectorMap';
import {SANDBOX_STORAGE_KEY, dispatchSandbox, openSandbox, resetSandbox} from './store';
import {Bar, CostLine, SUPPLY_LABEL, SUPPLY_TONE, Section, Sheet, TempArtTag, clock, minutesLabel, primary, secondary, testButton} from './ui';
import './sandbox.css';

const CONFIG = SANDBOX_SEASON_1_TEST;
const ROUND_MS = CONFIG.roundSeconds * 1000;
/** Accidental double taps are closer together than this. */
const TAP_GUARD_MS = 350;

type SheetKind = null | 'bay' | 'hangar' | 'ops' | 'more';

function actionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function useReducedMotion(): boolean {
  const query = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const [reduced, setReduced] = useState(() => !!query?.matches);
  useEffect(() => {
    if (!query) return;
    const on = () => setReduced(query.matches);
    query.addEventListener?.('change', on);
    return () => query.removeEventListener?.('change', on);
  }, [query]);
  return reduced;
}

export default function Sandbox() {
  const storage = typeof window !== 'undefined' ? window.localStorage : null;
  const reduced = useReducedMotion();
  const opened = useMemo(() => (storage ? openSandbox(storage, Date.now()) : null), [storage]);
  const [state, setState] = useState<SandboxState | null>(opened?.state ?? null);
  const [notice, setNotice] = useState<string | null>(opened?.notice ?? null);
  const [toast, setToast] = useState<{text: string; error: boolean; key: number} | null>(null);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [bayRole, setBayRole] = useState<Role | undefined>(undefined);
  const [riderMode, setRiderMode] = useState<'auto' | 'open' | 'closed'>('auto');
  const [wall, setWall] = useState(() => Date.now());
  const lastTap = useRef(0);

  const reload = useCallback(() => {
    if (!storage) return;
    setState(openSandbox(storage, Date.now()).state);
  }, [storage]);

  const marching = !!state?.march;
  // Smooth frames while a column is out; a slow tick otherwise.
  useEffect(() => {
    let raf = 0;
    let last = 0;
    let lastLoad = 0;
    let interval = 0;
    if (marching && !reduced) {
      const loop = (t: number) => {
        if (t - last > 33) {
          last = t;
          setWall(Date.now());
        }
        if (t - lastLoad > 500) {
          lastLoad = t;
          reload();
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    } else {
      interval = window.setInterval(
        () => {
          setWall(Date.now());
          reload();
        },
        marching ? 250 : 1000,
      );
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === SANDBOX_STORAGE_KEY) reload();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(interval);
      window.removeEventListener('storage', onStorage);
    };
  }, [marching, reduced, reload]);

  useEffect(() => {
    document.title = 'Field Sandbox · World War Rogue';
  }, []);

  const stepIndex = state?.tutorial.step ?? 0;
  useEffect(() => setRiderMode('auto'), [stepIndex]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast((t) => (t?.key === toast.key ? null : t)), toast.error ? 4200 : 3000);
    return () => window.clearTimeout(id);
  }, [toast]);

  if (!storage || !state) {
    return <div className="p-6 text-sm text-neutral-400">The sandbox needs browser storage, which this browser has turned off.</div>;
  }

  const act = (action: SandboxAction) => {
    if (Date.now() - lastTap.current < TAP_GUARD_MS) return;
    lastTap.current = Date.now();
    const r = dispatchSandbox(storage, actionId(), action, Date.now());
    setState(r.state);
    setWall(Date.now());
    if ('error' in r) setToast({text: r.error, error: true, key: Date.now()});
    else if (r.note) setToast({text: r.note, error: false, key: Date.now()});
  };
  const testAdvance = (minutes: number) => act({type: 'clock.advance', minutes: Math.max(1, Math.min(24 * 60, Math.ceil(minutes)))});

  const now = sandboxNow(state, wall);
  const day = sandboxDay(state, now);
  const week = sandboxWeek(day);
  const step = TUTORIAL[state.tutorial.step];
  const want = state.tutorial.completed ? null : step.advance;
  const lvl = companyLevel(state.company.xp);
  const m = state.march;
  const e = state.encounter;
  const frame = e && m && m.phase === 'engaged' && e.marchId === m.id ? battleFrame(e, now, ROUND_MS) : null;
  const report = e && !e.seen && now >= e.endsAt ? e : null;
  const selected = state.selectedSite ? findSite(state, state.selectedSite) : null;
  const patrolId = `d${day}-patrol-${state.stats.patrolWins + 1}`;
  const ceremony = state.lastInstall && state.seenInstallAt !== state.lastInstall.at ? state.lastInstall : null;
  const refit = !ceremony && state.lastRefit && state.seenRefitAt !== state.lastRefit.at ? state.lastRefit : null;
  const needsBay = ROLES.some((r) => state.robots[r].status === 'destroyed' || robotNeedsRepair(state.robots[r]));
  const needsHangar = state.assets.some((a) => assetNeedsRepair(a));
  const riderOpen = riderMode === 'open' || (riderMode === 'auto' && !state.tutorial.completed && !frame && !selected);
  const attention = (on: boolean) => (on ? ' sbx-attention' : '');

  return (
    <div className="sbx-root fixed inset-0 flex flex-col overflow-hidden bg-[#b9ab8a] text-neutral-200">
      {/* HUD */}
      <header className="z-20 bg-[#0d0b08]/92 px-2 pb-1.5 backdrop-blur" style={{paddingTop: 'calc(env(safe-area-inset-top) + 0.35rem)'}}>
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <a href="/" className={`${secondary} inline-flex shrink-0 items-center px-2.5`} aria-label="Back to the game">
            ←
          </a>
          <button className="min-h-11 min-w-0 flex-1 text-left" onClick={() => setSheet('more')} aria-label="Task Force record">
            <span className="flex items-baseline gap-2">
              <span className="truncate text-[14px] font-semibold text-neutral-100">{state.company.name}</span>
              <span className="shrink-0 rounded bg-cyan-900/70 px-1.5 text-[11px] font-bold text-cyan-200">TF LV {lvl.level}</span>
            </span>
            <span className="mt-0.5 block truncate text-[11px] text-neutral-400">
              {CONFIG.seasonName} · week {week} · sandbox day {day + 1}
            </span>
          </button>
          <span className="shrink-0 rounded border border-amber-700/70 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-tight tracking-wider text-amber-300">
            Practice
            <br />
            test build
          </span>
        </div>
        <div className="mx-auto mt-1 grid max-w-xl grid-cols-5 gap-1">
          {SUPPLY_KINDS.map((k) => (
            <div key={k} className="flex items-center gap-1 rounded bg-black/50 px-1 py-1">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{background: SUPPLY_TONE[k]}} aria-hidden="true" />
              <span className="sr-only">{SUPPLY_LABEL[k]}</span>
              <span className="truncate font-mono text-[12px] font-semibold text-neutral-100">{state.supplies[k].toLocaleString()}</span>
            </div>
          ))}
          <div className="flex items-center gap-1 rounded bg-black/50 px-1 py-1" title="test Credits (sandbox only)">
            <span className="shrink-0 text-[8px] font-bold uppercase leading-[1.05] text-amber-300">
              test
              <br />
              Cr
            </span>
            <span className="truncate font-mono text-[12px] font-semibold text-neutral-100">{state.credits.toLocaleString()}</span>
          </div>
        </div>
      </header>

      <main className="relative min-h-0 flex-1">
        <SectorMap
          state={state}
          now={now}
          roundMs={ROUND_MS}
          selectedSite={state.selectedSite}
          pulseSite={want === 'site.select' ? patrolId : null}
          onSelectSite={(id) => act({type: 'site.select', siteId: id})}
          onBaseTap={() => setSheet('bay')}
        />

        {/* General Rider */}
        <div className="pointer-events-none absolute inset-x-2 top-2 z-10 mx-auto max-w-xl">
          {notice && (
            <p className="pointer-events-auto mb-2 flex items-center gap-2 rounded-md border border-amber-700 bg-amber-950/95 px-3 py-1 text-[13px] text-amber-100" role="status">
              <span className="flex-1">{notice}</span>
              <button className="min-h-11 px-2 underline" onClick={() => setNotice(null)}>
                OK
              </button>
            </p>
          )}
          {riderOpen ? (
            <section className="pointer-events-auto flex gap-2 rounded-lg border border-cyan-500/50 bg-[#061319]/90 px-2.5 py-2 shadow-xl backdrop-blur" aria-live="polite">
              <img src="/guide/rider-portrait.webp" alt="General Rider" className="h-10 w-10 shrink-0 rounded-full border-2 border-cyan-400/80 object-cover" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider text-cyan-300">
                  <span>General Rider{state.tutorial.completed ? '' : ` · ${state.tutorial.step + 1}/${TUTORIAL.length}`}</span>
                  <span className="-my-3 flex items-center">
                    {!state.tutorial.completed && (
                      <button className="min-h-11 px-2 text-[12px] normal-case tracking-normal text-neutral-400 underline underline-offset-4" onClick={() => act({type: 'tutorial.skip'})}>
                        Skip
                      </button>
                    )}
                    <button className="min-h-11 min-w-11 text-[18px] leading-none text-cyan-200/80" onClick={() => setRiderMode('closed')} aria-label="Hide General Rider">
                      –
                    </button>
                  </span>
                </p>
                <p className="text-[14px] leading-snug text-neutral-100">{tutorialSay(step)}</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-cyan-200">▸ {step.objective}</p>
                  {!state.tutorial.completed && step.advance === 'next' && (
                    <button className={`${primary} shrink-0 bg-cyan-600 shadow-none hover:bg-cyan-500`} onClick={() => act({type: 'tutorial.next'})}>
                      Next
                    </button>
                  )}
                </div>
              </div>
            </section>
          ) : (
            <button className="pointer-events-auto flex min-h-11 max-w-full items-center gap-2 rounded-full border border-cyan-500/50 bg-[#061319]/90 py-1 pl-1 pr-3 shadow-xl" onClick={() => setRiderMode('open')} aria-label="Show General Rider">
              <img src="/guide/rider-portrait.webp" alt="" className="h-9 w-9 rounded-full border border-cyan-400/80 object-cover" />
              <span className="truncate text-[13px] font-semibold text-cyan-100">▸ {step.objective}</span>
            </button>
          )}
        </div>

        {/* Victory / Defeat */}
        {frame?.result && e && (
          <div className="pointer-events-none absolute inset-x-0 top-[38%] z-10 flex flex-col items-center gap-1 px-4">
            <p className={`sbx-banner rounded-lg border-2 px-6 py-2 text-center text-[24px] font-extrabold uppercase tracking-widest shadow-2xl ${e.status === 'won' ? 'border-amber-300 bg-amber-950/90 text-amber-100' : 'border-red-400 bg-red-950/90 text-red-100'}`} style={{['--dur' as string]: '2600ms'}}>
              {e.status === 'won' ? 'Victory' : e.withdrew ? 'Withdrawn' : 'Defeat'}
            </p>
            <p className="sbx-banner rounded bg-black/70 px-2 text-[13px] font-semibold text-neutral-100" style={{['--dur' as string]: '2600ms'}}>
              {e.kills}/{e.enemiesStart.length} Dominion machines destroyed
            </p>
          </div>
        )}

        {/* Honest label: the robot troops, Dominion machines and fitted kit on the map are provisional. */}
        <p className="pointer-events-none absolute right-2 top-[4.25rem] z-10 max-w-[40%] rounded border border-amber-700/70 bg-black/70 px-1.5 py-0.5 text-right text-[10px] font-semibold uppercase leading-tight tracking-wide text-amber-300" data-testid="map-temp-art">
          Temporary art: robots, Dominion machines, fitted kit
        </p>

        {toast && (
          <p
            key={toast.key}
            role="status"
            className={`absolute inset-x-3 bottom-2 z-30 mx-auto max-w-xl rounded-md border px-3 py-2 text-center text-[13px] font-medium shadow-xl ${toast.error ? 'border-red-800 bg-red-950/95 text-red-100' : 'border-emerald-800 bg-emerald-950/95 text-emerald-100'}`}
          >
            {toast.text}
          </p>
        )}

        {selected && !m && (
          <div key={selected.id} className="contents">
          <TargetCard
            state={state}
            siteId={selected.id}
            attention={want === 'march.start'}
            onClose={() => act({type: 'site.select', siteId: null})}
            onMarch={(robots, assets) => act({type: 'march.start', siteId: selected.id, robots, assets})}
          />
          </div>
        )}
      </main>

      {/* What is happening, and where to go. */}
      <nav className="z-20 bg-[#0d0b08]/95 px-2 pt-1.5 backdrop-blur" style={{paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.4rem)'}}>
        <div className="mx-auto max-w-xl space-y-1.5">
          {m && (
            <div className="flex items-center gap-2 rounded-md border border-neutral-800 bg-black/40 px-2 py-1">
              <div className="min-w-0 flex-1 text-[13px]">
                <p className="truncate font-semibold text-neutral-100">
                  {m.phase === 'outbound' && `Marching on ${siteLabel(findSite(state, m.siteId)?.kind ?? 'patrol')} · ${clock(m.arriveAt - now)}`}
                  {m.phase === 'engaged' && (frame && !frame.over ? `Attacking · round ${frame.round + 1} of ${e!.rounds.length}` : 'Battle over')}
                  {m.phase === 'holding' && `Holding ${siteLabel(findSite(state, m.siteId)?.kind ?? 'patrol')} · ${clock((m.holdUntil ?? now) - now)}`}
                  {m.phase === 'returning' && `Returning to base · ${clock((m.returnAt ?? now) - now)}`}
                </p>
                {m.phase === 'returning' && m.outcome && <p className="text-[11px] text-neutral-400">{m.outcome === 'won' ? 'Victory' : m.outcome === 'lost' ? 'Defeat: damaged units are coming home' : m.outcome === 'held' ? 'Hold complete, reward banked' : 'Recalled, no reward'}</p>}
              </div>
              {(m.phase === 'outbound' || m.phase === 'holding') && (
                <button className={secondary} onClick={() => act({type: 'march.recall'})}>
                  Recall
                </button>
              )}
              {m.phase !== 'engaged' ? (
                <button className={testButton} onClick={() => act({type: 'clock.skipMarch'})} aria-label="Test clock: skip ahead">
                  Test ⏩
                </button>
              ) : (
                frame &&
                !frame.over && (
                  <button className={testButton} onClick={() => act({type: 'clock.skipMarch'})} aria-label="Test clock: skip the fight">
                    Test ⏩
                  </button>
                )
              )}
            </div>
          )}
          <div className="grid grid-cols-4 gap-1.5">
            <button className={`${secondary} px-1 text-[13px]${attention(want === 'robot.upgrade' || (want === 'recover' && needsBay))}`} onClick={() => setSheet('bay')}>
              Robot Bay{needsBay ? ' •' : ''}
            </button>
            <button className={`${secondary} px-1 text-[13px]${attention(want === 'recover' && !needsBay && needsHangar)}`} onClick={() => setSheet('hangar')}>
              Hangar{needsHangar ? ' •' : ''}
            </button>
            <button className={`${secondary} px-1 text-[13px]${attention(want === 'ops.cache')}`} onClick={() => setSheet('ops')}>
              Operations
            </button>
            <button className={`${secondary} px-1 text-[13px]`} onClick={() => setSheet('more')} aria-label="Record and test controls">
              ☰ More
            </button>
          </div>
        </div>
      </nav>

      {report && !ceremony && !refit && <BattleReport state={state} onDone={() => act({type: 'battle.seen'})} />}

      {ceremony && (
        <div key={ceremony.at} className="contents">
          <InstallCeremony install={ceremony} reduced={reduced} onDone={() => act({type: 'install.seen'})} />
        </div>
      )}

      {refit && (
        <div key={refit.at} className="contents">
          <RefitCeremony refit={refit} assets={state.assets} reduced={reduced} onDone={() => act({type: 'refit.seen'})} />
        </div>
      )}

      {sheet === 'bay' && (
        <Sheet title="Robot Bay" onClose={() => setSheet(null)}>
          <RobotBay
            state={state}
            now={now}
            busy={false}
            initialRole={bayRole ?? ROLES.find((r) => state.robots[r].status === 'destroyed' || robotNeedsRepair(state.robots[r]))}
            onAct={(a) => {
              if ('role' in a) setBayRole(a.role);
              act(a);
            }}
            onTestAdvance={testAdvance}
          />
        </Sheet>
      )}
      {sheet === 'hangar' && (
        <Sheet title="Hangar · Task Force Assets" onClose={() => setSheet(null)}>
          <Hangar state={state} now={now} onAct={act} onTestAdvance={testAdvance} />
        </Sheet>
      )}
      {sheet === 'ops' && (
        <Sheet title="Operations" onClose={() => setSheet(null)}>
          <Operations state={state} now={now} onAct={act} />
        </Sheet>
      )}
      {sheet === 'more' && (
        <Sheet title="Record and test controls" onClose={() => setSheet(null)}>
          <More
            state={state}
            now={now}
            onAct={act}
            onReset={() => {
              if (window.confirm('Reset the sandbox? This clears the practice Task Force only.')) {
                setState(resetSandbox(storage, Date.now()));
                setToast({text: 'Sandbox reset.', error: false, key: Date.now()});
                setSheet(null);
              }
            }}
          />
        </Sheet>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Target card and force picker                                               */
/* -------------------------------------------------------------------------- */

function TargetCard({state, siteId, attention, onClose, onMarch}: {state: SandboxState; siteId: string; attention: boolean; onClose: () => void; onMarch: (robots: Role[], assets: string[]) => void}) {
  const site = findSite(state, siteId)!;
  const readyRobots = ROLES.filter((r) => state.robots[r].status === 'ready');
  const readyAssets = state.assets.filter((a) => a.status === 'ready').map((a) => a.assetId);
  const [robots, setRobots] = useState<Role[]>(readyRobots);
  const [assets, setAssets] = useState<string[]>(readyAssets);
  const done = state.cleared.includes(site.id);
  const enemies = siteEnemies(site, state);
  const ours = forceTotals(state, robots, assets);
  const theirs = enemyTotals(enemies, siteStrength(site, state));
  const reward = siteReward(site, state);
  const spec = site.kind === 'patrol' || site.kind === 'rival_base' ? null : EXERCISES[site.kind];
  const toggle = <T,>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);
  const counts = enemies.reduce<Record<string, number>>((acc, x) => ({...acc, [x.kind]: (acc[x.kind] ?? 0) + 1}), {});

  return (
    <div className="absolute inset-x-2 bottom-2 z-20 mx-auto max-h-[70%] max-w-xl overflow-y-auto rounded-xl border border-neutral-700 bg-[#0d0b08]/96 p-3 shadow-2xl" role="dialog" aria-label={siteLabel(site.kind)}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[16px] font-bold text-neutral-100">{siteLabel(site.kind)}</p>
          <p className="text-[12px] uppercase tracking-wide text-neutral-400">{site.battle ? 'Battle' : 'March and hold'} · march {marchSeconds(site)} s{done ? ' · done today' : ''}</p>
        </div>
        <button className={secondary} onClick={onClose}>
          Close
        </button>
      </div>
      <p className="mt-1 text-[13px] leading-snug text-neutral-300">
        {spec ? `${spec.blurb} ${spec.action}.` : site.kind === 'patrol' ? 'A Dominion patrol loose on the flats. It grows stronger after every win. Test-only enemies and reward.' : 'A simulated rival commander base for practising a base attack. Not a real player: kills are training kills, confirmed PvP stays 0, and it pays nothing because base-attack loot is not decided.'}
      </p>
      <p className="mt-1 text-[13px] text-amber-200">{reward ? `Reward: ${describeReward(reward)}` : 'Reward: none (practice mock)'}</p>

      {site.battle && (
        <div className="mt-2 grid grid-cols-2 gap-2 text-[12px]">
          <div className="rounded border border-cyan-900 bg-cyan-950/30 p-2">
            <p className="font-semibold text-cyan-200">Your Task Force</p>
            <p className="font-mono text-neutral-200">HP {ours.hp} · firepower {ours.firepower}/round</p>
          </div>
          <div className="rounded border border-red-900 bg-red-950/30 p-2">
            <p className="font-semibold text-red-200">{Object.entries(counts).map(([k, n]) => `${n} ${k === 'walker' ? 'Walker' : 'Crawler'}${n > 1 ? 's' : ''}`).join(', ')}</p>
            <p className="font-mono text-neutral-200">HP {theirs.hp} · firepower {theirs.firepower}/round</p>
          </div>
          <p className="col-span-2 text-[11px] text-neutral-500">Plain totals, not a prediction: the Scout's mark, the Support's repairs and who gets targeted decide the fight.</p>
        </div>
      )}

      <p className="mt-2 text-[12px] font-semibold uppercase tracking-wide text-neutral-400">Robot troops</p>
      <div className="mt-1 grid grid-cols-3 gap-1.5">
        {ROLES.map((r) => {
          const robot = state.robots[r];
          const ok = robot.status === 'ready';
          const on = robots.includes(r);
          return (
            <button key={r} disabled={!ok} aria-pressed={on} onClick={() => setRobots(toggle(robots, r))} className={`flex min-h-11 flex-col items-center rounded-md border px-1 py-1 text-[12px] disabled:opacity-40 ${on ? 'border-cyan-400 bg-cyan-950/50' : 'border-neutral-700 bg-neutral-900'}`}>
              <RobotFigure role={r} parts={partsAt(robot.level)} height={46} status={robot.status === 'destroyed' || robot.status === 'disabled' ? robot.status : 'ready'} />
              <span className="font-semibold">
                {CONFIG.roles[r].label} <span className="font-mono text-[11px]">Lv {robot.level}</span>
              </span>
              <span className="text-[11px] text-neutral-400">{ok ? `${Math.round(robot.hp)}/${robotStats(r, robot.level).maxHp} HP` : robot.status}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[12px] font-semibold uppercase tracking-wide text-neutral-400">Assets</p>
      <div className="mt-1 grid grid-cols-3 gap-1.5">
        {state.assets.map((a) => {
          const asset = assetOf(a.assetId);
          const ok = a.status === 'ready';
          const on = assets.includes(a.assetId);
          const url = assetArtUrl(a.assetId, a.rank);
          return (
            <button key={a.assetId} disabled={!ok} aria-pressed={on} onClick={() => setAssets(toggle(assets, a.assetId))} className={`flex min-h-11 flex-col items-center rounded-md border px-1 py-1 text-[12px] disabled:opacity-40 ${on ? 'border-cyan-400 bg-cyan-950/50' : 'border-neutral-700 bg-neutral-900'}`}>
              {url && <img src={url} alt="" className="h-11 w-11 object-contain" />}
              <span className="font-semibold">{asset?.name}</span>
              <span className="text-[11px] text-neutral-400">{ok ? `R${a.rank} · ${Math.round(a.hp)}/${assetStats(a).maxHp} HP${isDrone(a.assetId) ? ' · drone' : ''}` : a.status}</span>
            </button>
          );
        })}
      </div>
      <button
        className={`${primary} mt-3 w-full text-[16px]${attention ? ' sbx-attention' : ''}`}
        disabled={done || robots.length === 0 || !assets.some(isDrone)}
        onClick={() => onMarch(robots, assets)}
      >
        {done ? 'Done today' : robots.length === 0 ? 'Pick at least one robot troop' : !assets.some(isDrone) ? 'A Task Force needs its drone' : site.battle ? `Attack · ${robots.length + assets.length} units` : `March · ${robots.length + assets.length} units`}
      </button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Battle report                                                              */
/* -------------------------------------------------------------------------- */

function BattleReport({state, onDone}: {state: SandboxState; onDone: () => void}) {
  const e = state.encounter!;
  const cas = battleCasualties(e);
  const [log, setLog] = useState(false);
  const won = e.status === 'won';
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60">
      <div className="mx-auto max-h-[88dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl border-t border-neutral-700 bg-[#0d0b08] px-3 pt-3" style={{paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)'}} role="dialog" aria-label="Battle report">
        <p className={`text-center text-[26px] font-extrabold uppercase tracking-widest ${won ? 'text-amber-200' : 'text-red-300'}`}>{won ? 'Victory' : e.withdrew ? 'Withdrawn' : 'Defeat'}</p>
        <p className="text-center text-[13px] text-neutral-400">
          {siteLabel(e.siteKind)} · {e.rounds.length} round{e.rounds.length === 1 ? '' : 's'} · target {e.kills === e.enemiesStart.length ? 'destroyed' : `${e.kills} of ${e.enemiesStart.length} destroyed`}
        </p>
        <div className="mt-3 space-y-2">
          <Section title="Result">
            <p className="text-[14px] text-neutral-100">{e.reward ? `Brought home: ${describeReward(e.reward)}` : won ? 'No loot: practice mock target.' : 'No reward.'}</p>
            <p className="text-[13px] text-neutral-300">+{e.xp} Task Force XP · +{e.kills} training kills (NPC)</p>
            <p className="text-[12px] text-neutral-500">Confirmed PvP destructions: 0. They count only real battles against other commanders.</p>
          </Section>
          <Section title="Task Force">
            <ul className="space-y-1 text-[13px]">
              {ROLES.filter((r) => e.after.robots[r]).map((r) => {
                const a = e.after.robots[r]!;
                const b = e.before.robots[r]!;
                const max = robotStats(r, state.robots[r].level).maxHp;
                return (
                  <li key={r} className="flex items-center gap-2">
                    <RobotFigure role={r} parts={partsAt(state.robots[r].level)} height={34} status={a.status === 'destroyed' || a.status === 'disabled' ? a.status : 'ready'} />
                    <span className="flex-1">
                      {CONFIG.roles[r].label} Lv {state.robots[r].level}: {a.status === 'destroyed' ? <b className="text-red-300">destroyed - remanufacture at base, keeps level and parts</b> : a.status === 'disabled' ? <b className="text-amber-300">disabled - repair at base</b> : `${Math.round(b.hp)} → ${Math.round(a.hp)} / ${max} HP`}
                    </span>
                  </li>
                );
              })}
              {Object.entries(e.after.assets).map(([id, a]) => {
                const held = state.assets.find((x) => x.assetId === id)!;
                const max = assetStats(held).maxHp;
                const url = assetArtUrl(id, held.rank);
                return (
                  <li key={id} className="flex items-center gap-2">
                    {url && <img src={url} alt="" className={`h-9 w-9 object-contain ${a.status === 'disabled' ? 'brightness-50' : ''}`} />}
                    <span className="flex-1">
                      {assetOf(id)?.name}: {a.status === 'disabled' ? <b className="text-amber-300">knocked out - repair in the Hangar</b> : `${Math.round(e.before.assets[id].hp)} → ${Math.round(a.hp)} / ${max} HP`}
                    </span>
                  </li>
                );
              })}
            </ul>
            {(cas.destroyed.length > 0 || cas.disabled.length > 0 || cas.assetsDisabled.length > 0) && <p className="mt-1 text-[12px] text-neutral-400">Damaged Assets drive home slower, as in the live game.</p>}
          </Section>
          <button className={`${secondary} w-full`} onClick={() => setLog(!log)}>
            {log ? 'Hide' : 'Show'} round by round
          </button>
          {log && (
            <ol className="max-h-56 space-y-1 overflow-y-auto rounded border border-neutral-800 p-2 font-mono text-[12px] leading-relaxed text-neutral-300">
              {e.rounds.map((events, i) => (
                <li key={i}>
                  <b className="text-neutral-100">Round {i + 1}.</b> {events.map((ev) => describeEvent(ev, e.enemiesStart)).join(' ')}
                </li>
              ))}
            </ol>
          )}
          <button className={`${primary} w-full text-[16px]`} onClick={onDone}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Hangar, Operations, More                                                   */
/* -------------------------------------------------------------------------- */

/** An Asset's own render at its rank, with its fitted kit drawn over it. */
function AssetPortrait({a, size, dim}: {a: TaskAsset; size: number; dim?: boolean}) {
  const asset = assetOf(a.assetId);
  const url = assetArtUrl(a.assetId, a.rank);
  return (
    <div className="relative shrink-0" style={{width: size, height: size}}>
      {url && <img src={url} alt={`${asset?.name ?? a.assetId}, Service Rank ${a.rank}`} className={`absolute inset-0 h-full w-full object-contain ${dim ? 'brightness-50' : ''}`} />}
      {asset && <AssetKitOverlay category={asset.category} packages={a.packages} rank={a.rank} className="absolute inset-0 h-full w-full" />}
    </div>
  );
}

const ATTR_LABEL = {firepower: 'Firepower', armour: 'Armour', mobility: 'Mobility', range: 'Range', detection: 'Detection'} as const;
const two = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

function Hangar({state, now, onAct, onTestAdvance}: {state: SandboxState; now: number; onAct: (a: SandboxAction) => void; onTestAdvance: (minutes: number) => void}) {
  const [open, setOpen] = useState<string>('');
  return (
    <>
      <p className="px-1 text-[12px] leading-snug text-neutral-400">
        Service Rank and the four packages use the live game's rules and attributes. Prices are the live provisional step prices, paid here in <b>test Credits</b> (you have {state.credits.toLocaleString()}). Upgrades are instant, as in the live game.
      </p>
      {state.assets.map((a) => {
        const asset = assetOf(a.assetId);
        const st = assetStats(a);
        const q = assetRepairQuote(a);
        const out = !!state.march && state.march.assets.includes(a.assetId);
        const rank = nextAssetRank(a);
        const expanded = open === a.assetId;
        return (
          <div key={a.assetId}>
            <Section title={`${asset?.name ?? a.assetId} · ${asset?.code ?? ''}`} right={<span className="text-[12px] text-neutral-400">Service Rank {a.rank}/{SANDBOX_ASSET_RANK_CAP}</span>}>
              <div className="flex gap-3">
                <AssetPortrait a={a} size={112} dim={a.status === 'disabled'} />
                <div className="min-w-0 flex-1 space-y-1">
                  <Bar value={a.hp} max={st.maxHp} tone={a.hp / st.maxHp > 0.5 ? 'bg-emerald-500' : 'bg-amber-500'} label="HP" />
                  <p className="font-mono text-[12px] text-neutral-300">
                    {Math.round(a.hp)} / {st.maxHp} HP · volley {st.volley}
                  </p>
                  <p className={`text-[13px] font-semibold ${a.status === 'ready' ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {out ? 'Out with the Task Force' : a.status === 'repairing' ? `Repairing · ${clock((a.job?.completesAt ?? now) - now)}` : a.status === 'disabled' ? 'Knocked out' : a.hp < st.maxHp ? 'Damaged' : 'Ready'}
                  </p>
                  <p className="text-[11px] text-neutral-500">
                    {PACKAGE_KEYS.map((k) => `${PACKAGE_LABEL[k]} ${a.packages[k]}`).join(' · ')}
                  </p>
                </div>
              </div>
              {!out && assetNeedsRepair(a) && (
                <div className="mt-2 space-y-2">
                  <p className="text-[12px] text-neutral-400">Repair bill (the live game's formula): {minutesLabel(q.minutes)}.</p>
                  <CostLine cost={q.cost} have={state.supplies} />
                  <button className={`${primary} w-full`} onClick={() => onAct({type: 'asset.repair', assetId: a.assetId})}>
                    Repair {asset?.name}
                  </button>
                </div>
              )}
              {a.status === 'repairing' && a.job && (
                <button className={`${testButton} mt-2 w-full`} onClick={() => onTestAdvance((a.job!.completesAt - now) / 60_000)}>
                  Test: finish repair
                </button>
              )}
              <button className={`${secondary} mt-2 w-full`} aria-expanded={expanded} onClick={() => setOpen(expanded ? '' : a.assetId)}>
                {expanded ? 'Hide upgrades' : `Upgrade ${asset?.name}`}
              </button>
              {expanded && (
                <div className="mt-2 space-y-2">
                  <div className="rounded border border-neutral-800 bg-black/30 p-2">
                    <p className="flex justify-between text-[14px] font-semibold text-neutral-100">
                      <span>Service Rank {a.rank}{rank ? ` → ${rank.to}` : ''}</span>
                      {rank && <span className="font-mono text-amber-200">{rank.credits} test Credits</span>}
                    </p>
                    {rank ? (
                      <>
                        <p className="text-[12px] text-neutral-400">Raises every attribute.{rank.milestone ? ' Milestone: a double step, and the Asset\'s render changes.' : ' The rank plate is replaced.'}</p>
                        {(['firepower', 'armour', 'mobility', 'range', 'detection'] as const).map((k) => (
                          <p key={k} className="flex justify-between font-mono text-[12px]">
                            <span className="font-sans text-neutral-400">{ATTR_LABEL[k]}</span>
                            <span>
                              {two(rank.before.attributes[k])} → <span className="text-emerald-300">{two(rank.after.attributes[k])}</span>
                            </span>
                          </p>
                        ))}
                        <button className={`${primary} mt-1 w-full`} disabled={out || state.credits < rank.credits} onClick={() => onAct({type: 'asset.rank', assetId: a.assetId})}>
                          {out ? 'Out with the Task Force' : state.credits < rank.credits ? `Need ${rank.credits - state.credits} more test Credits` : `Rank up to ${rank.to}`}
                        </button>
                      </>
                    ) : (
                      <p className="text-[12px] text-neutral-400">At the Season 1 cap ({SANDBOX_ASSET_RANK_CAP} ranks a season).</p>
                    )}
                  </div>
                  {PACKAGE_KEYS.map((k) => {
                    const pq = nextAssetPackage(a, k);
                    const attr = PACKAGE_ATTRIBUTE[k];
                    return (
                      <div key={k} className="rounded border border-neutral-800 bg-black/30 p-2">
                        <p className="flex justify-between text-[14px] font-semibold text-neutral-100">
                          <span>
                            {PACKAGE_LABEL[k]} {a.packages[k]}
                            {pq.to ? ` → ${pq.to}` : ''}
                          </span>
                          {pq.to && <span className="font-mono text-amber-200">{pq.credits} test Credits</span>}
                        </p>
                        <p className="flex justify-between font-mono text-[12px]">
                          <span className="font-sans text-neutral-400">{ATTR_LABEL[attr]}</span>
                          <span>
                            {two(pq.before.attributes[attr])}
                            {pq.to ? (
                              <>
                                {' → '}
                                <span className="text-emerald-300">{two(pq.after.attributes[attr])}</span>
                              </>
                            ) : null}
                          </span>
                        </p>
                        {pq.to ? (
                          <button className={`${secondary} mt-1 w-full`} disabled={out || state.credits < pq.credits} onClick={() => onAct({type: 'asset.package', assetId: a.assetId, pkg: k})}>
                            {out ? 'Out with the Task Force' : state.credits < pq.credits ? `Need ${pq.credits - state.credits} more test Credits` : `Fit ${PACKAGE_LABEL[k]} ${pq.to}`}
                          </button>
                        ) : (
                          <p className="text-[11px] text-neutral-500">{a.rank >= SANDBOX_ASSET_RANK_CAP ? 'At the Season 1 cap.' : 'A package can never outrank its Asset: raise the Service Rank first.'}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>
          </div>
        );
      })}
      <p className="px-1 text-[11px] leading-snug text-neutral-500">
        Asset renders are the game's own art: the look changes at rank 10 (the existing r10 render). The fitted kit modules and rank plate drawn over them are <b>temporary prototype art</b> so every upgrade shows a visible part; the Season 1 decisions (2026-09-07) said packages change no visuals, and Matt's 2026-09-15 direction asks for a visible part at every level, so this needs his confirmation. Assets are never destroyed: a knocked-out Asset is repaired. Package reset is not in the sandbox.
      </p>
    </>
  );
}

function Operations({state, now, onAct}: {state: SandboxState; now: number; onAct: (a: SandboxAction) => void}) {
  const day = sandboxDay(state, now);
  const week = sandboxWeek(day);
  const done = lanesDone(state, day);
  const cacheClaimed = state.ledger.includes(`cache:${day}`);
  return (
    <>
      <Section title={`Season objectives · sandbox day ${day + 1}`} right={<TempArtTag className="hidden" />}>
        <ul className="space-y-2">
          {seasonObjectives(state, now).map((o) => (
            <li key={o.id}>
              <p className="flex justify-between text-[14px]">
                <span className={o.done ? 'text-emerald-300' : 'text-neutral-100'}>
                  {o.done ? '✓ ' : ''}
                  {o.label}
                </span>
                <span className="font-mono text-neutral-400">
                  {o.progress}/{o.target}
                </span>
              </p>
              <Bar value={o.progress} max={o.target} tone={o.done ? 'bg-emerald-500' : 'bg-cyan-500'} label={o.label} />
              <p className="text-[11px] text-neutral-500">{o.detail}</p>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Daily Operations" right={<span className="text-[12px] text-neutral-400">{Math.min(done.length, LANES_FOR_CACHE)}/{LANES_FOR_CACHE} for the Cache</span>}>
        <ul className="space-y-1.5">
          {LANES.map((l) => (
            <li key={l} className={`rounded border p-2 text-[13px] ${done.includes(l) ? 'border-emerald-800 bg-emerald-950/30' : 'border-neutral-800'}`}>
              <p className="flex justify-between">
                <b className={done.includes(l) ? 'text-emerald-200' : 'text-neutral-100'}>
                  {done.includes(l) ? '✓ ' : ''}
                  {LANE_COPY[l].label}
                </b>
                <span className="text-[12px] text-amber-200">{describeReward(laneReward(l, week))}</span>
              </p>
              <p className="text-[12px] text-neutral-400">{SANDBOX_LANE_TRIGGER[l] ?? 'Needs an alliance: not available in the sandbox.'}</p>
            </li>
          ))}
        </ul>
        <button className={`${primary} mt-2 w-full`} disabled={cacheClaimed || done.length < LANES_FOR_CACHE} onClick={() => onAct({type: 'ops.cache'})}>
          {cacheClaimed ? "Today's Cache claimed" : `Claim Cache: ${describeReward(cacheReward(week))}`}
        </button>
        <p className="mt-1 text-[11px] text-neutral-500">Lane and Cache rewards are the real Season 1 week {week} table, paid here in practice supplies and test Credits.</p>
      </Section>
    </>
  );
}

function More({state, now, onAct, onReset}: {state: SandboxState; now: number; onAct: (a: SandboxAction) => void; onReset: () => void}) {
  const lvl = companyLevel(state.company.xp);
  const s = state.stats;
  return (
    <>
      <Section title="Task Force" right={<span className="text-[13px] text-neutral-400">Level {lvl.level}</span>}>
        <p className="text-base font-semibold text-neutral-100">{state.company.name}</p>
        <div className="mt-2 flex items-center gap-2">
          <Bar value={lvl.into} max={lvl.need} tone="bg-cyan-500" label="Task Force XP" />
          <span className="shrink-0 font-mono text-[12px] text-neutral-400">
            {lvl.into}/{lvl.need} XP
          </span>
        </div>
        <p className="mt-1 text-[12px] text-neutral-400">Task Force experience stays when a robot is destroyed. Each Task Force level adds 5% damage (test-only).</p>
      </Section>
      <Section title="Service record">
        <dl className="grid grid-cols-2 gap-2 text-[13px]">
          {(
            [
              ['Training kills (NPC)', s.trainingKills],
              ['Battles won / lost', `${s.battlesWon} / ${s.battlesLost}`],
              ['Patrols won', s.patrolWins],
              ['Exercises done', s.exercisesDone],
              ['Robots destroyed', s.robotsDestroyed],
            ] as Array<[string, number | string]>
          ).map(([k, v]) => (
            <div key={k} className="rounded border border-neutral-800 p-2">
              <dt className="text-neutral-400">{k}</dt>
              <dd className="font-mono text-lg text-neutral-100">{v}</dd>
            </div>
          ))}
          <div className="rounded border border-neutral-700 bg-neutral-950 p-2">
            <dt className="text-neutral-400">Confirmed PvP destructions</dt>
            <dd className="font-mono text-lg text-neutral-500">0</dd>
          </div>
        </dl>
        <p className="mt-2 text-[12px] text-neutral-500">Training kills are simulated enemies, including the mock rival base. Confirmed PvP destructions count only real battles against other commanders; the sandbox has none.</p>
      </Section>
      <section className="rounded-lg border-2 border-dashed border-amber-700/70 bg-amber-950/20 p-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Test controls</h2>
        <p className="mt-1 text-[13px] text-amber-100/80">
          These move only this sandbox. They cannot touch your real base, wallet, the server clock or anyone else.
          {state.clockOffsetMs > 0 && ` Sandbox clock is ${minutesLabel(state.clockOffsetMs / 60_000)} ahead.`}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {[1, 5, 30].map((mins) => (
            <button key={mins} className={secondary} onClick={() => onAct({type: 'clock.advance', minutes: mins})}>
              +{mins} min
            </button>
          ))}
          <button className={secondary} onClick={() => onAct({type: 'clock.nextDay'})}>
            Next sandbox day
          </button>
          <button className={secondary} onClick={() => onAct({type: 'test.supplies'})}>
            +5,000 test supplies
          </button>
          <button className={`${secondary} text-red-300`} onClick={onReset}>
            Reset sandbox
          </button>
        </div>
        <p className="mt-2 text-[11px] text-amber-100/60">
          Config: {CONFIG.label} ({CONFIG.id} v{CONFIG.version}). Robot, enemy, patrol, repair and timer numbers are test-only, not economy rulings. Sandbox time now: day {sandboxDay(state, now) + 1}.
        </p>
      </section>
    </>
  );
}
