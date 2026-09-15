/**
 * The Field Sandbox screen (/sandbox): General Rider's practice patrol.
 *
 * Everything shown here comes from shared/sandbox.ts and lives in this
 * browser (src/sandbox/store.ts). There is no API call on this screen, so it
 * works signed out, and nothing on it can reach a real base, wallet, battle
 * record or PvP statistic.
 *
 * Portrait layout first: one column at 390px wide, text 13px and up, and
 * every button at least 44px tall.
 */
import {type ReactNode, useCallback, useEffect, useState} from 'react';
import {
  CHASSIS_SPEC,
  ENEMY_SPEC,
  REINFORCE_COST,
  REPAIR_COST,
  ROLES,
  type Role,
  type SandboxAction,
  type SandboxState,
  SUPPLY_KINDS,
  type Supplies,
  TUTORIAL,
  WORKSHOP_MAX_LEVEL,
  WORKSHOP_STEPS,
  companyLevel,
  sandboxNow,
  workshopArmour,
  workshopRepairFactor,
} from '../../shared/sandbox';
import {SANDBOX_STORAGE_KEY, dispatchSandbox, loadSandbox, resetSandbox} from './store';

const SUPPLY_LABEL: Record<string, string> = {fuel: 'Fuel', steel: 'Steel', munitions: 'Munitions', alloy: 'Alloy'};

function actionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function Bar({value, max, tone}: {value: number; max: number; tone: string}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded bg-neutral-800" role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className={`h-full ${tone}`} style={{width: `${pct}%`}} />
    </div>
  );
}

function Card({title, children, right}: {title: string; children: ReactNode; right?: ReactNode}) {
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

const button =
  'min-h-11 rounded px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40';
const primary = `${button} bg-orange-600 text-white hover:bg-orange-500`;
const secondary = `${button} border border-neutral-700 bg-neutral-800 text-neutral-100 hover:bg-neutral-700`;

function EnemyArt({kind}: {kind: 'crawler' | 'walker'}) {
  // Placeholder Dominion robots, drawn here so the enemy reads at a glance.
  return kind === 'walker' ? (
    <svg viewBox="0 0 64 64" className="h-12 w-12" aria-hidden="true">
      <path d="M22 40 L16 60 M42 40 L48 60" stroke="#1b1f1a" strokeWidth="5" strokeLinecap="round" />
      <rect x="14" y="14" width="36" height="28" rx="4" fill="#7a2a22" stroke="#1b1f1a" strokeWidth="3" />
      <rect x="22" y="4" width="20" height="12" rx="3" fill="#a3362a" stroke="#1b1f1a" strokeWidth="3" />
      <circle cx="32" cy="10" r="3" fill="#ffb347" />
      <path d="M50 24 H62" stroke="#1b1f1a" strokeWidth="5" strokeLinecap="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 64 64" className="h-12 w-12" aria-hidden="true">
      <path d="M14 26 L4 16 M50 26 L60 16 M14 40 L4 50 M50 40 L60 50" stroke="#1b1f1a" strokeWidth="4" strokeLinecap="round" />
      <path d="M18 20 H46 L54 33 L46 46 H18 L10 33 Z" fill="#8c3a2b" stroke="#1b1f1a" strokeWidth="3" />
      <circle cx="32" cy="33" r="5" fill="#ffb347" stroke="#1b1f1a" strokeWidth="2" />
    </svg>
  );
}

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
  const [state, setState] = useState<SandboxState | null>(() => (storage ? loadSandbox(storage, Date.now()) : null));
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [, tick] = useState(0);

  const reload = useCallback(() => {
    if (storage) setState(loadSandbox(storage, Date.now()));
  }, [storage]);

  // Timers settle on read: re-read once a second, and whenever another tab writes.
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

  if (!storage || !state) {
    return <div className="p-6 text-sm text-neutral-400">The sandbox needs browser storage, which this browser has turned off.</div>;
  }

  const act = (action: SandboxAction) => {
    const r = dispatchSandbox(storage, actionId(), action, Date.now());
    setState(r.state);
    // Checked with `in`: the client project is not strict, so `ok` does not narrow.
    if ('error' in r) {
      setNote(null);
      setError(r.error);
    } else {
      setError(null);
      setNote(r.note);
    }
  };

  const now = sandboxNow(state, Date.now());
  const step = TUTORIAL[state.tutorial.step];
  const lvl = companyLevel(state.company.xp);
  const e = state.encounter;
  const active = e?.status === 'active';
  const nextWorkshop = WORKSHOP_STEPS[state.workshop.level + 1] ?? null;
  const job = state.workshop.job;
  const anyReady = ROLES.some((r) => state.chassis[r].status === 'ready');

  return (
    <div className="min-h-screen bg-[#0a0906] pb-10 text-neutral-200" style={{paddingTop: 'env(safe-area-inset-top)'}}>
      <header className="sticky top-0 z-10 border-b border-neutral-800 bg-[#0a0906]/95 px-3 py-2 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-2">
          <a href="/" className={`${secondary} inline-flex items-center`}>
            ← Game
          </a>
          <div className="text-right">
            <p className="text-sm font-semibold text-neutral-100">Field Sandbox</p>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">Practice · not your real base</p>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-xl flex-col gap-3 px-3 pt-3">
        {/* General Rider: one instruction at a time. */}
        <section className="flex gap-3 rounded-lg border border-cyan-800/70 bg-cyan-950/30 p-3" aria-live="polite">
          <img src="/guide/rider-portrait.webp" alt="General Rider" className="h-14 w-14 shrink-0 rounded-full border-2 border-cyan-400/80 object-cover" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-300">
              General Rider{state.tutorial.completed ? '' : ` · step ${state.tutorial.step + 1} of ${TUTORIAL.length}`}
            </p>
            <p className="mt-1 text-[15px] leading-snug text-neutral-100">{step.say}</p>
            <p className="mt-2 text-[13px] text-cyan-200">
              <span className="font-semibold">Objective:</span> {step.objective}
            </p>
            {!state.tutorial.completed && (
              <div className="mt-2 flex flex-wrap gap-2">
                {step.advance === 'next' && (
                  <button className={primary} onClick={() => act({type: 'tutorial.next'})}>
                    Next
                  </button>
                )}
                <button className="min-h-11 px-2 text-[13px] text-neutral-400 underline underline-offset-4" onClick={() => act({type: 'tutorial.skip'})}>
                  Skip tutorial
                </button>
              </div>
            )}
          </div>
        </section>

        {(note || error) && (
          <p className={`rounded border px-3 py-2 text-[13px] ${error ? 'border-red-900 bg-red-950/60 text-red-200' : 'border-emerald-900 bg-emerald-950/50 text-emerald-200'}`} role="status">
            {error ?? note}
          </p>
        )}

        {/* The encounter, first: it is where the thumb is needed most. */}
        <Card title={e ? `Patrol ${e.wave}` : 'Patrol'} right={e && <span className="text-[13px] text-neutral-400">{e.status === 'active' ? `Round ${e.round}` : e.status === 'won' ? 'Won' : 'Lost'}</span>}>
          {e && (
            <ul className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {e.enemies.map((enemy) => (
                <li key={enemy.id} className={`flex items-center gap-2 rounded border border-neutral-800 bg-black/30 p-2 ${enemy.hp <= 0 ? 'opacity-40' : ''}`}>
                  <EnemyArt kind={enemy.kind} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-red-200">
                      {ENEMY_SPEC[enemy.kind].label} <span className="font-normal text-neutral-500">(NPC)</span>
                    </p>
                    <Bar value={enemy.hp} max={enemy.maxHp} tone="bg-red-500" />
                    <p className="mt-0.5 font-mono text-[12px] text-neutral-400">{enemy.hp <= 0 ? 'Destroyed' : `${enemy.hp}/${enemy.maxHp}`}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2">
            {active ? (
              <>
                <button className={`${primary} flex-1`} onClick={() => act({type: 'encounter.fire'})} disabled={!anyReady}>
                  Fire
                </button>
                <button className={secondary} onClick={() => act({type: 'encounter.retreat'})}>
                  Retreat
                </button>
              </>
            ) : e?.status === 'won' && !e.claimed ? (
              <button className={`${primary} flex-1`} onClick={() => act({type: 'encounter.claim'})}>
                Collect supplies
              </button>
            ) : (
              <button className={`${primary} flex-1`} onClick={() => act({type: 'encounter.start'})} disabled={!anyReady}>
                {e ? `Start patrol ${state.stats.encountersWon + 1}` : 'Start patrol'}
              </button>
            )}
          </div>
          {!anyReady && !active && <p className="mt-2 text-[13px] text-amber-300">No chassis is ready. Repair or replace one above.</p>}

          {e && e.log.length > 0 && (
            <ol className="mt-3 max-h-48 space-y-0.5 overflow-y-auto rounded border border-neutral-800 bg-black/40 p-2 font-mono text-[12px] leading-relaxed text-neutral-300">
              {e.log.map((line, i) => (
                <li key={`${i}-${line}`}>{line}</li>
              ))}
            </ol>
          )}
        </Card>

        {/* The company: lasting identity. Chassis come and go. */}
        <Card title="Company" right={<span className="text-[13px] text-neutral-400">Level {lvl.level}</span>}>
          <p className="text-base font-semibold text-neutral-100">{state.company.name}</p>
          <div className="mt-2 flex items-center gap-2">
            <Bar value={lvl.into} max={lvl.need} tone="bg-cyan-500" />
            <span className="shrink-0 font-mono text-[12px] text-neutral-400">
              {lvl.into}/{lvl.need} XP
            </span>
          </div>
          <p className="mt-2 text-[13px] text-neutral-400">
            The company keeps its experience when a chassis is destroyed. Each company level adds 5% damage.
          </p>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {ROLES.map((role) => (
              <div key={role}>
                <ChassisCard role={role} state={state} now={now} busy={active} onAct={act} />
              </div>
            ))}
          </div>
        </Card>

        {/* Supplies and the upgrade they pay for. */}
        <Card title="Sandbox supplies">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[14px]">
            {SUPPLY_KINDS.map((k) => (
              <div key={k} className="flex justify-between">
                <dt className="text-neutral-400">{SUPPLY_LABEL[k]}</dt>
                <dd className="font-mono text-neutral-100">{state.supplies[k].toLocaleString()}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[12px] text-neutral-500">Sandbox-only. These never reach your real base or wallet.</p>
        </Card>

        <Card title="Field Workshop" right={<span className="text-[13px] text-neutral-400">Level {state.workshop.level}/{WORKSHOP_MAX_LEVEL}</span>}>
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
              <button className={`${primary} w-full`} onClick={() => act({type: 'workshop.start'})}>
                Start upgrade
              </button>
            </div>
          ) : (
            <p className="mt-2 text-[13px] text-neutral-400">At the sandbox maximum.</p>
          )}
        </Card>

        {/* Records: training kept apart from PvP. */}
        <Card title="Service record">
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
        </Card>

        {/* Test controls: sandbox clock only. */}
        <section className="rounded-lg border-2 border-dashed border-amber-700/70 bg-amber-950/20 p-3">
          <button className="flex min-h-11 w-full items-center justify-between text-left" onClick={() => setTestOpen((o) => !o)} aria-expanded={testOpen}>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Test controls</span>
            <span className="text-[13px] text-amber-200">{testOpen ? 'Hide' : 'Show'}</span>
          </button>
          {testOpen && (
            <div className="mt-2 space-y-2">
              <p className="text-[13px] text-amber-100/80">
                The test clock moves only this sandbox's own timers. It cannot touch your real base, the server clock or anyone else.
                {state.clockOffsetMs > 0 && ` Sandbox clock is ${Math.round(state.clockOffsetMs / 60_000)} min ahead.`}
              </p>
              <div className="flex flex-wrap gap-2">
                {[1, 5, 30].map((m) => (
                  <button key={m} className={secondary} onClick={() => act({type: 'clock.advance', minutes: m})}>
                    +{m} min
                  </button>
                ))}
                <button
                  className={`${secondary} text-red-300`}
                  onClick={() => {
                    if (window.confirm('Reset the sandbox? This clears the sandbox company only.')) {
                      setState(resetSandbox(storage, Date.now()));
                      setNote('Sandbox reset.');
                      setError(null);
                    }
                  }}
                >
                  Reset sandbox
                </button>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function ChassisCard({
  role,
  state,
  now,
  busy,
  onAct,
}: {
  role: Role;
  state: SandboxState;
  now: number;
  busy: boolean;
  onAct: (a: SandboxAction) => void;
}) {
  const c = state.chassis[role];
  const spec = CHASSIS_SPEC[role];
  const tone = c.status === 'destroyed' ? 'border-red-800 bg-red-950/30' : c.status === 'disabled' ? 'border-amber-700 bg-amber-950/20' : 'border-neutral-800 bg-black/30';
  const badge: Record<string, string> = {
    ready: 'Ready',
    disabled: 'Disabled',
    repairing: 'Repairing',
    destroyed: 'Destroyed',
    reinforcing: 'Replacement inbound',
  };
  const damaged = c.status === 'disabled' || (c.status === 'ready' && c.hp < spec.maxHp);
  return (
    <div className={`flex gap-2 rounded border p-2 sm:flex-col ${tone}`}>
      <img src={`/sandbox/units/${role}.svg`} alt={`${spec.label} chassis`} className={`h-16 w-16 shrink-0 ${c.status === 'destroyed' || c.status === 'reinforcing' ? 'opacity-30 grayscale' : ''}`} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-[14px] font-semibold text-neutral-100">
          {spec.label} <span className="font-mono text-[11px] font-normal text-neutral-500">#{String(c.serial).padStart(3, '0')}</span>
        </p>
        <p className={`text-[12px] font-semibold uppercase tracking-wide ${c.status === 'ready' ? 'text-emerald-300' : c.status === 'destroyed' ? 'text-red-300' : 'text-amber-300'}`}>
          {badge[c.status]}
          {c.readyAt !== null && (c.status === 'repairing' || c.status === 'reinforcing') && ` · ${clock(c.readyAt - now)}`}
        </p>
        <Bar value={c.hp} max={spec.maxHp} tone={c.hp / spec.maxHp > 0.5 ? 'bg-emerald-500' : 'bg-amber-500'} />
        <p className="text-[12px] leading-snug text-neutral-400">{spec.blurb}</p>
        {damaged && (
          <button className={`${secondary} w-full`} disabled={busy} onClick={() => onAct({type: 'chassis.repair', role})}>
            Repair ({REPAIR_COST.fuel}F · {REPAIR_COST.steel}S · {REPAIR_COST.alloy}A)
          </button>
        )}
        {c.status === 'destroyed' && (
          <button className={`${secondary} w-full`} disabled={busy} onClick={() => onAct({type: 'chassis.reinforce', role})}>
            Request replacement ({REINFORCE_COST.steel}S…)
          </button>
        )}
      </div>
    </div>
  );
}
