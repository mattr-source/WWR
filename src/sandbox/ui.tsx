/**
 * Small pieces the Field Sandbox screens share: buttons, bars, sections,
 * cost lines and clocks. Presentation only.
 */
import {type ReactNode} from 'react';
import {SUPPLY_KINDS, type Supplies, type SupplyKind} from '../../shared/sandbox';

export const SUPPLY_LABEL: Record<SupplyKind, string> = {fuel: 'Fuel', steel: 'Steel', munitions: 'Munitions', alloy: 'Alloy'};
export const SUPPLY_TONE: Record<SupplyKind, string> = {fuel: '#f2a33a', steel: '#9fb4c4', munitions: '#e5634a', alloy: '#7fd8c9'};

export const button = 'min-h-11 rounded-md px-3 text-[14px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40';
export const primary = `${button} bg-orange-600 text-white shadow-lg shadow-orange-950/40 hover:bg-orange-500`;
export const secondary = `${button} border border-neutral-600 bg-neutral-900/90 text-neutral-100 hover:bg-neutral-800`;
export const testButton = `${button} border-2 border-dashed border-amber-600/80 bg-amber-950/60 text-amber-200`;

/** "1:05" for a span of milliseconds; hours when it is long. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export function minutesLabel(minutes: number): string {
  if (minutes < 1) return `${Math.max(1, Math.round(minutes * 60))} s`;
  if (minutes < 60) return `${Math.round(minutes * 10) / 10} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function Bar({value, max, tone, label}: {value: number; max: number; tone: string; label?: string}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded bg-neutral-800" role="meter" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={Math.round(max)}>
      <div className={`h-full ${tone}`} style={{width: `${pct}%`}} />
    </div>
  );
}

export function Section({title, children, right}: {title: string; children: ReactNode; right?: ReactNode}) {
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

export function CostLine({cost, have, credits = 0, haveCredits = 0}: {cost: Supplies; have: Supplies; credits?: number; haveCredits?: number}) {
  const parts = SUPPLY_KINDS.filter((k) => cost[k] > 0);
  if (!parts.length && !credits) return <p className="text-[13px] text-neutral-400">No cost.</p>;
  return (
    <p className="text-[13px] leading-snug text-neutral-300">
      {parts.map((k, i) => (
        <span key={k} className={have[k] < cost[k] ? 'text-red-400' : undefined}>
          {i > 0 ? ' · ' : ''}
          {cost[k].toLocaleString()} {SUPPLY_LABEL[k]}
        </span>
      ))}
      {credits > 0 && <span className={haveCredits < credits ? 'text-red-400' : undefined}>{` · ${credits} test Credits`}</span>}
    </p>
  );
}

/** A modal sheet from the bottom. */
export function Sheet({title, onClose, children}: {title: string; onClose: () => void; children: ReactNode}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onMouseDown={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div
        className="mx-auto max-h-[86dvh] w-full max-w-xl overflow-y-auto overscroll-contain rounded-t-2xl border-t border-neutral-700 bg-[#0d0b08] px-3 pt-2"
        style={{paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)'}}
        role="dialog"
        aria-label={title}
      >
        <div className="sticky top-0 z-10 -mx-3 flex items-center justify-between bg-[#0d0b08] px-3 pb-2">
          <p className="text-[15px] font-semibold text-neutral-100">{title}</p>
          <button className={secondary} onClick={onClose}>
            Close
          </button>
        </div>
        <div className="space-y-3">{children}</div>
      </div>
    </div>
  );
}

/** Honest label for art drawn in code for this test build. */
export function TempArtTag({className = ''}: {className?: string}) {
  return <span className={`rounded border border-amber-700/60 px-1 text-[10px] font-semibold uppercase tracking-wide text-amber-300/90 ${className}`}>Temporary art</span>;
}
