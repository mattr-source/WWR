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
import {
  ROLES,
  type Role,
  type SandboxAction,
  type SandboxState,
  SANDBOX_LANE_TRIGGER,
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
  forceTotals,
  lanesDone,
  partsAt,
  robotNeedsRepair,
  robotStats,
  sandboxDay,
  sandboxNow,
  sandboxWeek,
  seasonObjectives,
  siteEnemies,
  siteLabel,
  siteStrength,
  tutorialSay,
  type Site,
  squadDeployment,
} from '../../shared/sandbox';
import {SANDBOX_SEASON_1_TEST} from '../../shared/sandboxSeason';
import {assetArtUrl} from '../../shared/assetVisuals';
import {PACKAGE_ATTRIBUTE, PACKAGE_KEYS, PACKAGE_LABEL} from '../../shared/upgrades';
import {AssetKitOverlay, serviceItemFor} from './RefitArt';
import RefitCeremony from './RefitCeremony';
import {battleFrame} from './beats';
import InstallCeremony from './InstallCeremony';
import RobotBay from './RobotBay';
import {RobotFigure} from './RobotFigure';
import Comms from './Comms';
import {ArtCard, BuildingImg, BuildingInfo, RepairYard} from './BasePanels';
import {BUILDING_ROLE, buildingLabel} from './baseRoles';
import SeasonHub from './SeasonHub';
import {GameClock} from './original/GameClock';
import SandboxBaseBoard from './original/SandboxBaseBoard';
import SandboxGuide from './original/SandboxGuide';
import {AccountPanel, Reports, SquadSetup} from './original/SandboxPanels';
import WorldView, {marchLine} from './original/WorldView';
import {t} from './original/strings';
import {BOARD_BUILDINGS, type BuildingEntry} from '../../shared/base';
import {SANDBOX_STORAGE_KEY, dispatchSandbox, openSandbox, resetSandbox} from './store';
import {Bar, CostLine, Section, Sheet, TempArtTag, clock, minutesLabel, primary, secondary, testButton} from './ui';
import './sandbox.css';
import './refitArt.css';

const CONFIG = SANDBOX_SEASON_1_TEST;
const ROUND_MS = CONFIG.roundSeconds * 1000;
/** Accidental double taps are closer together than this. */
const TAP_GUARD_MS = 350;

type SheetKind = null | 'bay' | 'hangar' | 'ops' | 'more' | 'repair' | 'info' | 'season' | 'squad' | 'reports';
type Scene = 'base' | 'world';

/**
 * The scene lives in the URL hash, so a reload lands on the same view without another storage key.
 * No hash opens the World view, as the live game does (LiveApp.tsx: "The map, not the base").
 */
function sceneFromHash(): Scene {
  return typeof window !== 'undefined' && window.location.hash === '#base' ? 'base' : 'world';
}

/** The practice Task Force's Asset for each runway building's category (shared/base.ts entries). */
const ASSET_OF_CATEGORY: Partial<Record<string, string>> = Object.fromEntries(CONFIG.taskForceAssets.map((id) => [assetOf(id)?.category ?? id, id]));

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
  const [scene, setSceneState] = useState<Scene>(sceneFromHash);
  const [hangarFocus, setHangarFocus] = useState<string | null>(null);
  const [infoBuilding, setInfoBuilding] = useState<string | null>(null);
  const setScene = useCallback((next: Scene) => {
    setSceneState(next);
    if (typeof window !== 'undefined') window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${next}`);
  }, []);
  useEffect(() => {
    const onHash = () => setSceneState(sceneFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const [bayRole, setBayRole] = useState<Role | undefined>(undefined);
  const [commsOpen, setCommsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [guideH, setGuideH] = useState(0);
  const [squadView, setSquadView] = useState('Alpha');
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
  const patrolId = `d${day}-patrol-${state.stats.patrolWins + 1}`;
  const ceremony = state.lastInstall && state.seenInstallAt !== state.lastInstall.at ? state.lastInstall : null;
  const refit = !ceremony && state.lastRefit && state.seenRefitAt !== state.lastRefit.at ? state.lastRefit : null;
  const inSheet = sheet !== null || commsOpen || menuOpen || !!report || !!ceremony || !!refit;
  const deploy = squadDeployment(state);
  // Where General Rider points: the live guide's data-guide outline, on whichever view the step is on.
  const worldStep = want === 'site.select' || want === 'march.start' || want === 'march.arrive' || want === 'battle.seen' || want === 'march.home';
  const baseTarget = want === 'robot.upgrade' || want === 'upgrade.done' ? 'building:fabrication_shop' : want === 'recover' ? 'building:recovery_yard' : want === 'ops.cache' ? 'building:tactical_operations_center' : null;
  const highlight = !want
    ? null
    : scene === 'world'
      ? want === 'march.start'
        ? 'attack'
        : want === 'march.arrive' || want === 'march.home'
          ? 'squads-out'
          : baseTarget
            ? 'my-base'
            : null
      : worldStep
        ? 'world-map'
        : baseTarget;
  const chatH = 48;
  // General Rider unmounts when the walkthrough ends (skipped or finished), so his last reported height must not linger.
  // The guide dock stands 4 px above the Comms bar (bottom 3.25rem), so its inset includes that gap.
  const bottomInset = chatH + (state.tutorial.completed || guideH === 0 ? 0 : guideH + 4);
  const fightOver = frame ? frame.over : null;
  const line = marchLine(state, now, fightOver, frame ? frame.round : null, e?.rounds.length ?? 0);

  const openEntry = (entry: BuildingEntry) => {
    if (entry.kind === 'command_center') setSheet('more');
    else if (entry.kind === 'taskforce') {
      setSquadView(entry.squad);
      setSheet('squad');
    } else if (entry.kind === 'depot') {
      setInfoBuilding('depot');
      setSheet('info');
    } else if (entry.kind === 'assets') {
      const assetId = ASSET_OF_CATEGORY[entry.category] ?? null;
      if (assetId) {
        setHangarFocus(assetId);
        setSheet('hangar');
      } else {
        setInfoBuilding(BOARD_BUILDINGS.find((b) => b.entry.kind === 'assets' && b.entry.category === entry.category)?.id ?? 'depot');
        setSheet('info');
      }
    } else {
      const role = BUILDING_ROLE[entry.id];
      const kind = role?.target.kind;
      if (kind === 'bay') setSheet('bay');
      else if (kind === 'repair') setSheet('repair');
      else if (kind === 'season') setSheet('season');
      else if (kind === 'record') setSheet('more');
      else {
        setInfoBuilding(entry.id);
        setSheet('info');
      }
    }
  };

  const accountButton = (
    <button onClick={() => setMenuOpen((o) => !o)} title="Account" aria-label="Account" data-guide="account" className="pointer-events-auto h-11 w-11 shrink-0 overflow-hidden rounded-full border border-neutral-600 bg-black/70 backdrop-blur transition hover:border-orange-500">
      <span className="flex h-full w-full items-center justify-center text-[18px] text-orange-300" aria-hidden>
        ★
      </span>
    </button>
  );

  const attackFor = (site: Site) => {
    if (deploy.blocked) {
      return (
        <p className="mt-2 rounded border border-neutral-700 bg-neutral-900/80 px-2 py-1.5 text-xs text-neutral-300" data-unavailable>
          {deploy.blocked}
        </p>
      );
    }
    const ours = forceTotals(state, deploy.robots, deploy.assets);
    const theirs = site.battle ? enemyTotals(siteEnemies(site, state), siteStrength(site, state)) : null;
    return (
      <>
        <p className="mt-1 text-[11px] text-neutral-400">
          Task Force Alpha: {deploy.robots.length} robot{deploy.robots.length === 1 ? '' : 's'}, {deploy.assets.length} Asset{deploy.assets.length === 1 ? '' : 's'} · HP {ours.hp} · firepower {ours.firepower}
          {theirs && (
            <span className="text-red-300/80">
              {' '}
              vs HP {theirs.hp} · firepower {theirs.firepower}
            </span>
          )}
          {deploy.waiting.length > 0 && <span className="block text-amber-300/80">Not ready, staying home: {deploy.waiting.join(', ')}</span>}
        </p>
        <button onClick={() => act({type: 'march.start', siteId: site.id, robots: deploy.robots, assets: deploy.assets})} data-guide="attack" className={`mt-2 min-h-11 w-full rounded border px-3 py-2 text-sm font-semibold ${site.battle ? 'border-red-800 bg-red-950/40 text-red-200 hover:border-red-500' : 'border-amber-700 bg-amber-950/40 text-amber-200 hover:border-amber-400'}`}>
          {site.battle ? t('map.attack') : 'March and hold'}
        </button>
      </>
    );
  };

  return (
    <div className="sbx-root fixed inset-0 overflow-hidden bg-[#0a0906] text-neutral-200">
      {scene === 'world' ? (
        <div className="fixed inset-0">
          <WorldView
            state={state}
            now={now}
            roundMs={ROUND_MS}
            pulseSite={want === 'site.select' ? patrolId : null}
            account={accountButton}
            march={line}
            bottomInset={bottomInset}
            onSelectSite={(id) => act({type: 'site.select', siteId: id})}
            renderAction={attackFor}
            onOpenBase={() => setScene('base')}
            onOpenSquads={() => {
              setScene('base');
              setSquadView('Alpha');
              setSheet('squad');
            }}
            onOpenReports={() => setSheet('reports')}
            onRecall={() => act({type: 'march.recall'})}
            onSkip={() => act({type: 'clock.skipMarch'})}
            notice={
              <p className="pointer-events-none truncate text-[9px] font-semibold uppercase leading-tight tracking-wide text-amber-300" data-testid="map-temp-art">
                Temporary art: robots, Dominion machines, kit
              </p>
            }
            overlay={
              <>
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

              </>
            }
          />
        </div>
      ) : (
        <div className="fixed inset-0 bg-[#0a0906] text-neutral-200">
          <SandboxBaseBoard state={state} onOpen={openEntry} bottomInset={bottomInset} />
          {/* The live base header (LiveApp.tsx): account left, the clock between, World map right. */}
          <header className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-start justify-between gap-2 px-3" style={{paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)'}}>
            <div className="pointer-events-auto flex w-24 items-center">{accountButton}</div>
            <div className="pointer-events-none flex flex-col items-center gap-1">
              <div data-guide="clock" className="pointer-events-auto rounded border border-neutral-800 bg-black/70 px-3 py-1.5 text-[11px] backdrop-blur">
                <GameClock />
              </div>
              <span className="whitespace-nowrap rounded border border-amber-700/70 bg-black/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300 backdrop-blur" data-testid="base-practice">
                Practice sandbox
              </span>
            </div>
            <button onClick={() => setScene('world')} data-guide="world-map" className="pointer-events-auto min-h-11 rounded bg-neutral-800/90 px-3 py-2 text-sm font-medium text-neutral-100 shadow backdrop-blur transition hover:bg-neutral-700">
              {t('nav.worldMap')}
            </button>
          </header>
        </div>
      )}

      {notice && (
        <p className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+4.5rem)] z-[46] mx-auto flex max-w-xl items-center gap-2 rounded-md border border-amber-700 bg-amber-950/95 px-3 py-1 text-[13px] text-amber-100" role="status">
          <span className="flex-1">{notice}</span>
          <button className="min-h-11 px-2 underline" onClick={() => setNotice(null)}>
            OK
          </button>
        </p>
      )}

      {toast && (
        <p
          key={toast.key}
          role="status"
          className={`pointer-events-none fixed inset-x-3 top-[calc(env(safe-area-inset-top)+4.5rem)] z-[47] mx-auto max-w-xl rounded-md border px-3 py-2 text-center text-[13px] font-medium shadow-xl ${toast.error ? 'border-red-800 bg-red-950/95 text-red-100' : 'border-emerald-800 bg-emerald-950/95 text-emerald-100'}`}
        >
          {toast.text}
        </p>
      )}

      {!state.tutorial.completed && (
        <SandboxGuide
          text={tutorialSay(step)}
          counter={`${state.tutorial.step + 1}/${TUTORIAL.length}`}
          objective={step.objective}
          canNext={step.advance === 'next'}
          highlight={highlight}
          hidden={inSheet}
          onNext={() => act({type: 'tutorial.next'})}
          onSkip={() => act({type: 'tutorial.skip'})}
          onHeight={setGuideH}
        />
      )}

      <Comms onOpenChange={setCommsOpen} />

      {menuOpen && (
        <div className="fixed inset-0 z-[55]" onMouseDown={(ev) => ev.target === ev.currentTarget && setMenuOpen(false)}>
          <div className="absolute right-3 w-64 shadow-2xl" style={{top: 'calc(env(safe-area-inset-top) + 3.75rem)'}}>
            <AccountPanel
              state={state}
              week={week}
              day={day}
              level={lvl.level}
              onOpen={(k) => {
                setMenuOpen(false);
                setSheet(k);
              }}
            />
          </div>
        </div>
      )}
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
          <Hangar state={state} now={now} focus={hangarFocus} onAct={act} onTestAdvance={testAdvance} />
        </Sheet>
      )}
      {sheet === 'repair' && (
        <Sheet title="Materials Recovery Yard · Repairs" onClose={() => setSheet(null)}>
          <RepairYard
            state={state}
            now={now}
            onAct={act}
            onOpenBay={(role) => {
              setBayRole(role);
              setSheet('bay');
            }}
            onOpenHangar={(assetId) => {
              setHangarFocus(assetId);
              setSheet('hangar');
            }}
          />
        </Sheet>
      )}
      {sheet === 'info' && infoBuilding && (
        <Sheet title={buildingLabel(infoBuilding)} onClose={() => setSheet(null)}>
          <BuildingInfo buildingId={infoBuilding} />
        </Sheet>
      )}
      {sheet === 'season' && (
        <Sheet title="Season 1 · Events" onClose={() => setSheet(null)}>
          <SeasonHub
            state={state}
            now={now}
            realNow={wall}
            onOpenOps={() => setSheet('ops')}
            onGoToSite={(siteId) => {
              setSheet(null);
              setScene('world');
              if (!state.march && state.selectedSite !== siteId) act({type: 'site.select', siteId});
            }}
          />
        </Sheet>
      )}
      {sheet === 'squad' && (
        <Sheet title={`Task Force ${squadView}`} onClose={() => setSheet(null)}>
          <SquadSetup
            state={state}
            squad={squadView}
            onSet={(robots, assets) => act({type: 'squad.set', robots, assets})}
            onRepairs={() => setSheet('repair')}
          />
        </Sheet>
      )}
      {sheet === 'reports' && (
        <Sheet title={t('map.reports')} onClose={() => setSheet(null)}>
          <Reports state={state} />
        </Sheet>
      )}
      {sheet === 'ops' && (
        <Sheet title="Operations" onClose={() => setSheet(null)}>
          <Operations state={state} now={now} onAct={act} />
        </Sheet>
      )}
      {sheet === 'more' && (
        <Sheet title="Command Center" onClose={() => setSheet(null)}>
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

function Hangar({state, now, focus, onAct, onTestAdvance}: {state: SandboxState; now: number; focus: string | null; onAct: (a: SandboxAction) => void; onTestAdvance: (minutes: number) => void}) {
  const [open, setOpen] = useState<string>(focus ?? '');
  useEffect(() => {
    if (!focus) return;
    document.querySelector(`[data-hangar-asset="${focus}"]`)?.scrollIntoView({block: 'start'});
  }, [focus]);
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
          <div key={a.assetId} data-hangar-asset={a.assetId}>
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
                        <p className="text-[12px] text-neutral-400">Raises every attribute. Fits: {serviceItemFor(asset!.category, rank.to)?.name ?? 'a new rank plate'}.{rank.milestone ? ' Milestone: a double step, and the Asset\'s render changes.' : ''}</p>
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

/** Which base building stands for each Season objective and Daily Operations lane (art only). */
const OBJECTIVE_ART: Record<string, string> = {exercises: 'garrison_barracks', patrol: 'armour_hub', lanes: 'tactical_operations_center', cache: 'depot'};
const LANE_ART: Record<string, string> = {
  command: 'fabrication_shop',
  industry: 'quartermaster_warehouse',
  mobilization: 'fuel_point',
  engagement: 'rotary_hub',
  readiness: 'recovery_yard',
  cooperation: 'alliance_trading_post',
};

function Operations({state, now, onAct}: {state: SandboxState; now: number; onAct: (a: SandboxAction) => void}) {
  const day = sandboxDay(state, now);
  const week = sandboxWeek(day);
  const done = lanesDone(state, day);
  const cacheClaimed = state.ledger.includes(`cache:${day}`);
  return (
    <>
      <div className="relative -mx-1 overflow-hidden rounded-lg border border-neutral-800 bg-gradient-to-b from-[#3a3122] to-[#16120c]">
        <img src="/base/building-tactical-operations-center.webp" alt="Tactical Operations Center" className="mx-auto block h-28 object-contain" />
        <p className="bg-black/70 px-2 py-1 text-[12px] font-semibold text-neutral-200">
          Tactical Operations Center · {CONFIG.seasonName} · week {week} · sandbox day {day + 1}
        </p>
      </div>
      <Section title="Season objectives" right={<TempArtTag className="hidden" />}>
        <ul className="space-y-1.5">
          {seasonObjectives(state, now).map((o) => (
            <li key={o.id}>
              <ArtCard art={<BuildingImg id={OBJECTIVE_ART[o.id] ?? 'tactical_operations_center'} />} title={o.label} done={o.done} right={<span className="shrink-0 font-mono text-[12px] text-neutral-400">{o.progress}/{o.target}</span>}>
                <Bar value={o.progress} max={o.target} tone={o.done ? 'bg-emerald-500' : 'bg-cyan-500'} label={o.label} />
                <p className="mt-0.5 text-[11px] leading-snug text-neutral-500">{o.detail}</p>
              </ArtCard>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Daily Operations" right={<span className="text-[12px] text-neutral-400">{Math.min(done.length, LANES_FOR_CACHE)}/{LANES_FOR_CACHE} for the Cache</span>}>
        <ul className="grid grid-cols-2 gap-1.5">
          {LANES.map((l) => {
            const ok = done.includes(l);
            const trigger = SANDBOX_LANE_TRIGGER[l];
            return (
              <li key={l} data-lane={l} className={`flex flex-col overflow-hidden rounded-lg border ${ok ? 'border-emerald-700 bg-emerald-950/30' : trigger ? 'border-neutral-800 bg-black/30' : 'border-neutral-800 bg-neutral-950 opacity-70'}`}>
                <div className="relative h-16 bg-gradient-to-b from-[#3a3122] to-[#1a150e]">
                  <BuildingImg id={LANE_ART[l]} className={trigger ? '' : 'grayscale'} />
                  {ok && <span className="absolute right-1 top-1 rounded-full bg-emerald-600 px-1.5 text-[12px] font-bold text-white">✓</span>}
                </div>
                <div className="flex-1 p-1.5">
                  <p className={`text-[13px] font-bold ${ok ? 'text-emerald-200' : 'text-neutral-100'}`}>{LANE_COPY[l].label}</p>
                  <p className="text-[11px] leading-snug text-neutral-400">{trigger ?? 'Needs an alliance: not available in the sandbox.'}</p>
                  <p className="mt-0.5 text-[11px] font-semibold text-amber-200">{describeReward(laneReward(l, week))}</p>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-neutral-800 bg-black/30 p-1.5">
          <div className="h-14 w-14 shrink-0">
            <BuildingImg id="depot" />
          </div>
          <button className={`${primary} min-w-0 flex-1`} disabled={cacheClaimed || done.length < LANES_FOR_CACHE} onClick={() => onAct({type: 'ops.cache'})}>
            {cacheClaimed ? "Today's Cache claimed" : `Claim Cache: ${describeReward(cacheReward(week))}`}
          </button>
        </div>
        <p className="mt-1 text-[11px] text-neutral-500">Lane and Cache rewards are the real Season 1 week {week} table, paid here in practice supplies and test Credits. Building pictures mark each lane; they are not the lane's rules.</p>
      </Section>
    </>
  );
}

function More({state, now, onAct, onReset}: {state: SandboxState; now: number; onAct: (a: SandboxAction) => void; onReset: () => void}) {
  const lvl = companyLevel(state.company.xp);
  const s = state.stats;
  return (
    <>
      <div className="relative -mx-1 flex items-end gap-2 overflow-hidden rounded-lg border border-neutral-800 bg-gradient-to-b from-[#3a3122] to-[#16120c] px-2 pt-2">
        <img src="/base/building-signals-center.webp" alt="Signals Center" className="block h-24 w-1/2 object-contain" />
        <span className="flex flex-1 items-end justify-center pb-1">
          {ROLES.map((r) => (
            <span key={r} className="-mx-0.5 inline-block">
              <RobotFigure role={r} parts={partsAt(state.robots[r].level)} height={56} status={state.robots[r].status === 'destroyed' || state.robots[r].status === 'disabled' ? state.robots[r].status : 'ready'} />
            </span>
          ))}
        </span>
      </div>
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
