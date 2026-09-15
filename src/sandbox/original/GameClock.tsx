/**
 * The game clock, as src/live/GameClock.tsx draws it: Rogue Standard Time,
 * the same markup and classes. The live one reads the server-corrected clock
 * (src/live/serverClock.ts); the sandbox has no server, so this ticks the
 * browser clock through the same shared formatter.
 */
import {useEffect, useState} from 'react';
import {CLOCK_NAME, CLOCK_OFFSET_LABEL, formatClock} from '../../../shared/gametime';

export function GameClock({className = ''}: {className?: string}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span className={`font-mono tabular-nums ${className}`} title={`Rogue Standard Time (${CLOCK_OFFSET_LABEL})`}>
      <span className="font-semibold text-neutral-50">{formatClock(now)}</span>
      <span className="ml-1 text-orange-400">{CLOCK_NAME}</span>
      <span className="ml-1 hidden text-neutral-400 sm:inline">({CLOCK_OFFSET_LABEL})</span>
    </span>
  );
}
