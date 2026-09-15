/**
 * The account menu, the Task Force line-up and battle reports, in the live
 * presentation, for the practice sandbox.
 *
 * - AccountPanel follows src/live/LiveApp.tsx PlayerPanel: portrait and name,
 *   a two-column readout, then a list of doors. The live doors that need the
 *   game server (profile, customise, alliance, settings, sign out) are not
 *   offered; the panel says so.
 * - SquadSetup follows the Task Force card in src/live/Squads.tsx: name, the
 *   slots-filled bar, the drone line, the 3 x 2 slot grid and "Repair damaged
 *   assets". In the sandbox the six slots are the practice Task Force's three
 *   robot troops and three Assets; tapping a slot sends it or keeps it home.
 *   Bravo, Charlie and Delta show the live unlock levels and say they are not
 *   in the practice sandbox.
 */
import type {ReactNode} from 'react';
import {TASK_FORCE_UNLOCK} from '../../../shared/season';
import {assetArtUrl} from '../../../shared/assetVisuals';
import {ROLE_LABEL} from '../../../shared/assets';
import {DRONE_WORDING} from '../../../shared/drones';
import {ROLES, type Role, SUPPLY_KINDS, type SandboxState, assetNeedsRepair, assetOf, assetStats, battleCasualties, describeReward, isDrone, partsAt, robotNeedsRepair, robotStats, siteLabel} from '../../../shared/sandbox';
import {SANDBOX_SEASON_1_TEST} from '../../../shared/sandboxSeason';
import {RobotFigure} from '../RobotFigure';
import {SUPPLY_LABEL} from '../ui';

const CONFIG = SANDBOX_SEASON_1_TEST;
const SQUAD_NAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta'] as const;

export type PanelDoor = 'more' | 'season' | 'ops' | 'bay' | 'hangar' | 'repair' | 'reports';

export function AccountPanel({state, week, day, level, onOpen}: {state: SandboxState; week: number; day: number; level: number; onOpen: (door: PanelDoor) => void}) {
  const item = 'block min-h-11 w-full px-3 py-2.5 text-left text-sm text-neutral-200 hover:bg-neutral-900';
  return (
    <div className="max-h-[75dvh] overflow-y-auto rounded border border-neutral-800 bg-neutral-950" role="dialog" aria-label="Account">
      <div className="flex items-center gap-3 border-b border-neutral-800 px-3 py-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-600 bg-black text-lg text-orange-300" aria-hidden>
          ★
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-neutral-100">{state.company.name}</p>
          <p className="truncate text-[11px] text-neutral-500">Practice sandbox · no alliance</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-b border-neutral-800 px-3 py-3 text-[11px]">
        <dt className="text-neutral-500">Task Force level</dt>
        <dd className="text-right font-mono text-neutral-200">{level}</dd>
        <dt className="text-neutral-500">Practice week</dt>
        <dd className="text-right font-mono text-neutral-200">
          {week} · day {day + 1}
        </dd>
        {SUPPLY_KINDS.map((k) => (
          <div key={k} className="contents">
            <dt className="text-neutral-500">{SUPPLY_LABEL[k]}</dt>
            <dd className="text-right font-mono text-neutral-200">{state.supplies[k].toLocaleString()}</dd>
          </div>
        ))}
        <dt className="text-neutral-500">test Credits</dt>
        <dd className="text-right font-mono text-neutral-200">{state.credits.toLocaleString()}</dd>
      </dl>

      <button onClick={() => onOpen('season')} className={item}>
        Season 1 Events
      </button>
      <button onClick={() => onOpen('more')} className={item}>
        Command Center · record and test controls
      </button>
      <button onClick={() => onOpen('bay')} className={item}>
        Robot Bay
      </button>
      <button onClick={() => onOpen('hangar')} className={item}>
        Hangar
      </button>
      <a href="/" className={`${item} border-t border-neutral-800 text-cyan-300`}>
        Back to the game
      </a>
      <p className="border-t border-neutral-800 px-3 py-2 text-[11px] text-neutral-500">Profile, customise, alliance, settings and sign out need the game server: not in the practice sandbox.</p>
    </div>
  );
}

function Slot({on, ready, label, sub, hp, art, onClick, dataSlot}: {on: boolean; ready: boolean; label: string; sub: string; hp: number; art: ReactNode; onClick: () => void; dataSlot: string}) {
  const pct = Math.round(Math.max(0, Math.min(1, hp)) * 100);
  return (
    <button
      onClick={onClick}
      data-slot={dataSlot}
      aria-pressed={on}
      aria-label={`${label}: ${on ? 'in the line-up' : 'kept home'}${ready ? '' : ', not ready'}`}
      className={`flex min-h-[5.25rem] w-full min-w-0 flex-col justify-center rounded border px-1.5 py-1 text-left transition ${on ? 'border-neutral-700 bg-neutral-900 hover:border-neutral-500' : 'border-dashed border-neutral-800 bg-neutral-950 opacity-60 hover:border-neutral-600'}`}
    >
      <span className="flex flex-col items-center gap-0.5 text-center">
        <span className="flex h-10 w-10 shrink-0 items-end justify-center">{art}</span>
        <span className="w-full min-w-0">
          <span className="block truncate text-xs font-semibold text-neutral-100">{label}</span>
          <span className="block truncate text-[10px] text-neutral-400">{on ? sub : 'kept home'}</span>
          {pct < 100 && (
            <span className="mt-0.5 block h-1 w-full overflow-hidden rounded-full bg-neutral-800">
              <span className={`block h-full rounded-full ${pct <= 0 ? 'bg-red-600' : pct < 50 ? 'bg-orange-500' : 'bg-emerald-500'}`} style={{width: `${Math.max(2, pct)}%`}} />
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

export function SquadSetup({state, squad, onSet, onRepairs}: {state: SandboxState; squad: string; onSet: (robots: Role[], assets: string[]) => void; onRepairs: () => void}) {
  if (squad !== 'Alpha') {
    const name = SQUAD_NAMES.includes(squad as never) ? squad : 'Bravo';
    return (
      <section className="rounded border border-dashed border-neutral-800 bg-neutral-950/60 p-3" data-squad={name}>
        <h3 className="text-sm font-semibold text-neutral-400">Task Force {name}</h3>
        <p className="mt-1 text-[11px] text-neutral-500">In the live game it opens at Command Center level {TASK_FORCE_UNLOCK[name as keyof typeof TASK_FORCE_UNLOCK]}. The practice sandbox has one Task Force, Alpha.</p>
      </section>
    );
  }
  const line = state.squad ?? {robots: [...ROLES], assets: state.assets.map((a) => a.assetId)};
  const out = !!state.march;
  const filled = line.robots.length + line.assets.length;
  const hasDrone = line.assets.some(isDrone);
  const hurt = ROLES.some((r) => state.robots[r].status !== 'ready' || robotNeedsRepair(state.robots[r])) || state.assets.some((a) => a.status !== 'ready' || assetNeedsRepair(a));
  const toggleRobot = (r: Role) => onSet(line.robots.includes(r) ? line.robots.filter((x) => x !== r) : [...line.robots, r], line.assets);
  const toggleAsset = (id: string) => onSet(line.robots, line.assets.includes(id) ? line.assets.filter((x) => x !== id) : [...line.assets, id]);
  return (
    <section className={`rounded border bg-neutral-950 p-3 ${out ? 'border-neutral-900 opacity-60' : 'border-neutral-800'}`} data-squad="Alpha">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-neutral-100">
          Task Force Alpha
          {out && <span className="ml-2 rounded border border-orange-800 px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wider text-orange-300">away</span>}
        </h3>
        <span className="text-[12px] text-neutral-400">
          <span className="font-mono text-neutral-200">{filled}</span>/6 in the line-up
        </span>
      </div>
      <span className="mt-2 block h-1 overflow-hidden rounded-full bg-neutral-900">
        <span className="block h-full rounded-full bg-neutral-500" style={{width: `${(filled / 6) * 100}%`}} />
      </span>
      <p role={hasDrone ? undefined : 'alert'} className={`mt-2 rounded px-2 py-1 text-[12px] ${hasDrone ? 'text-neutral-400' : 'border border-red-800 bg-red-950/50 font-semibold text-red-200'}`}>
        {hasDrone ? 'Tap a slot to send it or keep it home. Attack on the World Map sends this line-up.' : DRONE_WORDING.needDrone}
      </p>
      {hurt && !out && (
        <button onClick={onRepairs} className="mt-2 min-h-11 w-full rounded border border-cyan-700 bg-cyan-950/30 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-cyan-200 hover:bg-cyan-900/40">
          Repair damaged units
        </button>
      )}
      <div className="mt-3 grid grid-flow-col grid-cols-3 grid-rows-2 gap-2">
        {ROLES.map((r) => {
          const robot = state.robots[r];
          return (
            <div key={r} className="min-w-0">
              <Slot
                dataSlot={`Alpha:${r}`}
                on={line.robots.includes(r)}
                ready={robot.status === 'ready'}
                label={CONFIG.roles[r].label}
                sub={robot.status === 'ready' ? `Lv ${robot.level} · robot` : robot.status}
                hp={robot.status === 'destroyed' ? 0 : robot.hp / robotStats(r, robot.level).maxHp}
                art={<RobotFigure role={r} parts={partsAt(robot.level)} height={40} status={robot.status === 'destroyed' || robot.status === 'disabled' ? robot.status : 'ready'} />}
                onClick={() => !out && toggleRobot(r)}
              />
            </div>
          );
        })}
        {state.assets.map((a) => {
          const asset = assetOf(a.assetId);
          const url = assetArtUrl(a.assetId, a.rank);
          return (
            <div key={a.assetId} className="min-w-0">
              <Slot
                dataSlot={`Alpha:${a.assetId}`}
                on={line.assets.includes(a.assetId)}
                ready={a.status === 'ready'}
                label={asset?.name ?? a.assetId}
                sub={a.status === 'ready' ? `R${a.rank} · ${asset ? ROLE_LABEL[asset.role] : 'Asset'}` : a.status}
                hp={a.hp / assetStats(a).maxHp}
                art={url ? <img src={url} alt="" className="h-10 w-10 object-contain" /> : null}
                onClick={() => !out && toggleAsset(a.assetId)}
              />
            </div>
          );
        })}
      </div>
      {out && <p className="mt-2 text-[11px] text-neutral-500">Task Force Alpha is out. Change the line-up when it is home.</p>}
    </section>
  );
}

/** Battle reports: the latest practice battle, and the service record. */
export function Reports({state}: {state: SandboxState}) {
  const e = state.encounter;
  const s = state.stats;
  return (
    <div className="space-y-3" data-reports>
      {e ? (
        <section className="rounded border border-neutral-800 bg-neutral-950 p-3">
          <p className={`text-[15px] font-bold ${e.status === 'won' ? 'text-amber-200' : 'text-red-300'}`}>
            {e.status === 'won' ? 'Victory' : e.withdrew ? 'Withdrawn' : 'Defeat'} · {siteLabel(e.siteKind)}
          </p>
          <p className="text-[12px] text-neutral-400">
            {e.rounds.length} round{e.rounds.length === 1 ? '' : 's'} · {e.kills}/{e.enemiesStart.length} Dominion machines destroyed
          </p>
          <p className="mt-1 text-[13px] text-neutral-200">{e.reward ? `Brought home: ${describeReward(e.reward)}` : 'No reward.'}</p>
          {(() => {
            const c = battleCasualties(e);
            const n = c.destroyed.length + c.disabled.length + c.assetsDisabled.length;
            return n > 0 ? <p className="text-[12px] text-amber-300">{n} unit{n === 1 ? '' : 's'} came home damaged or destroyed.</p> : null;
          })()}
        </section>
      ) : (
        <p className="rounded border border-neutral-800 p-3 text-sm text-neutral-500">No practice battles yet.</p>
      )}
      <dl className="grid grid-cols-2 gap-2 text-[13px]">
        {(
          [
            ['Battles won / lost', `${s.battlesWon} / ${s.battlesLost}`],
            ['Training kills (NPC)', s.trainingKills],
            ['Patrols won', s.patrolWins],
            ['Exercises done', s.exercisesDone],
            ['Robots destroyed', s.robotsDestroyed],
            ['Confirmed PvP destructions', 0],
          ] as Array<[string, number | string]>
        ).map(([k, v]) => (
          <div key={k} className="rounded border border-neutral-800 p-2">
            <dt className="text-neutral-400">{k}</dt>
            <dd className="font-mono text-lg text-neutral-100">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[11px] text-neutral-500">Practice battles against simulated enemies only. Live battle reports need the game server.</p>
    </div>
  );
}
