/**
 * The install ceremony, played for EVERY robot level (Matt: "Animated
 * upgrades at each level even if its just one item").
 *
 * The robot hangs in the Robot Bay's chamber, the gantry arms come down, the
 * old part is lifted off and the new one lowered into place, welded, and the
 * robot powers up. Then the real before/after numbers from the engine. The
 * part that was fitted stays on the robot everywhere afterwards, because
 * every figure is drawn from the robot's real level.
 *
 * Skippable at any moment; skipping or finishing records it as seen, so a
 * reload does not replay it. Under prefers-reduced-motion it opens on the
 * finished robot and the numbers.
 */
import {useEffect, useState} from 'react';
import {type Install, partName, partsAt, robotStats} from '../../shared/sandbox';
import {SANDBOX_SEASON_1_TEST} from '../../shared/sandboxSeason';
import {RobotFigure, RobotPartSvg} from './RobotFigure';
import {TempArtTag, primary} from './ui';

const CONFIG = SANDBOX_SEASON_1_TEST;
const FIGURE_H = 230;
/** When the numbers appear. */
const REVEAL_MS = 3300;

export default function InstallCeremony({install, reduced, onDone}: {install: Install; reduced: boolean; onDone: () => void}) {
  const [revealed, setRevealed] = useState(reduced);
  useEffect(() => {
    if (reduced) return;
    const id = window.setTimeout(() => setRevealed(true), REVEAL_MS);
    return () => window.clearTimeout(id);
  }, [reduced]);

  const {role, slot, fromLevel, toLevel} = install;
  const after = partsAt(toLevel);
  const tier = after[slot];
  const before = robotStats(role, fromLevel);
  const now = robotStats(role, toLevel);
  const rows: Array<[string, number, number]> = [
    ['Max HP', before.maxHp, now.maxHp],
    ['Firepower', before.damage, now.damage],
    ...(now.heal > 0 ? ([['Field repair / round', before.heal, now.heal]] as Array<[string, number, number]>) : []),
  ];
  const label = CONFIG.roles[role].label;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#05080a] text-neutral-100" role="dialog" aria-label={`${label} upgrade to level ${toLevel}`}>
      <div className="flex items-center justify-between px-3" style={{paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)'}}>
        <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-cyan-300">Robot Bay · Level {toLevel}</p>
        {!revealed && (
          <button className="min-h-11 px-3 text-[14px] text-neutral-300 underline underline-offset-4" onClick={() => setRevealed(true)}>
            Skip
          </button>
        )}
      </div>

      <div className={`sbx-chamber relative mx-auto mt-1 flex w-full max-w-sm flex-1 items-end justify-center overflow-hidden ${reduced ? 'sbx-still' : ''}`} style={{minHeight: FIGURE_H + 90}}>
        {/* Chamber: back wall, light columns, floor grate. */}
        <div className="absolute inset-x-6 bottom-6 top-4 rounded-t-[40px] border-2 border-cyan-900/70 bg-gradient-to-b from-[#0e1a20] via-[#0b1418] to-[#070b0d]" />
        <div className="sbx-chamber-light absolute inset-x-16 bottom-6 top-8 bg-gradient-to-b from-cyan-400/0 via-cyan-400/10 to-cyan-300/25" />
        <div className="absolute inset-x-10 bottom-4 h-5 rounded-full bg-cyan-900/40 blur-[1px]" />

        {/* Gantry arms coming down to the part. */}
        <div className="sbx-arm sbx-arm-left absolute top-0" style={{left: '22%'}} aria-hidden="true">
          <div className="mx-auto h-28 w-2.5 rounded bg-gradient-to-b from-neutral-600 to-neutral-400" />
          <div className="-mt-1 h-3 w-8 rounded-sm bg-amber-500" />
        </div>
        <div className="sbx-arm sbx-arm-right absolute top-0" style={{right: '22%'}} aria-hidden="true">
          <div className="mx-auto h-28 w-2.5 rounded bg-gradient-to-b from-neutral-600 to-neutral-400" />
          <div className="-mt-1 h-3 w-8 rounded-sm bg-amber-500" />
        </div>

        <div className="relative mb-8" style={{height: FIGURE_H}}>
          <div className={revealed ? 'sbx-powered' : undefined}>
            <RobotFigure role={role} parts={after} height={FIGURE_H} hide={revealed ? null : slot} highlight={revealed ? slot : null} idle={revealed && !reduced} title={`${label} robot, level ${toLevel} (temporary vector art)`} />
          </div>
          {!revealed && (
            <>
              <div className="sbx-part-out pointer-events-none absolute inset-0">
                <RobotPartSvg role={role} slot={slot} tier={tier - 1} height={FIGURE_H} />
              </div>
              <div className="sbx-part-in pointer-events-none absolute inset-0">
                <RobotPartSvg role={role} slot={slot} tier={tier} height={FIGURE_H} />
              </div>
              <div className="sbx-weld-burst pointer-events-none absolute left-1/2 top-1/3 h-16 w-16 -translate-x-1/2 rounded-full bg-amber-200/70 blur-md" />
              <div className="sbx-power-flash pointer-events-none absolute inset-0 rounded-full bg-cyan-300/40 blur-2xl" />
            </>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-sm px-3" style={{paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)'}}>
        <p className="text-center text-[14px] leading-snug text-neutral-300">
          Removed <b className="text-neutral-100">{partName(role, slot, tier - 1)}</b>
          <br />
          Fitted <b className="text-cyan-200">{partName(role, slot, tier)}</b>
        </p>
        <div className={`mt-2 rounded-lg border border-neutral-800 bg-black/40 px-3 py-1 transition-opacity duration-500 ${revealed ? 'opacity-100' : 'opacity-0'}`} aria-hidden={!revealed}>
          {rows.map(([name, b, a]) => (
            <div key={name} className="flex items-baseline justify-between border-b border-neutral-800/70 py-1.5 text-[14px] last:border-0">
              <span className="text-neutral-400">{name}</span>
              <span className="font-mono">
                {b} → <span className={a > b ? 'text-emerald-300' : ''}>{a}</span>
                {a > b && <span className="ml-1 text-[12px] text-emerald-400">+{a - b}</span>}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <TempArtTag />
          <button className={`${primary} flex-1`} disabled={!revealed} onClick={onDone}>
            {label} level {toLevel} · Continue
          </button>
        </div>
      </div>
    </div>
  );
}
