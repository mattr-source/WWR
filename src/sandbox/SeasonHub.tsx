/**
 * The Season 1 hub: Mech Uprising — Iron Dominion, as the practice sandbox
 * can truthfully show it. Opened from the Tactical Operations Center (as the
 * live game's Events are) and from the HUD Events button.
 *
 * Built from existing art only: the Tactical Operations Center and Signals
 * Center buildings, General Rider, the Asset renders, the Alliance Convoy
 * trucks, terrain props and the sandbox's temporary Dominion machines
 * (labelled). Progress is this practice Task Force's; events that need the
 * game server or other players are shown locked with their real rules.
 */
import {type ReactNode, useState} from 'react';
import {assetArtUrl} from '../../shared/assetVisuals';
import {ASSET_BY_ID} from '../../shared/assets';
import {CONVOY_TRUCK_URLS} from '../../shared/allianceConvoyVisuals';
import {cacheReward} from '../../shared/season1Ops';
import {METRIC_LABEL, WARFRONT, WARFRONT_METRICS} from '../../shared/warfront';
import {type SandboxState, describeReward, siteReward} from '../../shared/sandbox';
import {CHAPTERS, PHASE_LABEL, hubModel, unlocksIn} from './seasonHub';
import {BuildingImg, PropThumb} from './BasePanels';
import {DominionFigure} from './RobotFigure';
import {Bar, clock, primary, secondary} from './ui';

/** Asset categories without a render yet show their runway building art (shared/base.ts). */
const VEHICLE_ART: Record<string, string> = {
  armour: '/base/vehicle-armour.webp',
  artillery: '/base/vehicle-artillery.webp',
  rotary: '/base/vehicle-rotary.webp',
  fixed_wing: '/base/vehicle-fixed-wing.webp',
  drone: '/base/vehicle-drone.webp',
};

/** A terrain prop from the atlas with no backing tile. */
function PropThumbBare({name}: {name: string}) {
  return (
    <span className="block h-full w-full [&>span]:bg-transparent">
      <PropThumb name={name} />
    </span>
  );
}

function Locked({children}: {children: string}) {
  return <span className="whitespace-nowrap rounded border border-neutral-600 bg-neutral-900 px-1.5 text-[10px] font-bold uppercase tracking-wide text-neutral-300">🔒 {children}</span>;
}

function Rules({rules}: {rules: readonly string[]}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button className={`${secondary} w-full text-[13px]`} aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Hide the rules' : 'Read the live rules'}
      </button>
      {open && (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px] leading-snug text-neutral-400">
          {rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EventCard({id, art, title, status, children}: {id: string; art: ReactNode; title: string; status: ReactNode; children: ReactNode}) {
  return (
    <section data-event={id} className="overflow-hidden rounded-lg border border-neutral-800 bg-black/30">
      <div className="relative flex h-24 items-end justify-center gap-1 overflow-hidden bg-gradient-to-b from-[#4a3d27] via-[#2d2517] to-[#15110b] px-2">{art}</div>
      <div className="p-2">
        <p className="flex items-center justify-between gap-2">
          <b className="text-[15px] text-neutral-100">{title}</b>
          {status}
        </p>
        {children}
      </div>
    </section>
  );
}

export default function SeasonHub({state, now, realNow, onOpenOps, onGoToSite}: {state: SandboxState; now: number; realNow: number; onOpenOps: () => void; onGoToSite: (siteId: string) => void}) {
  const h = hubModel(state, now, realNow);
  return (
    <div className="space-y-3" data-season-hub>
      {/* Hero banner */}
      <section className="relative -mx-1 overflow-hidden rounded-xl border border-amber-800/70 bg-gradient-to-b from-[#6b5634] via-[#3a2e1c] to-[#120e08]" aria-label="Season banner">
        <div className="relative px-3 pt-2 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-amber-300">Season 1</p>
          <h2 className="text-[20px] font-extrabold leading-tight text-amber-50 drop-shadow">{h.name}</h2>
        </div>
        <div className="pointer-events-none relative h-44">
          <span className="absolute inset-x-0 bottom-0 flex justify-between px-6 opacity-80">
            <span className="h-10 w-10"><PropThumbBare name="boulder_cluster_a" /></span>
            <span className="h-10 w-10"><PropThumbBare name="thorn_brush_a" /></span>
          </span>
          <span className="absolute left-1/2 top-1 h-24 w-40 -translate-x-1/2">
            <BuildingImg id="tactical_operations_center" />
          </span>
          <img src="/guide/rider-full.webp" alt="General Rider" className="absolute bottom-0 left-1 h-44 object-contain" />
          <span className="absolute bottom-0 right-1 flex items-end">
            <DominionFigure kind="walker" height={104} mirror />
            <DominionFigure kind="crawler" height={42} mirror />
          </span>
        </div>
        <div className="relative bg-black/75 px-3 py-2">
          <p className="flex items-baseline justify-between gap-2">
            <span className="text-[16px] font-bold text-neutral-50">
              Week {h.week}/10 · {h.chapter.name}
            </span>
            <span className="shrink-0 text-[11px] text-amber-200">{PHASE_LABEL[h.phase]}</span>
          </p>
          <p className="text-[13px] italic text-neutral-300">“{h.chapter.beat}”</p>
          <p className="text-[12px] text-neutral-400">Featured: {h.chapter.featured}</p>
          <p className="mt-1 text-[11px] leading-snug text-neutral-500">
            Practice clock: day {h.day + 1}, next practice day in {clock(h.nextPracticeDayIn)}. Live Season 1 calendar: {h.live.chapter ? `week ${h.live.week}, ${h.live.chapter.name}` : PHASE_LABEL[h.live.phase]}; daily reset 00:00 RST in {clock(h.live.dailyResetIn)}, weekly in {clock(h.live.weeklyResetIn)}.
          </p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-amber-400/90">Chapter text is design copy · temporary art: Dominion machines</p>
        </div>
      </section>

      {/* Ten-week chapter strip */}
      <section aria-label="Season chapters">
        <h3 className="px-1 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">Ten chapters</h3>
        <ol className="-mx-1 mt-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1">
          {CHAPTERS.map((c) => {
            const current = c.week === h.week;
            const past = c.week < h.week;
            const ids = unlocksIn(c.week);
            return (
              <li key={c.week} data-chapter={c.week} aria-current={current ? 'step' : undefined} className={`w-32 shrink-0 snap-start overflow-hidden rounded-lg border ${current ? 'border-amber-400 bg-amber-950/60' : past ? 'border-neutral-800 bg-neutral-950 opacity-70' : 'border-neutral-800 bg-black/40'}`}>
                <div className="flex h-12 items-end justify-center bg-gradient-to-b from-[#3a3122] to-[#16120c]">
                  {ids.slice(0, 3).map((id) => {
                    const url = assetArtUrl(id, 1) ?? VEHICLE_ART[ASSET_BY_ID[id]?.category ?? ''] ?? null;
                    return url ? <img key={id} src={url} alt={ASSET_BY_ID[id]?.name ?? id} className="-mx-1 h-11 w-11 object-contain" /> : null;
                  })}
                </div>
                <div className="p-1.5">
                  <p className="flex items-center justify-between text-[11px] font-bold uppercase text-amber-300">
                    <span>Week {c.week}</span>
                    {current && <span className="rounded bg-amber-500 px-1 text-[9px] text-black">Now</span>}
                    {c.week === h.live.week && !current && <span className="rounded bg-cyan-800 px-1 text-[9px] text-cyan-50">Live</span>}
                  </p>
                  <p className="text-[13px] font-semibold leading-tight text-neutral-100">{c.name}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-neutral-400">{c.featured}</p>
                  <p className="mt-0.5 text-[11px] text-emerald-300">{c.week === 1 ? `${ids.length} starter Assets` : `+${ids.length} Assets unlock`}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Events */}
      <EventCard
        id="daily-operations"
        title="Daily Operations"
        art={
          <>
            <span className="h-20 w-24">
              <BuildingImg id="tactical_operations_center" />
            </span>
            <span className="h-16 w-20">
              <BuildingImg id="depot" />
            </span>
          </>
        }
        status={<span className={`text-[12px] font-semibold ${h.ops.cacheClaimed ? 'text-emerald-300' : 'text-amber-200'}`}>{h.ops.cacheClaimed ? 'Cache claimed' : `${h.ops.lanes}/${h.ops.target} lanes`}</span>}
      >
        <Bar value={h.ops.lanes} max={h.ops.target} tone={h.ops.cacheClaimed ? 'bg-emerald-500' : 'bg-cyan-500'} label="Daily Operations lanes" />
        <p className="mt-1 text-[12px] text-neutral-400">
          Six lanes a day; four unlock the Cache ({describeReward(cacheReward(h.week))}). Real Season 1 week {h.week} table, in practice supplies and test Credits.
        </p>
        <button className={`${primary} mt-1 w-full`} onClick={onOpenOps}>
          Open Operations
        </button>
      </EventCard>

      <EventCard
        id="daily-exercises"
        title="Daily Exercises"
        art={
          <>
            <span className="h-14 w-14">
              <PropThumb name="power_pylon_a" />
            </span>
            <span className="h-14 w-14">
              <PropThumb name="fuel_drums_a" />
            </span>
            <DominionFigure kind="crawler" height={44} />
          </>
        }
        status={<span className="text-[12px] font-semibold text-amber-200">{h.exercises.filter((x) => x.done).length}/{h.exercises.length} cleared</span>}
      >
        <ul className="mt-1 space-y-1">
          {h.exercises.map((x) => (
            <li key={x.site.id}>
              <button className={`${x.done ? 'border-emerald-800 bg-emerald-950/30' : 'border-neutral-700 bg-neutral-900'} flex min-h-11 w-full items-center justify-between gap-2 rounded-md border px-2 text-left`} onClick={() => onGoToSite(x.site.id)} aria-label={`${x.name}: show on the World Map`}>
                <span className="min-w-0">
                  <span className={`block text-[13px] font-semibold ${x.done ? 'text-emerald-200' : 'text-neutral-100'}`}>
                    {x.done ? '✓ ' : ''}
                    {x.name}
                  </span>
                  <span className="block text-[11px] text-neutral-400">
                    {x.kind === 'battle' ? 'Battle' : 'Hold'} · {describeReward(siteReward(x.site, state) ?? {credits: 0, fuel: 0, steel: 0, munitions: 0, alloy: 0})}
                  </span>
                </span>
                <span className="shrink-0 text-[12px] text-cyan-300">Map ›</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-[11px] text-neutral-500">Picked by the real daily exercise picker; rewards are the real table for week {h.week}.</p>
      </EventCard>

      <EventCard
        id="arena"
        title="Iron Dominion Arena"
        art={
          <>
            <DominionFigure kind="walker" height={88} />
            <span className="h-16 w-20">
              <BuildingImg id="garrison_barracks" />
            </span>
          </>
        }
        status={<Locked>Live server event</Locked>}
      >
        <p className="text-[12px] text-neutral-300">
          {PHASE_LABEL[h.phase]}. {h.phase === 'proving_ground' ? `${h.arena.attemptsPerDay} attempts a day against the server's Dominion Warden; your best counts.` : 'Head-to-head ladder: designed, not built yet in the live game either.'}
        </p>
        <p className="text-[12px] text-neutral-400">First attempt each day pays the Field Cache: {describeReward(h.arena.fieldCache)}.</p>
        <p className="text-[12px] text-amber-200/90">Not in the practice sandbox: the Warden is built from the server's players, and rankings are other commanders. Nothing here is simulated.</p>
        <Rules rules={h.arena.rules} />
      </EventCard>

      <EventCard
        id="warfront"
        title="Dominion Warfront"
        art={
          <>
            <span className="h-20 w-24">
              <BuildingImg id="signals_center" />
            </span>
            <DominionFigure kind="crawler" height={40} />
            <DominionFigure kind="crawler" height={32} mirror />
          </>
        }
        status={<Locked>Alliance event</Locked>}
      >
        <p className="text-[12px] text-neutral-300">Your practice today, scored with the live Warfront point table (estimate only, nothing is submitted, no alliance):</p>
        <ul className="mt-1 space-y-1">
          {WARFRONT_METRICS.map((k) => (
            <li key={k} data-metric={k}>
              <p className="flex justify-between text-[12px]">
                <span className="text-neutral-300">{METRIC_LABEL[k]}</span>
                <span className="font-mono text-neutral-100">
                  {h.warfront.capped[k]}/{WARFRONT.metricDailyCap[k]}
                </span>
              </p>
              <Bar value={h.warfront.capped[k]} max={WARFRONT.metricDailyCap[k]} tone="bg-orange-500" label={METRIC_LABEL[k]} />
            </li>
          ))}
        </ul>
        <p className="mt-1 text-[12px] text-neutral-400">
          Day estimate {h.warfront.total}/{h.warfront.cap}. Exercise points are marked provisional in the live rules; Support needs allies.
        </p>
        <Rules rules={h.warfrontRules} />
      </EventCard>

      <EventCard
        id="alliance-convoy"
        title="Alliance Convoy"
        art={CONVOY_TRUCK_URLS.map((u) => (
          <img key={u} src={u} alt="" className="-mx-2 h-16 w-16 object-contain" />
        ))}
        status={<Locked>Alliance event</Locked>}
      >
        <p className="text-[12px] text-neutral-300">
          {h.convoy.trucks} trucks a day for alliances of {h.convoy.minMembers}+, guarded by one member's six Assets. Needs an alliance, so it is not in the practice sandbox.
        </p>
        <Rules rules={h.convoy.rules} />
      </EventCard>

      <p className="px-1 text-[11px] leading-snug text-neutral-500">
        Chapter names, featured play and story lines are the Season 1 design text; the design gives no chapter score weights, so none are shown. Asset unlock weeks are the live schedule; Assets without a render yet are shown by their category's runway building art. Rider, buildings, Asset renders and convoy trucks are the game's art; the Dominion Walker and Crawler are temporary art.
      </p>
    </div>
  );
}
