/**
 * The Field Sandbox screen (/sandbox): General Rider's practice patrol, on a
 * battlefield.
 *
 * Everything shown comes from shared/sandbox.ts and lives in this browser
 * (src/sandbox/store.ts). There is no API call on this screen, so it works
 * signed out, and nothing on it can reach a real base, wallet, battle record
 * or PvP statistic.
 *
 * The battlefield takes the viewport; a slim HUD sits on top, General Rider
 * over the field, the one or two actions that make sense right now at the
 * bottom, and everything else (company, workshop, record, test controls) in
 * a sheet. Every animation is a replay of a real state change (beats.ts):
 * the action is applied and saved first, then the field shows it happening.
 * Buttons stay locked while a timeline plays, so a tap cannot land on a
 * picture of the past.
 */
import {type CSSProperties, type ReactNode, useCallback, useEffect, useRef, useState} from 'react';
import {
  CHASSIS_SPEC,
  REINFORCE_COST,
  REPAIR_COST,
  ROLES,
  type Role,
  type SandboxAction,
  type SandboxState,
  SUPPLY_KINDS,
  type Supplies,
  type SupplyKind,
  TUTORIAL,
  WORKSHOP_MAX_LEVEL,
  WORKSHOP_STEPS,
  companyLevel,
  sandboxNow,
  workshopArmour,
  workshopRepairFactor,
} from '../../shared/sandbox';
import Battlefield, {type View} from './Battlefield';
import {type Timeline, completionsFor, timelineFor} from './beats';
import {SANDBOX_STORAGE_KEY, dispatchSandbox, loadSandbox, resetSandbox} from './store';
import './sandbox.css';

/** Accidental double taps are closer together than this; a deliberate second volley is not. */
const TAP_GUARD_MS = 350;

const SUPPLY_LABEL: Record<SupplyKind, string> = {fuel: 'Fuel', steel: 'Steel', munitions: 'Munitions', alloy: 'Alloy'};
const SUPPLY_TONE: Record<SupplyKind, string> = {fuel: '#f2a33a', steel: '#9fb4c4', munitions: '#e5634a', alloy: '#7fd8c9'};

function actionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
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

const merge = (a: Timeline, b: Timeline): Timeline => ({
  fx: [...a.fx, ...b.fx],
  updates: [...a.updates, ...b.updates],
  banner: b.banner ?? a.banner,
  duration: Math.max(a.duration, b.duration),
});

/** How long anything in a timeline stays on screen (floats and banners outlive the lock). */
const visibleFor = (tl: Timeline) =>
  Math.max(tl.duration, ...tl.fx.map((f) => f.at + f.dur), tl.banner ? tl.banner.at + tl.banner.dur : 0);

interface Override extends View {
  supplies: Supplies;
}

function Bar({value, max, tone}: {value: number; max: number; tone: string}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded bg-neutral-800" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className={`h-full ${tone}`} style={{width: `${pct}%`}} />
    </div>
  );
}

function Section({title, children, right}: {title: string; children: ReactNode; right?: ReactNode}) {
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/70 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

const button = 'min-h-11 rounded-md px-3 text-[14px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40';
const primary = `${button} bg-orange-600 text-white shadow-lg shadow-orange-950/40 hover:bg-orange-500`;
const secondary = `${button} border border-neutral-600 bg-neutral-900/90 text-neutral-100 hover:bg-neutral-800`;
const testButton = `${button} border-2 border-dashed border-amber-600/80 bg-amber-950/60 text-amber-200`;

function CostLine({cost, have}: {cost: Supplies; have: Supplies}) {
  return (
    <p className="text-[13px] leading-snug text-neutral-300">
      {SUPPLY_KINDS.filter((k) => cost[k] > 0).map((k, i) => (
        <span key={k} className={have[k] < cost[k] ? 'text-red-400' : undefined}>
          {i > 0 ? ' · ' : ''}
          {cost[k].toLocaleString()} {SUPPLY_LABEL[k]}
        </span>
      ))}
    </p>
  );
}

export default function Sandbox() {
  const storage = typeof window !== 'undefined' ? window.localStorage : null;
  const reduced = useReducedMotion();
  const [state, setState] = useState<SandboxState | null>(() => (storage ? loadSandbox(storage, Date.now()) : null));
  const [toast, setToast] = useState<{text: string; error: boolean; key: number} | null>(null);
  const [sheet, setSheet] = useState<null | 'company' | 'workshop' | 'record' | 'test'>(null);
  // 'auto': open between fights, folded to its objective line during one, so it never hides the robots.
  const [riderMode, setRiderMode] = useState<'auto' | 'open' | 'closed'>('auto');
  const [play, setPlay] = useState<{key: number; tl: Timeline} | null>(null);
  const [override, setOverride] = useState<Override | null>(null);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  const busyRef = useRef(false);
  // A second tap this soon after the last action is the same tap, whatever the motion setting.
  const lastTap = useRef(0);
  const shownRef = useRef(state);
  const timers = useRef<number[]>([]);
  const playKey = useRef(0);

  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  /** Replay a real transition: start from `before`, catch up to `after` on the timeline. */
  const run = useCallback((before: SandboxState, after: SandboxState, tl: Timeline) => {
    clearTimers();
    if (!tl.fx.length && !tl.banner && !tl.updates.length) return;
    const key = ++playKey.current;
    const sameEncounter = before.encounter && after.encounter && before.encounter.id === after.encounter.id;
    const start: Override = {
      allies: Object.fromEntries(ROLES.map((r) => [r, {hp: before.chassis[r].hp, status: before.chassis[r].status}])) as View['allies'],
      enemies: Object.fromEntries((after.encounter?.enemies ?? []).map((x) => [x.id, sameEncounter ? before.encounter!.enemies.find((y) => y.id === x.id)?.hp ?? x.hp : x.hp])),
      supplies: before.supplies,
    };
    setOverride(tl.updates.length ? start : null);
    setPlay({key, tl});
    for (const u of tl.updates) {
      timers.current.push(
        window.setTimeout(() => {
          setOverride((o) => {
            if (!o) return o;
            if (u.kind === 'ally') return {...o, allies: {...o.allies, [u.role]: {hp: u.hp, status: u.status}}};
            if (u.kind === 'enemy') return {...o, enemies: {...o.enemies, [u.id]: u.hp}};
            return {...o, supplies: after.supplies};
          });
        }, u.at),
      );
    }
    const lock = tl.duration > 0;
    busyRef.current = lock;
    setBusy(lock);
    timers.current.push(
      window.setTimeout(() => {
        setOverride(null);
        busyRef.current = false;
        setBusy(false);
      }, tl.duration),
    );
    timers.current.push(window.setTimeout(() => setPlay((p) => (p?.key === key ? null : p)), visibleFor(tl) + 50));
  }, []);

  const reload = useCallback(() => {
    if (!storage) return;
    const next = loadSandbox(storage, Date.now());
    setState(next);
    // Timers that finished on their own (or in another tab): show them landing.
    if (!busyRef.current && shownRef.current) {
      const tl = completionsFor(shownRef.current, next, reduced ? 0 : 1);
      if (tl.fx.length) run(shownRef.current, next, tl);
      shownRef.current = next;
    }
  }, [storage, reduced, run]);

  useEffect(() => {
    const id = window.setInterval(() => {
      reload();
      tick((n) => n + 1);
    }, 1000);
    const onStorage = (e: StorageEvent) => {
      if (e.key === SANDBOX_STORAGE_KEY) reload();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('storage', onStorage);
    };
  }, [reload]);

  useEffect(() => {
    document.title = 'Field Sandbox · World War Rogue';
  }, []);

  // A new instruction is worth showing: back to automatic whenever the step changes.
  const stepIndex = state?.tutorial.step ?? 0;
  useEffect(() => setRiderMode('auto'), [stepIndex]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast((t) => (t?.key === toast.key ? null : t)), toast.error ? 4200 : 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  if (!storage || !state) {
    return <div className="p-6 text-sm text-neutral-400">The sandbox needs browser storage, which this browser has turned off.</div>;
  }

  const act = (action: SandboxAction) => {
    // One input per timeline: the state has already moved on; the field is still catching up.
    if (busyRef.current || Date.now() - lastTap.current < TAP_GUARD_MS) return;
    lastTap.current = Date.now();
    const before = loadSandbox(storage, Date.now());
    const r = dispatchSandbox(storage, actionId(), action, Date.now());
    setState(r.state);
    if ('error' in r) {
      setToast({text: r.error, error: true, key: Date.now()});
      return;
    }
    if (r.note) setToast({text: r.note, error: false, key: Date.now()});
    const scale = reduced ? 0 : 1;
    const shown = shownRef.current ?? before;
    const tl = merge(completionsFor(shown, before, scale), timelineFor(before, r.state, action, scale));
    shownRef.current = r.state;
    run(shown === before ? before : shown, r.state, tl);
  };

  const now = sandboxNow(state, Date.now());
  const step = TUTORIAL[state.tutorial.step];
  const want = state.tutorial.completed ? null : step.advance;
  const lvl = companyLevel(state.company.xp);
  const e = state.encounter;
  const active = e?.status === 'active';
  const claimable = e?.status === 'won' && !e.claimed;
  const job = state.workshop.job;
  const nextWorkshop = WORKSHOP_STEPS[state.workshop.level + 1] ?? null;
  const anyReady = ROLES.some((r) => state.chassis[r].status === 'ready');
  const damagedRole = ROLES.find((r) => {
    const c = state.chassis[r];
    return c.status === 'disabled' || c.status === 'destroyed' || (c.status === 'ready' && c.hp < CHASSIS_SPEC[r].maxHp);
  });
  const timersRunning = !!job || ROLES.some((r) => ['repairing', 'reinforcing'].includes(state.chassis[r].status));
  const view: View = override ?? {
    allies: Object.fromEntries(ROLES.map((r) => [r, {hp: state.chassis[r].hp, status: state.chassis[r].status}])) as View['allies'],
    enemies: Object.fromEntries((e?.enemies ?? []).map((x) => [x.id, x.hp])),
  };
  const supplies = override?.supplies ?? state.supplies;
  const tl = play?.tl ?? null;
  const attention = (on: boolean) => (on && !busy ? ' sbx-attention' : '');
  const riderOpen = riderMode === 'open' || (riderMode === 'auto' && !active);

  const primaryAction = active ? (
    <button className={`${primary} flex-1 text-[16px]${attention(want === 'encounter.fire' || want === 'encounter.won')}`} disabled={busy || !anyReady} onClick={() => act({type: 'encounter.fire'})}>
      Fire volley
    </button>
  ) : claimable ? (
    <button className={`${primary} flex-1 text-[16px]${attention(want === 'encounter.claim')}`} disabled={busy} onClick={() => act({type: 'encounter.claim'})}>
      Collect supplies
    </button>
  ) : (
    <button className={`${primary} flex-1 text-[16px]${attention(want === 'encounter.start')}`} disabled={busy || !anyReady} onClick={() => act({type: 'encounter.start'})}>
      {e ? `Start patrol ${state.stats.encountersWon + 1}` : 'Start patrol'}
    </button>
  );

  const repairAction = (role: Role) => {
    const c = state.chassis[role];
    return c.status === 'destroyed' ? {type: 'chassis.reinforce' as const, role} : {type: 'chassis.repair' as const, role};
  };

  return (
    <div className="sbx-root fixed inset-0 flex flex-col overflow-hidden bg-[#b9ab8a] text-neutral-200">
      {/* HUD: who you are, what you have. */}
      <header className="z-20 bg-[#0d0b08]/90 px-2 pb-1.5 backdrop-blur" style={{paddingTop: 'calc(env(safe-area-inset-top) + 0.4rem)'}}>
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <a href="/" className={`${secondary} inline-flex shrink-0 items-center px-2.5`} aria-label="Back to the game">
            ←
          </a>
          <button className="min-h-11 min-w-0 flex-1 text-left" onClick={() => setSheet('company')} aria-label="Company details">
            <span className="flex items-baseline gap-2">
              <span className="truncate text-[14px] font-semibold text-neutral-100">{state.company.name}</span>
              <span className="shrink-0 rounded bg-cyan-900/70 px-1.5 text-[11px] font-bold text-cyan-200">LV {lvl.level}</span>
            </span>
            <span className="mt-1 flex items-center gap-2">
              <Bar value={lvl.into} max={lvl.need} tone="bg-cyan-400" />
              <span className="shrink-0 font-mono text-[11px] text-neutral-400">
                {lvl.into}/{lvl.need}
              </span>
            </span>
          </button>
          <span className="shrink-0 rounded border border-amber-700/70 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-tight tracking-wider text-amber-300">
            Practice
          </span>
        </div>
        <div className="relative mx-auto mt-1 grid max-w-xl grid-cols-4 gap-1">
          {SUPPLY_KINDS.map((k) => (
            <div key={k} className="relative flex items-center gap-1.5 rounded bg-black/50 px-1.5 py-1">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{background: SUPPLY_TONE[k]}} aria-hidden="true" />
              <span className="sr-only">{SUPPLY_LABEL[k]}</span>
              <span key={supplies[k]} className="sbx-bump inline-block font-mono text-[13px] font-semibold text-neutral-100">
                {supplies[k].toLocaleString()}
              </span>
              {tl?.fx
                .filter((f) => f.type === 'float' && f.to?.side === 'hud' && f.to.supply === k)
                .map((f, i) => (
                  <span
                    key={`${play!.key}-${i}`}
                    className="sbx-hud-float pointer-events-none absolute -bottom-5 left-1 text-[13px] font-extrabold text-amber-200"
                    style={{'--at': `${f.at}ms`, '--dur': `${f.dur}ms`, textShadow: '0 1px 2px #000'} as CSSProperties}
                  >
                    {f.text}
                  </span>
                ))}
            </div>
          ))}
        </div>
      </header>

      {/* The battlefield. */}
      <main className="relative min-h-0 flex-1">
        <Battlefield
          state={state}
          view={view}
          fx={tl?.fx ?? []}
          fxKey={play?.key ?? 0}
          now={now}
          highlightRole={want === 'chassis.repair' ? damagedRole ?? null : null}
          onAllyTap={() => setSheet('company')}
        />

        {/* General Rider, one instruction at a time. */}
        <div className="pointer-events-none absolute inset-x-2 top-2 z-10 mx-auto max-w-xl">
          {riderOpen ? (
            <section className="pointer-events-auto flex gap-2 rounded-lg border border-cyan-500/50 bg-[#061319]/90 px-2.5 py-2 shadow-xl backdrop-blur" aria-live="polite">
              <img src="/guide/rider-portrait.webp" alt="General Rider" className="h-10 w-10 shrink-0 rounded-full border-2 border-cyan-400/80 object-cover" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider text-cyan-300">
                  <span>General Rider{state.tutorial.completed ? '' : ` · ${state.tutorial.step + 1}/${TUTORIAL.length}`}</span>
                  <span className="-my-3 flex items-center">
                    {!state.tutorial.completed && (
                      <button className="min-h-11 px-2 text-[12px] normal-case tracking-normal text-neutral-400 underline underline-offset-4" disabled={busy} onClick={() => act({type: 'tutorial.skip'})}>
                        Skip
                      </button>
                    )}
                    <button className="min-h-11 min-w-11 text-[18px] leading-none text-cyan-200/80" onClick={() => setRiderMode('closed')} aria-label="Hide General Rider">
                      –
                    </button>
                  </span>
                </p>
                <p className="text-[14px] leading-snug text-neutral-100">{step.say}</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-cyan-200">▸ {step.objective}</p>
                  {!state.tutorial.completed && step.advance === 'next' && (
                    <button className={`${primary} shrink-0 bg-cyan-600 shadow-none hover:bg-cyan-500`} disabled={busy} onClick={() => act({type: 'tutorial.next'})}>
                      Next
                    </button>
                  )}
                </div>
              </div>
            </section>
          ) : (
            <button
              className="pointer-events-auto flex min-h-11 max-w-full items-center gap-2 rounded-full border border-cyan-500/50 bg-[#061319]/90 py-1 pl-1 pr-3 shadow-xl"
              onClick={() => setRiderMode('open')}
              aria-label="Show General Rider"
            >
              <img src="/guide/rider-portrait.webp" alt="" className="h-9 w-9 rounded-full border border-cyan-400/80 object-cover" />
              <span className="truncate text-[13px] font-semibold text-cyan-100">▸ {step.objective}</span>
            </button>
          )}
        </div>

        {/* Outcome banner. */}
        {tl?.banner && (
          <div className="pointer-events-none absolute inset-x-0 top-[42%] z-10 flex justify-center px-4">
            <p
              key={play!.key}
              className={`sbx-banner rounded-lg border-2 px-5 py-2.5 text-center text-[18px] font-extrabold uppercase tracking-wider shadow-2xl ${
                tl.banner.tone === 'win'
                  ? 'border-amber-300 bg-amber-950/90 text-amber-100'
                  : tl.banner.tone === 'loss'
                    ? 'border-red-400 bg-red-950/90 text-red-100'
                    : 'border-cyan-400/70 bg-[#061319]/90 text-cyan-100'
              }`}
              style={{'--at': `${tl.banner.at}ms`, '--dur': `${tl.banner.dur}ms`} as CSSProperties}
            >
              {tl.banner.text}
            </p>
          </div>
        )}

        {toast && (
          <p
            key={toast.key}
            role="status"
            className={`absolute inset-x-3 bottom-2 z-10 mx-auto max-w-xl rounded-md border px-3 py-2 text-center text-[13px] font-medium shadow-xl ${
              toast.error ? 'border-red-800 bg-red-950/95 text-red-100' : 'border-emerald-800 bg-emerald-950/95 text-emerald-100'
            }`}
          >
            {toast.text}
          </p>
        )}
      </main>

      {/* Actions that make sense right now. */}
      <nav className="z-20 bg-[#0d0b08]/95 px-2 pt-2 backdrop-blur" style={{paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)'}}>
        <div className="mx-auto max-w-xl space-y-2">
          {!active && (damagedRole || (nextWorkshop && !job) || timersRunning) && (
            <div className="flex gap-2">
              {damagedRole && (
                <button className={`${secondary} flex-1${attention(want === 'chassis.repair')}`} disabled={busy} onClick={() => act(repairAction(damagedRole))}>
                  {state.chassis[damagedRole].status === 'destroyed' ? 'Replace' : 'Repair'} {CHASSIS_SPEC[damagedRole].label}
                </button>
              )}
              {nextWorkshop && !job && (
                <button className={`${secondary} flex-1${attention(want === 'workshop.start')}`} disabled={busy} onClick={() => act({type: 'workshop.start'})}>
                  Upgrade Workshop
                </button>
              )}
              {timersRunning && (
                <button className={`${testButton}${attention(want === 'recovery.done')}`} disabled={busy} onClick={() => act({type: 'clock.advance', minutes: 5})} aria-label="Test clock: advance the sandbox 5 minutes">
                  Test +5m
                </button>
              )}
            </div>
          )}
          <div className="flex gap-2">
            {primaryAction}
            {active && (
              <button className={secondary} disabled={busy} onClick={() => act({type: 'encounter.retreat'})}>
                Retreat
              </button>
            )}
            <button className={`${secondary} px-3`} onClick={() => setSheet('company')} aria-label="Open company, workshop, record and test controls">
              ☰ Base
            </button>
          </div>
        </div>
      </nav>

      {sheet && (
        <Sheet
          state={state}
          now={now}
          busy={busy}
          onClose={() => setSheet(null)}
          onAct={(a) => act(a)}
          onReset={() => {
            if (window.confirm('Reset the sandbox? This clears the sandbox company only.')) {
              clearTimers();
              setOverride(null);
              setPlay(null);
              busyRef.current = false;
              setBusy(false);
              const fresh = resetSandbox(storage, Date.now());
              shownRef.current = fresh;
              setState(fresh);
              setToast({text: 'Sandbox reset.', error: false, key: Date.now()});
              setSheet(null);
            }
          }}
        />
      )}
    </div>
  );
}

function Sheet({
  state,
  now,
  busy,
  onClose,
  onAct,
  onReset,
}: {
  state: SandboxState;
  now: number;
  busy: boolean;
  onClose: () => void;
  onAct: (a: SandboxAction) => void;
  onReset: () => void;
}) {
  const lvl = companyLevel(state.company.xp);
  const job = state.workshop.job;
  const nextWorkshop = WORKSHOP_STEPS[state.workshop.level + 1] ?? null;
  const e = state.encounter;
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onMouseDown={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div
        className="mx-auto max-h-[82dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl border-t border-neutral-700 bg-[#0d0b08] px-3 pt-2"
        style={{paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)'}}
        role="dialog"
        aria-label="Base"
      >
        <div className="sticky top-0 z-10 -mx-3 flex items-center justify-between bg-[#0d0b08] px-3 pb-2">
          <p className="text-[15px] font-semibold text-neutral-100">Field base</p>
          <button className={secondary} onClick={onClose}>
            Close
          </button>
        </div>
        <div className="space-y-3">
          <Section title="Company" right={<span className="text-[13px] text-neutral-400">Level {lvl.level}</span>}>
            <p className="text-base font-semibold text-neutral-100">{state.company.name}</p>
            <div className="mt-2 flex items-center gap-2">
              <Bar value={lvl.into} max={lvl.need} tone="bg-cyan-500" />
              <span className="shrink-0 font-mono text-[12px] text-neutral-400">
                {lvl.into}/{lvl.need} XP
              </span>
            </div>
            <p className="mt-2 text-[13px] text-neutral-400">The company keeps its experience when a chassis is destroyed. Each company level adds 5% damage.</p>
            <div className="mt-3 space-y-2">
              {ROLES.map((role) => (
                <div key={role}>
                  <ChassisRow role={role} state={state} now={now} busy={busy || e?.status === 'active'} onAct={onAct} />
                </div>
              ))}
            </div>
          </Section>

          <Section title="Field Workshop" right={<span className="text-[13px] text-neutral-400">Level {state.workshop.level}/{WORKSHOP_MAX_LEVEL}</span>}>
            <p className="text-[13px] text-neutral-300">
              Damage taken ×{workshopArmour(state.workshop.level).toFixed(2)} · Repair time ×{workshopRepairFactor(state.workshop.level).toFixed(2)}
            </p>
            {job ? (
              <div className="mt-2">
                <p className="text-[13px] text-orange-200">
                  Upgrading to level {job.toLevel} · <span className="font-mono">{clock(job.completesAt - now)}</span> left
                </p>
                <Bar value={Math.max(0, (WORKSHOP_STEPS[job.toLevel]?.minutes ?? 1) * 60_000 - (job.completesAt - now))} max={(WORKSHOP_STEPS[job.toLevel]?.minutes ?? 1) * 60_000} tone="bg-orange-500" />
              </div>
            ) : nextWorkshop ? (
              <div className="mt-2 space-y-2">
                <p className="text-[13px] text-neutral-400">
                  Level {state.workshop.level + 1}: damage taken ×{workshopArmour(state.workshop.level + 1).toFixed(2)}, repairs ×{workshopRepairFactor(state.workshop.level + 1).toFixed(2)}. Takes {nextWorkshop.minutes} min.
                </p>
                <CostLine cost={nextWorkshop.cost} have={state.supplies} />
                <button className={`${primary} w-full`} disabled={busy} onClick={() => onAct({type: 'workshop.start'})}>
                  Start upgrade
                </button>
              </div>
            ) : (
              <p className="mt-2 text-[13px] text-neutral-400">At the sandbox maximum.</p>
            )}
          </Section>

          <Section title="Service record">
            <dl className="grid grid-cols-2 gap-2 text-[13px]">
              <div className="rounded border border-neutral-800 p-2">
                <dt className="text-neutral-400">Training kills (NPC robots)</dt>
                <dd className="font-mono text-lg text-neutral-100">{state.stats.trainingKills}</dd>
              </div>
              <div className="rounded border border-neutral-800 p-2">
                <dt className="text-neutral-400">Patrols won</dt>
                <dd className="font-mono text-lg text-neutral-100">{state.stats.encountersWon}</dd>
              </div>
              <div className="rounded border border-neutral-800 p-2">
                <dt className="text-neutral-400">Chassis destroyed</dt>
                <dd className="font-mono text-lg text-neutral-100">{state.stats.chassisLost}</dd>
              </div>
              <div className="rounded border border-neutral-700 bg-neutral-950 p-2">
                <dt className="text-neutral-400">Confirmed PvP destructions</dt>
                <dd className="font-mono text-lg text-neutral-500">0</dd>
              </div>
            </dl>
            <p className="mt-2 text-[12px] text-neutral-500">
              Training kills are simulated enemies in this sandbox. Confirmed PvP destructions count only real battles against other commanders, and the sandbox has none.
            </p>
          </Section>

          {e && e.log.length > 0 && (
            <Section title={`Combat log · patrol ${e.wave}`}>
              <ol className="max-h-44 space-y-0.5 overflow-y-auto font-mono text-[12px] leading-relaxed text-neutral-300">
                {e.log.map((line, i) => (
                  <li key={`${i}-${line}`}>{line}</li>
                ))}
              </ol>
            </Section>
          )}

          <section className="rounded-lg border-2 border-dashed border-amber-700/70 bg-amber-950/20 p-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Test controls</h2>
            <p className="mt-1 text-[13px] text-amber-100/80">
              The test clock moves only this sandbox's own timers. It cannot touch your real base, the server clock or anyone else.
              {state.clockOffsetMs > 0 && ` Sandbox clock is ${Math.round(state.clockOffsetMs / 60_000)} min ahead.`}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[1, 5, 30].map((m) => (
                <button key={m} className={secondary} disabled={busy} onClick={() => onAct({type: 'clock.advance', minutes: m})}>
                  +{m} min
                </button>
              ))}
              <button className={`${secondary} text-red-300`} onClick={onReset}>
                Reset sandbox
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function ChassisRow({role, state, now, busy, onAct}: {role: Role; state: SandboxState; now: number; busy: boolean; onAct: (a: SandboxAction) => void}) {
  const c = state.chassis[role];
  const spec = CHASSIS_SPEC[role];
  const tone = c.status === 'destroyed' ? 'border-red-800 bg-red-950/30' : c.status === 'disabled' ? 'border-amber-700 bg-amber-950/20' : 'border-neutral-800 bg-black/30';
  const badge: Record<string, string> = {ready: 'Ready', disabled: 'Disabled', repairing: 'Repairing', destroyed: 'Destroyed', reinforcing: 'Replacement inbound'};
  const damaged = c.status === 'disabled' || (c.status === 'ready' && c.hp < spec.maxHp);
  return (
    <div className={`flex gap-2 rounded border p-2 ${tone}`}>
      <img src={`/sandbox/units/${role}.svg`} alt={`${spec.label} chassis`} className={`h-14 w-14 shrink-0 ${c.status === 'destroyed' || c.status === 'reinforcing' ? 'opacity-30 grayscale' : ''}`} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-[14px] font-semibold text-neutral-100">
          {spec.label} <span className="font-mono text-[11px] font-normal text-neutral-500">#{String(c.serial).padStart(3, '0')}</span>
          <span className={`ml-2 text-[12px] font-semibold uppercase tracking-wide ${c.status === 'ready' ? 'text-emerald-300' : c.status === 'destroyed' ? 'text-red-300' : 'text-amber-300'}`}>
            {badge[c.status]}
            {c.readyAt !== null && (c.status === 'repairing' || c.status === 'reinforcing') && ` · ${clock(c.readyAt - now)}`}
          </span>
        </p>
        <Bar value={c.hp} max={spec.maxHp} tone={c.hp / spec.maxHp > 0.5 ? 'bg-emerald-500' : 'bg-amber-500'} />
        <p className="text-[12px] leading-snug text-neutral-400">{spec.blurb}</p>
        {damaged && (
          <button className={`${secondary} w-full`} disabled={busy} onClick={() => onAct({type: 'chassis.repair', role})}>
            Repair ({REPAIR_COST.fuel} Fuel · {REPAIR_COST.steel} Steel · {REPAIR_COST.alloy} Alloy)
          </button>
        )}
        {c.status === 'destroyed' && (
          <button className={`${secondary} w-full`} disabled={busy} onClick={() => onAct({type: 'chassis.reinforce', role})}>
            Request replacement ({REINFORCE_COST.steel} Steel…)
          </button>
        )}
      </div>
    </div>
  );
}
