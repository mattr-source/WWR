/**
 * The Robot Bay: each robot troop as it really is - level, fitted parts,
 * real stats - what its next level installs and exactly what that changes,
 * and repair or remanufacture when a fight has hurt it. Also the Field
 * Workshop and a clearly marked look preview (test viewer, changes nothing).
 */
import {useState} from 'react';
import {
  FIELD_WORKSHOP_STEPS,
  ROLES,
  type Role,
  type SandboxAction,
  type SandboxState,
  SLOT_LABEL,
  WORKSHOP_MAX_LEVEL,
  nextInstall,
  partName,
  partsAt,
  remanufactureQuote,
  repairQuote,
  robotNeedsRepair,
  robotStats,
  workshopArmour,
  workshopRepairFactor,
} from '../../shared/sandbox';
import {PART_SLOTS, SANDBOX_SEASON_1_TEST} from '../../shared/sandboxSeason';
import {RobotFigure} from './RobotFigure';
import {Bar, CostLine, Section, TempArtTag, clock, minutesLabel, primary, secondary, testButton} from './ui';

const CONFIG = SANDBOX_SEASON_1_TEST;

const STATUS_WORD: Record<string, string> = {
  ready: 'Ready',
  disabled: 'Disabled',
  destroyed: 'Destroyed',
  repairing: 'Repairing',
  remanufacturing: 'Remanufacturing',
  upgrading: 'Fitting a part',
};

function StatRow({label, before, after}: {label: string; before: number; after?: number}) {
  const delta = after === undefined ? 0 : after - before;
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-neutral-800/80 py-1 text-[13px] last:border-0">
      <span className="text-neutral-400">{label}</span>
      <span className="font-mono text-neutral-100">
        {before}
        {after !== undefined && (
          <>
            {' → '}
            <span className={delta > 0 ? 'text-emerald-300' : 'text-neutral-100'}>{after}</span>
            {delta > 0 && <span className="ml-1 text-[12px] text-emerald-400">(+{delta})</span>}
          </>
        )}
      </span>
    </div>
  );
}

export default function RobotBay({state, now, busy, initialRole, onAct, onTestAdvance}: {state: SandboxState; now: number; busy: boolean; initialRole?: Role; onAct: (a: SandboxAction) => void; onTestAdvance: (minutes: number) => void}) {
  const [role, setRole] = useState<Role>(initialRole ?? 'scout');
  const [preview, setPreview] = useState<number | null>(null);
  const r = state.robots[role];
  const stats = robotStats(role, r.level);
  const parts = partsAt(r.level);
  const q = nextInstall(r);
  const out = !!state.march && state.march.robots.includes(role);
  const bayBusy = ROLES.some((x) => state.robots[x].status === 'upgrading');
  const job = r.job;
  const wjob = state.workshop.job;
  const nextWorkshop = FIELD_WORKSHOP_STEPS[state.workshop.level + 1] ?? null;
  const previewParts = preview === null ? null : partsAt(preview);

  return (
    <>
      <div className="grid grid-cols-3 gap-1.5" role="tablist">
        {ROLES.map((x) => (
          <button key={x} role="tab" aria-selected={x === role} className={`${x === role ? 'border-cyan-400 bg-cyan-950/60 text-cyan-100' : 'border-neutral-700 bg-neutral-900 text-neutral-300'} min-h-11 rounded-md border text-[13px] font-semibold`} onClick={() => setRole(x)}>
            {CONFIG.roles[x].label} <span className="font-mono text-[11px] opacity-80">Lv {state.robots[x].level}</span>
          </button>
        ))}
      </div>

      <Section title={`${CONFIG.roles[role].label} · level ${r.level}`} right={<TempArtTag />}>
        <div className="flex gap-3">
          <div className="relative flex w-[42%] shrink-0 items-end justify-center rounded-lg bg-gradient-to-b from-[#1b2227] to-[#0c0f11] py-2">
            <RobotFigure role={role} parts={previewParts ?? parts} height={190} status={preview === null ? (r.status === 'destroyed' || r.status === 'disabled' ? r.status : 'ready') : 'ready'} idle />
            {preview !== null && <span className="absolute left-1 top-1 rounded bg-amber-900/90 px-1.5 text-[10px] font-bold uppercase text-amber-100">Preview Lv {preview}</span>}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] leading-snug text-neutral-400">{CONFIG.roles[role].blurb}</p>
            <p className={`mt-1 text-[13px] font-semibold ${r.status === 'ready' ? 'text-emerald-300' : r.status === 'destroyed' ? 'text-red-300' : 'text-amber-300'}`}>
              {out ? 'Out with the Task Force' : STATUS_WORD[r.status]}
              {job && ` · ${clock(job.completesAt - now)}`}
            </p>
            {job && <Bar value={now - job.startedAt} max={job.completesAt - job.startedAt} tone="bg-cyan-500" label="Job progress" />}
            <div className="mt-2">
              <StatRow label="HP" before={Math.round(r.hp)} />
              <StatRow label="Max HP" before={stats.maxHp} />
              <StatRow label="Firepower" before={stats.damage} />
              {stats.heal > 0 && <StatRow label="Field repair / round" before={stats.heal} />}
            </div>
            <p className="mt-1 text-[11px] text-neutral-500">Serial #{String(r.serial).padStart(3, '0')} · {r.sorties} sortie{r.sorties === 1 ? '' : 's'} on this frame</p>
          </div>
        </div>
        <ul className="mt-2 grid grid-cols-1 gap-0.5 text-[12px]">
          {PART_SLOTS.map((slot) => (
            <li key={slot} className={`flex justify-between rounded px-1.5 py-0.5 ${q && q.slot === slot ? 'bg-cyan-950/50' : ''}`}>
              <span className="text-neutral-400">{slot === 'gear' ? CONFIG.roles[role].gearName : SLOT_LABEL[slot]}</span>
              <span className="font-mono text-neutral-200">Mk {(previewParts ?? parts)[slot] + 1}</span>
            </li>
          ))}
        </ul>
      </Section>

      {(r.status === 'destroyed' || robotNeedsRepair(r)) && !out && (
        <Section title={r.status === 'destroyed' ? 'Remanufacture' : 'Repair'}>
          {r.status === 'destroyed'
            ? (() => {
                const rq = remanufactureQuote(r, state.workshop.level);
                return (
                  <div className="space-y-2">
                    <p className="text-[13px] text-neutral-300">A new frame is built with every part it had: it comes back at level {r.level}, Mk for Mk. Takes {minutesLabel(rq.minutes)}.</p>
                    <CostLine cost={rq.cost} have={state.supplies} />
                    <button className={`${primary} w-full`} disabled={busy} onClick={() => onAct({type: 'robot.remanufacture', role})}>
                      Remanufacture {CONFIG.roles[role].label}
                    </button>
                    <p className="text-[11px] text-neutral-500">Short of supplies, it is still rebuilt free, {CONFIG.emergencySlowdown}x slower.</p>
                  </div>
                );
              })()
            : (() => {
                const rq = repairQuote(r, state.workshop.level);
                return (
                  <div className="space-y-2">
                    <p className="text-[13px] text-neutral-300">
                      {Math.round(r.hp)} / {stats.maxHp} HP. Back to full in {minutesLabel(rq.minutes)}.
                    </p>
                    <CostLine cost={rq.cost} have={state.supplies} />
                    <button className={`${primary} w-full`} disabled={busy} onClick={() => onAct({type: 'robot.repair', role})}>
                      Repair {CONFIG.roles[role].label}
                    </button>
                    <p className="text-[11px] text-neutral-500">Short of supplies, field crews repair it free, {CONFIG.emergencySlowdown}x slower.</p>
                  </div>
                );
              })()}
        </Section>
      )}

      <Section title="Next level" right={<span className="text-[12px] text-neutral-500">Test cap {CONFIG.robotMaxLevel}</span>}>
        {q ? (
          <div className="space-y-2">
            <p className="text-[14px] text-neutral-100">
              Level {r.level} → <b>{q.toLevel}</b>: the bay removes the <b>{q.fromPart}</b> and fits a <b className="text-cyan-200">{q.toPart}</b>.
            </p>
            <div className="rounded border border-neutral-800 bg-black/30 px-2">
              <StatRow label="Max HP" before={q.before.maxHp} after={q.after.maxHp} />
              <StatRow label="Firepower" before={q.before.damage} after={q.after.damage} />
              {q.after.heal > 0 && <StatRow label="Field repair / round" before={q.before.heal} after={q.after.heal} />}
            </div>
            <CostLine cost={q.cost} have={state.supplies} credits={q.cost.credits} haveCredits={state.credits} />
            <p className="text-[12px] text-neutral-400">Takes {minutesLabel(q.minutes)}. Test-only cost and time.</p>
            <button
              className={`${primary} w-full`}
              disabled={busy || out || r.status !== 'ready' || bayBusy}
              onClick={() => onAct({type: 'robot.upgrade', role})}
            >
              {r.status === 'upgrading' ? 'Fitting…' : bayBusy ? 'Bay busy with another robot' : out ? 'Out with the Task Force' : r.status !== 'ready' ? `${STATUS_WORD[r.status]}: not available` : `Upgrade to level ${q.toLevel}`}
            </button>
            {r.status === 'upgrading' && job && (
              <button className={`${testButton} w-full`} disabled={busy} onClick={() => onTestAdvance(Math.max(1, Math.ceil((job.completesAt - now) / 60_000)))}>
                Test: finish now (+{Math.max(1, Math.ceil((job.completesAt - now) / 60_000))} min sandbox clock)
              </button>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-neutral-400">At the level {CONFIG.robotMaxLevel} test cap. (Level 50 is a look milestone, not a confirmed game cap.)</p>
        )}
      </Section>

      <section className="rounded-lg border-2 border-dashed border-amber-700/70 bg-amber-950/20 p-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Look preview (test viewer)</h2>
        <p className="mt-1 text-[12px] text-amber-100/80">See how a {CONFIG.roles[role].label} looks at any level from 1 to {CONFIG.robotMaxLevel}. Preview only: it gives nothing and changes nothing.</p>
        <input
          type="range"
          min={1}
          max={CONFIG.robotMaxLevel}
          value={preview ?? r.level}
          onChange={(ev) => setPreview(Number(ev.target.value))}
          className="mt-2 h-11 w-full accent-amber-500"
          aria-label="Preview level"
        />
        <div className="flex items-center justify-between text-[12px] text-amber-100/80">
          <span>Lv {preview ?? r.level}</span>
          {preview !== null && (
            <button className={secondary} onClick={() => setPreview(null)}>
              Back to real look
            </button>
          )}
        </div>
      </section>

      <Section title="Field Workshop" right={<span className="text-[13px] text-neutral-400">Level {state.workshop.level}/{WORKSHOP_MAX_LEVEL}</span>}>
        <p className="text-[13px] text-neutral-300">
          Damage taken x{workshopArmour(state.workshop.level).toFixed(2)} · Robot repair time x{workshopRepairFactor(state.workshop.level).toFixed(2)}
        </p>
        {wjob ? (
          <p className="mt-2 text-[13px] text-orange-200">
            Upgrading to level {wjob.toLevel} · <span className="font-mono">{clock(wjob.completesAt - now)}</span> left
          </p>
        ) : nextWorkshop ? (
          <div className="mt-2 space-y-2">
            <p className="text-[13px] text-neutral-400">
              Level {state.workshop.level + 1}: damage taken x{workshopArmour(state.workshop.level + 1).toFixed(2)}, robot repairs x{workshopRepairFactor(state.workshop.level + 1).toFixed(2)}. Takes {nextWorkshop.minutes} min.
            </p>
            <CostLine cost={nextWorkshop.cost} have={state.supplies} />
            <button className={`${secondary} w-full`} disabled={busy} onClick={() => onAct({type: 'workshop.start'})}>
              Start Workshop upgrade
            </button>
          </div>
        ) : (
          <p className="mt-2 text-[13px] text-neutral-400">At the sandbox maximum.</p>
        )}
      </Section>
      <p className="px-1 text-[11px] leading-snug text-neutral-500">
        {partName(role, 'head', 0)} and the rest are proposal names. Robot and Dominion figures are temporary vector art drawn for this test build, not approved final art. Robot costs, timers and part bonuses are test-only numbers.
      </p>
    </>
  );
}
