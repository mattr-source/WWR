/**
 * A levelled building's header: its level, what the next level gives, the
 * cost line in resources with shortfalls in red, the Start button, and the
 * timer while one runs. Sits at the top of every building's sheet.
 *
 * The server owns every number. The panel recomputes the price for display
 * from the same shared table the server charges from, so the two can never
 * disagree by more than a deploy.
 */
import {useEffect, useState} from 'react';
import {type BaseLevelsView, api, ApiError} from '../net/api';
import {type MessageKey, t} from '../i18n';
import {
  type LevelledBuilding,
  CATEGORY_OF_HUB,
  PRODUCER_OF,
  RESOURCE_KINDS,
  RESOURCE_LABEL,
  buildingBlock,
  buildingCapForSeason,
  buildingStep,
  effectLine,
  engineerMultiplier,
  shortfall,
} from '../../shared/buildings';
import {balanceProfileById} from '../../shared/balance';
import {formatClock} from '../../shared/gametime';
import {guideEvent} from './guide/bus';

export function remaining(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function buildingLabel(b: LevelledBuilding): string {
  return t(`building.${b}` as MessageKey) || b;
}

export type GoTo = LevelledBuilding;

export default function BuildingPanel({
  building,
  base,
  onChanged,
  onGoTo,
}: {
  building: LevelledBuilding;
  base: BaseLevelsView;
  onChanged: (next: BaseLevelsView) => void;
  /**
   * Leave this sheet for the building that clears the block - the Command
   * Center or Warehouse that gates the level, or the producer / Depot for a
   * resource shortfall. A blocked upgrade that only says why is a dead end.
   */
  onGoTo?: (where: GoTo) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const running = base.jobs.filter((j) => j.completesAt > now);
  const mine = base.jobs.find((j) => j.building === building) ?? null;
  const due = base.jobs.some((j) => j.completesAt <= now);

  // Tick while anything runs; when a job lands, ask the server to fold it in.
  useEffect(() => {
    if (base.jobs.length === 0) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [base.jobs.length]);
  useEffect(() => {
    if (!due) return;
    let live = true;
    api
      .baseLevels()
      .then((b) => live && onChanged(b))
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [due]);

  const level = base.levels[building];
  const next = level + 1;
  const cap = buildingCapForSeason(base.season);
  // The profile the server named; an id this build does not know prices from
  // the shipped tables, and the server's own refusal is the final word.
  const step = buildingStep(building, next, balanceProfileById(base.balance?.id));
  const blocked = buildingBlock(building, base.levels, base.season);
  const short = shortfall(base.resources, step.cost);
  const queueFull = running.length >= base.queues;
  useEffect(() => {
    const k = RESOURCE_KINDS.find((x) => short[x]);
    if (k && !blocked) guideEvent(`tip:shortfall:amount=${short[k]}:resource=${RESOURCE_LABEL[k]}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [building]);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      onChanged(await api.startLevel(building));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  const category = CATEGORY_OF_HUB[building];
  const canStart = !blocked && !mine && !queueFull && Object.keys(short).length === 0;

  return (
    <section className="rounded border border-neutral-800 bg-neutral-900/40 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-neutral-100">
          {buildingLabel(building)}
          <span className="ml-2 text-[10px] font-normal uppercase tracking-[0.2em] text-neutral-500">
            {category ? 'Category Systems Upgrade' : building === 'command_center' ? 'Base Level' : 'Department'}
          </span>
        </h3>
        <span className="font-mono text-xs text-neutral-300">
          Lv <span className="text-orange-300">{level}</span>
          <span className="text-neutral-600"> / {cap}</span>
        </span>
      </div>

      <p className="mt-1 text-[11px] leading-relaxed text-neutral-400">{effectLine(building, level, cap)}</p>

      {mine && mine.completesAt > now ? (
        <div className="mt-2 flex items-center justify-between rounded border border-orange-900/60 bg-orange-950/20 px-2 py-1.5 text-[11px]">
          <span className="text-orange-200">Building level {mine.toLevel}</span>
          <span className="font-mono text-neutral-300">
            Completes {formatClock(mine.completesAt)} RST ·{' '}
            <span className="text-orange-300">{remaining(mine.completesAt - now)}</span> remaining
          </span>
        </div>
      ) : level >= cap ? (
        <p className="mt-2 text-[11px] text-neutral-500">Season {base.season} cap reached.</p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            <span className="text-neutral-500">Level {next}:</span>
            {RESOURCE_KINDS.filter((k) => step.cost[k] > 0).map((k) => (
              <span key={k} className={short[k] ? 'text-red-400' : 'text-neutral-300'}>
                {RESOURCE_LABEL[k]}{' '}
                <span className="font-mono">{step.cost[k].toLocaleString()}</span>
                <span className="text-neutral-600">/{base.resources[k].toLocaleString()}</span>
              </span>
            ))}
            <span className="font-mono text-neutral-300">
              {remaining(Math.round(step.ms * engineerMultiplier(base.levels.engineer_support_yard)))}
            </span>
            <button
              onClick={() => void start()}
              disabled={busy || !canStart}
              className="ml-auto shrink-0 rounded border border-orange-600 bg-orange-950/40 px-3 py-1 text-xs font-semibold text-orange-200 transition hover:bg-orange-900/40 disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-transparent disabled:text-neutral-600"
            >
              Start Level {next}
            </button>
          </div>
          {!canStart && (() => {
            const shortKind = RESOURCE_KINDS.find((x) => short[x]);
            const gate: GoTo | null = blocked
              ? blocked.startsWith('Command Center')
                ? 'command_center'
                : blocked.startsWith('Quartermaster')
                  ? 'quartermaster_warehouse'
                  : null
              : null;
            const go = (where: GoTo, label: string) =>
              onGoTo && where !== building ? (
                <button
                  key={where}
                  onClick={() => onGoTo(where)}
                  className="rounded border border-amber-700/70 px-1.5 py-px text-[10px] font-semibold text-amber-300 hover:border-amber-400 hover:text-amber-100"
                >
                  {label} ›
                </button>
              ) : null;
            return (
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-neutral-500">
                <span>
                  {blocked ??
                    (queueFull
                      ? base.queues === 1
                        ? 'The engineers are busy. One upgrade at a time.'
                        : 'Both engineer teams are busy.'
                      : shortKind
                        ? `Need ${short[shortKind]!.toLocaleString()} more ${RESOURCE_LABEL[shortKind]}. Produce it at ${buildingLabel(
                            PRODUCER_OF[shortKind],
                          )} or buy it at the Depot.`
                        : null)}
                </span>
                {gate && go(gate, gate === 'command_center' ? 'Go to Command Center' : 'Go to Warehouse')}
                {!blocked && !queueFull && shortKind && go(PRODUCER_OF[shortKind], `Go to ${buildingLabel(PRODUCER_OF[shortKind])}`)}
                {!blocked && !queueFull && shortKind && go('depot', 'Buy at the Depot')}
              </p>
            );
          })()}
        </>
      )}
      {error && <p className="mt-1 text-[11px] text-red-400">{error}</p>}
    </section>
  );
}
