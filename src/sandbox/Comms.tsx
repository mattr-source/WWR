/**
 * Comms, ported from src/live/Chat.tsx for the practice sandbox - OFFLINE.
 *
 * The same pinned bottom bar (fixed, z-40, 48 px, COMMS tag, preview line,
 * chevron) and the same full-screen panel (header with COMMS and Close, the
 * Server / Alliance / Leadership / Private tabs, the Private tab's callsign
 * and group rows, the message area and the composer), with the live English
 * strings from src/i18n.
 *
 * Live Comms loads channels and polls messages from the game server. The
 * sandbox never contacts the server, so nothing is loaded: channel tabs are
 * locked exactly as live chat locks a tab with no channel, the Private tab
 * shows live chat's empty state with its inputs disabled, the composer says
 * "No channel", and an offline notice says why. No messages are invented.
 */
import {useState} from 'react';
import {CHAT_TABS, type ChatTab, MESSAGE_MAX} from '../../shared/chat';
import {type LiveKey as MessageKey, t} from './original/strings';

export const COMMS_OFFLINE = 'Comms is offline in the practice sandbox: it needs the game server, which the sandbox never contacts.';
export const COMMS_BAR_PREVIEW = 'Offline in the practice sandbox';

const TAB_LABEL_KEY: Record<ChatTab, MessageKey> = {server: 'chat.server', alliance: 'chat.alliance', leadership: 'chat.leadership', private: 'chat.private'};
const TAB_BLURB_KEY: Record<ChatTab, MessageKey> = {server: 'chat.serverBlurb', alliance: 'chat.allianceBlurb', leadership: 'chat.leadershipBlurb', private: 'chat.privateBlurb'};

export function CommsBar({onOpen}: {onOpen: () => void}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)]" data-comms-bar>
      <button onClick={onOpen} data-guide="chat" aria-label="Comms (offline in the practice sandbox)" className="flex min-h-[48px] w-full items-center gap-3 border-t border-orange-900/60 bg-neutral-900/95 px-4 py-2.5 text-left backdrop-blur">
        <span className="shrink-0 rounded border border-orange-700/70 bg-orange-950/40 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-300">{t('chat.comms')}</span>
        <span className="min-w-0 flex-1 truncate text-[13px]">
          <span className="text-neutral-400">{COMMS_BAR_PREVIEW}</span>
        </span>
        <span className="shrink-0 text-neutral-500" aria-hidden>
          ›
        </span>
      </button>
    </div>
  );
}

/** The open panel. In the sandbox no channel exists, so the live "no channel" states show. */
export function CommsPanel({tab, onTab, onClose}: {tab: ChatTab; onTab: (t: ChatTab) => void; onClose: () => void}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-neutral-950" role="dialog" aria-label="Comms">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-3" style={{paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)'}}>
        <p className="text-xs uppercase tracking-[0.3em] text-orange-500">{t('chat.comms')}</p>
        <button onClick={onClose} className="min-h-11 rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:border-orange-600">
          {t('nav.close')}
        </button>
      </header>

      <nav className="flex shrink-0 border-b border-neutral-800">
        {CHAT_TABS.map((key) => {
          // Live chat: a tab is available when the server gave it a channel, and Private always is.
          const available = key === 'private';
          return (
            <button
              key={key}
              onClick={() => onTab(key)}
              disabled={!available}
              title={available ? t(TAB_BLURB_KEY[key]) : t('chat.tabLocked')}
              className={`min-h-11 flex-1 border-b-2 px-2 py-2 text-sm transition ${tab === key ? 'border-orange-500 text-neutral-100' : 'border-transparent text-neutral-500 hover:text-neutral-300'} disabled:text-neutral-700`}
            >
              {t(TAB_LABEL_KEY[key])}
            </button>
          );
        })}
      </nav>

      <p className="m-3 rounded border border-amber-800/70 bg-amber-950/40 px-3 py-2 text-[13px] text-amber-100" role="status">
        {COMMS_OFFLINE}
      </p>

      {tab === 'private' ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="border-b border-neutral-800 p-3">
            <div className="flex gap-2">
              <input disabled placeholder={t('chat.callsign')} aria-label={`${t('chat.callsign')} (offline)`} className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-100 disabled:opacity-50" />
              <button disabled className="min-h-11 shrink-0 rounded bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white disabled:bg-neutral-800 disabled:text-neutral-500">
                {t('chat.startDm')}
              </button>
            </div>
            <div className="mt-2 flex gap-2">
              <input disabled placeholder={t('chat.newGroupName')} aria-label={`${t('chat.newGroupName')} (offline)`} className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-100 disabled:opacity-50" />
              <button disabled className="min-h-11 shrink-0 rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 disabled:opacity-50">
                {t('chat.newGroup')}
              </button>
            </div>
          </div>
          <p className="p-4 text-sm text-neutral-600">{t('chat.noConversations')}</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <p className="text-sm text-neutral-600">{tab === 'leadership' ? t('chat.leadershipOnly') : tab === 'alliance' ? t('chat.allianceOnly') : t('chat.notDeployed')}</p>
        </div>
      )}

      <div className="relative shrink-0 border-t border-neutral-800" style={{paddingBottom: 'env(safe-area-inset-bottom)'}}>
        <form onSubmit={(e) => e.preventDefault()} className="flex gap-2 p-3">
          <input disabled maxLength={MESSAGE_MAX} placeholder={t('chat.noChannel')} aria-label="Message (disabled: offline)" className="min-h-11 min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 disabled:opacity-50" />
          <button type="submit" disabled className="min-h-11 shrink-0 rounded bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-neutral-800 disabled:text-neutral-500">
            {t('chat.send')}
          </button>
        </form>
      </div>
    </div>
  );
}

/** The bar, and the panel when open - what LiveApp pins to every screen. */
export default function Comms({onOpenChange}: {onOpenChange?: (open: boolean) => void}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ChatTab>('private');
  const set = (v: boolean) => {
    setOpen(v);
    onOpenChange?.(v);
  };
  return open ? <CommsPanel tab={tab} onTab={setTab} onClose={() => set(false)} /> : <CommsBar onOpen={() => set(true)} />;
}
