/**
 * Comms, as the practice sandbox shows it: the live game's Comms bar and
 * panel (src/live/Chat.tsx) - the same bottom "COMMS" bar, the same
 * full-screen panel with the Server / Alliance / Leadership / Private tabs
 * from shared/chat.ts - but OFFLINE.
 *
 * Live Comms needs the game server (worker/chat.ts). The sandbox never
 * contacts the server, so this copies the presentation only: no messages are
 * loaded, nothing can be sent, and it says so. It does not pretend to be a
 * working chat.
 */
import {useState} from 'react';
import {CHAT_TABS, type ChatTab, MESSAGE_MAX, TAB_BLURB, TAB_LABEL} from '../../shared/chat';

export const COMMS_OFFLINE = 'Comms is offline in the practice sandbox: it needs the game server, which the sandbox never contacts.';

export default function Comms() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ChatTab>('server');

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex min-h-[44px] w-full items-center gap-3 border-t border-orange-900/60 bg-neutral-900/95 px-4 py-2 text-left backdrop-blur"
        aria-label="Comms (offline in the practice sandbox)"
      >
        <span className="shrink-0 rounded border border-orange-700/70 bg-orange-950/40 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-300">Comms</span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-400">Offline in the practice sandbox</span>
        <span className="shrink-0 text-neutral-500" aria-hidden>
          ›
        </span>
      </button>
    );
  }

  return <CommsPanel tab={tab} onTab={setTab} onClose={() => setOpen(false)} />;
}

/** The open panel: the live tabs, no messages, sending disabled. */
export function CommsPanel({tab, onTab, onClose}: {tab: ChatTab; onTab: (t: ChatTab) => void; onClose: () => void}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950" role="dialog" aria-label="Comms">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3" style={{paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)'}}>
        <p className="text-xs uppercase tracking-[0.3em] text-orange-500">Comms</p>
        <button onClick={onClose} className="min-h-11 rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:border-orange-600">
          Close
        </button>
      </header>
      <nav className="flex shrink-0 border-b border-neutral-800">
        {CHAT_TABS.map((key) => (
          <button
            key={key}
            onClick={() => onTab(key)}
            title={TAB_BLURB[key]}
            className={`min-h-11 flex-1 border-b-2 px-2 py-2 text-sm transition ${tab === key ? 'border-orange-500 text-neutral-100' : 'border-transparent text-neutral-500 hover:text-neutral-300'}`}
          >
            {TAB_LABEL[key]}
          </button>
        ))}
      </nav>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-[15px] font-semibold text-neutral-200">{TAB_LABEL[tab]}</p>
        <p className="text-[13px] text-neutral-400">{TAB_BLURB[tab]}</p>
        <p className="mt-2 rounded border border-amber-800/70 bg-amber-950/40 px-3 py-2 text-[13px] text-amber-100">{COMMS_OFFLINE}</p>
        <p className="text-[12px] text-neutral-500">No messages are shown and none can be sent here. In the game, this panel is live.</p>
      </div>
      <footer className="flex gap-2 border-t border-neutral-800 p-3" style={{paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)'}}>
        <input disabled maxLength={MESSAGE_MAX} placeholder="Offline in the practice sandbox" className="min-h-11 min-w-0 flex-1 rounded border border-neutral-800 bg-neutral-900 px-3 text-sm text-neutral-500" aria-label="Message (disabled: offline)" />
        <button disabled className="min-h-11 rounded bg-orange-900/50 px-4 text-sm font-semibold text-orange-200/50">
          Send
        </button>
      </footer>
    </div>
  );
}
