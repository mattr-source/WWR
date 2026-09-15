/**
 * General Rider, ported from src/live/guide/Guide.tsx for the practice sandbox.
 *
 * Same presentation: the round portrait bottom-left above the Comms bar, the
 * bubble beside it (General Rider · text · Next · Skip tour), X folds the
 * bubble down to the portrait and the portrait unfolds it, the step's target
 * gets the live cyan pulse outline through its data-guide attribute, and Rider
 * steps aside entirely while a sheet or panel is open.
 *
 * What differs: the live guide reads and saves its step on the server; the
 * sandbox guide is the sandbox tutorial (shared/sandbox.ts TUTORIAL), saved
 * with the practice save. The bubble reports its height so the screens above
 * it can keep their controls clear of it (live map controls sit under it).
 */
import {useEffect, useRef, useState} from 'react';

export default function SandboxGuide({
  text,
  counter,
  objective,
  canNext,
  highlight,
  hidden,
  onNext,
  onSkip,
  onHeight,
}: {
  text: string;
  counter: string;
  objective: string;
  canNext: boolean;
  highlight: string | null;
  hidden: boolean;
  onNext: () => void;
  onSkip: () => void;
  onHeight: (px: number) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // A new step unfolds the bubble, as the live guide does.
  useEffect(() => setCollapsed(false), [text]);
  useEffect(() => {
    const el = ref.current;
    if (!el || hidden) {
      onHeight(0);
      return;
    }
    const report = () => onHeight(el.getBoundingClientRect().height);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden, collapsed, text]);

  if (hidden) return null;
  return (
    <>
      {highlight && !collapsed && (
        <style>{`[data-guide="${highlight}"]{outline:2px solid rgba(103,232,249,.9);outline-offset:2px;animation:wwr-guide-pulse 1.2s ease-in-out infinite}@keyframes wwr-guide-pulse{0%,100%{outline-color:rgba(103,232,249,.9)}50%{outline-color:rgba(103,232,249,.2)}}@media (prefers-reduced-motion: reduce){[data-guide="${highlight}"]{animation:none}}`}</style>
      )}
      <div ref={ref} data-guide-dock className="pointer-events-none fixed inset-x-2 bottom-[calc(3.25rem+env(safe-area-inset-bottom))] z-[45] flex items-end gap-2">
        <button onClick={() => setCollapsed((c) => !c)} className="pointer-events-auto h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-cyan-400/80 bg-neutral-950 shadow-lg" title="General Rider" aria-label={collapsed ? 'Show General Rider' : 'General Rider'} aria-expanded={!collapsed}>
          <img src="/guide/rider-portrait.webp" alt="General Rider" className="h-full w-full object-cover" draggable={false} />
        </button>
        {collapsed ? null : (
          <div className="pointer-events-auto max-w-md flex-1 rounded-lg border border-cyan-800/70 bg-neutral-950/95 px-3 py-2 shadow-lg backdrop-blur" aria-live="polite">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-400">General Rider · {counter}</p>
              <button onClick={() => setCollapsed(true)} className="-mr-2 -mt-2 min-h-11 min-w-11 text-neutral-500 hover:text-neutral-200" aria-label="Dismiss">
                ✕
              </button>
            </div>
            <p className="-mt-2 text-xs leading-snug text-neutral-100">{text}</p>
            <p className="mt-0.5 text-[11px] font-semibold text-cyan-200">▸ {objective}</p>
            <div className="mt-1.5 flex items-center gap-3">
              {canNext && (
                <button onClick={onNext} className="min-h-11 rounded border border-cyan-700 bg-cyan-950/40 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-cyan-200 hover:bg-cyan-900/40">
                  Next
                </button>
              )}
              <button onClick={onSkip} className="min-h-11 text-[11px] uppercase tracking-wider text-neutral-500 hover:text-neutral-200">
                Skip tour
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
