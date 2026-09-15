/**
 * The front door.
 *
 * Two states: sign in, or request access. The game is closed, so there is no
 * path from here into it without an approved account.
 */
import {type FormEvent, type ReactNode, useEffect, useRef, useState} from 'react';
import {LANGUAGE_CODES} from '../../shared/chat';
import {setLanguage, t} from '../i18n';
import {ApiError, type Player, api} from '../net/api';
import {COUNTRIES, guessCountry, languageFor} from './countries';
import {STARTER_SKINS} from './skins';
import {SANDBOX_ENABLED, SANDBOX_PATH} from '../sandbox/flag';

type Mode = 'signin' | 'request';
type Availability = 'idle' | 'checking' | 'free' | 'taken';

// Read at call time rather than held in a module constant: `t` answers in
// whatever language is current when it runs, and on this screen that is only
// settled once the effect below has looked at the browser.
const callsignRule = () => t('gate.callsignRule');

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest text-neutral-500">{label}</span>
      {children}
      {hint}
    </label>
  );
}

const inputClass =
  'mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100 outline-none focus:border-orange-500';

export default function Gate({onAuthed}: {onAuthed: (player: Player) => void}) {
  const [mode, setMode] = useState<Mode>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState(guessCountry);
  const [adult, setAdult] = useState(false);
  const [skin, setSkin] = useState<string>(STARTER_SKINS[0].id);

  const [availability, setAvailability] = useState<Availability>('idle');
  const [availabilityNote, setAvailabilityNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Ignore the answer to a check that has been superseded by later typing.
  const checkSeq = useRef(0);

  // `t` reads a module variable, so changing the language re-renders nothing
  // by itself. This is only here to make the screen redraw once the guess
  // below has been applied.
  const [, setLangTick] = useState(0);

  // Nobody is signed in yet, so there is no saved preference to obey - and
  // this is the one screen a player reaches before they could ever have set
  // one, which makes it the screen where defaulting to English costs the
  // most. The browser's own language is the only thing we know about them, so
  // the interface starts there. `navigator.language` is a full tag like
  // `pt-BR`; the interface is translated per language rather than per region,
  // so only the part before the dash means anything here, and a language the
  // game does not carry is left alone rather than forced to a near miss.
  //
  // The cleanup hands the language back to English on the way out, and that
  // is the part that keeps a signed-in player's own choice winning. LiveApp
  // sets the language from `player.language`, but its effect only re-runs
  // when that value CHANGES - a player who has never chosen one would
  // otherwise keep this guess for the rest of the session. React runs every
  // cleanup in a commit before any effect in it, so unmounting the Gate
  // resets to English first and LiveApp's own choice lands on top.
  useEffect(() => {
    const guess = (navigator.language || 'en').split('-')[0];
    if (!LANGUAGE_CODES.includes(guess)) return;
    void setLanguage(guess).then(() => setLangTick((n) => n + 1));
    setLangTick((n) => n + 1);
    return () => {
      void setLanguage('en');
    };
  }, []);

  useEffect(() => {
    if (mode !== 'request') return;
    const name = username.trim();
    if (name.length === 0) {
      setAvailability('idle');
      setAvailabilityNote(null);
      return;
    }
    if (!/^[A-Za-z]{6,20}$/.test(name)) {
      setAvailability('taken');
      setAvailabilityNote(callsignRule());
      return;
    }

    setAvailability('checking');
    setAvailabilityNote(null);
    const seq = ++checkSeq.current;
    const timer = window.setTimeout(async () => {
      try {
        const result = await api.checkCallsign(name);
        if (seq !== checkSeq.current) return;
        setAvailability(result.available ? 'free' : 'taken');
        setAvailabilityNote(result.available ? null : (result.reason ?? t('gate.callsignTaken')));
      } catch {
        if (seq !== checkSeq.current) return;
        setAvailability('idle');
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [username, mode]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signin') {
        const result = await api.login(username.trim(), password);
        onAuthed(result.player);
      } else {
        const result = await api.requestAccess({
          email: email.trim(),
          username: username.trim(),
          password,
          country,
          locale: languageFor(country),
          skin,
          ageConfirmed: adult,
        });
        setSent(result.message);
      }
    } catch (err) {
      // An ApiError carries a sentence the Worker wrote, in English, formed
      // on the server - it cannot be translated here. Only the fallback,
      // which this client writes, goes through `t`.
      setError(err instanceof ApiError ? err.message : t('gate.networkError'));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="mx-auto mt-24 w-full max-w-sm px-6">
        <p className="text-xs uppercase tracking-[0.3em] text-orange-500">World War Rogue</p>
        <h1 className="mt-2 text-2xl font-semibold text-neutral-100">{t('gate.requestSent')}</h1>
        <p className="mt-3 text-sm text-neutral-400">{sent}</p>
        <p className="mt-6 text-sm text-neutral-500">{t('gate.reviewNote')}</p>
        <button
          onClick={() => {
            setSent(null);
            setMode('signin');
          }}
          className="mt-8 text-sm text-neutral-400 underline underline-offset-4 hover:text-neutral-200"
        >
          {t('gate.backToSignIn')}
        </button>
      </div>
    );
  }

  const requesting = mode === 'request';
  const canSubmit = requesting
    ? adult && availability === 'free' && email.length > 0 && password.length >= 8
    : username.length > 0 && password.length > 0;

  return (
    <div className="mx-auto mt-16 w-full max-w-sm px-6 pb-16">
      {SANDBOX_ENABLED && (
        <a
          href={SANDBOX_PATH}
          className="mb-8 block rounded-lg border border-cyan-800/70 bg-cyan-950/30 px-4 py-3 text-cyan-100 hover:border-cyan-500"
        >
          <span className="block text-sm font-semibold">Field Sandbox</span>
          <span className="block text-[13px] text-cyan-200/80">Practice patrol with General Rider. No account needed; nothing is saved to a base.</span>
        </a>
      )}
      <p className="text-xs uppercase tracking-[0.3em] text-orange-500">World War Rogue</p>
      <h1 className="mt-2 text-2xl font-semibold text-neutral-100">
        {requesting ? t('gate.requestTitle') : t('gate.signInTitle')}
      </h1>
      <p className="mt-2 text-sm text-neutral-400">
        {requesting ? t('gate.requestIntro') : t('gate.signInIntro')}
      </p>

      <form onSubmit={submit} className="mt-8 space-y-4">
        {requesting && (
          <Field label={t('gate.email')}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className={inputClass}
            />
          </Field>
        )}

        <Field
          label={t('gate.callsign')}
          hint={
            requesting && availabilityNote ? (
              <span className="mt-1 block text-xs text-red-400">{availabilityNote}</span>
            ) : requesting && availability === 'free' ? (
              <span className="mt-1 block text-xs text-emerald-400">
                {t('gate.callsignAvailable')}
              </span>
            ) : requesting && availability === 'checking' ? (
              <span className="mt-1 block text-xs text-neutral-500">
                {t('gate.callsignChecking')}
              </span>
            ) : requesting ? (
              <span className="mt-1 block text-xs text-neutral-600">{callsignRule()}</span>
            ) : null
          }
        >
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            className={inputClass}
          />
        </Field>

        <Field label={t('gate.password')}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={requesting ? 'new-password' : 'current-password'}
            className={inputClass}
          />
        </Field>

        {requesting && (
          <>
            <Field
              label={t('gate.country')}
              hint={
                <span className="mt-1 block text-xs text-neutral-600">
                  {t('gate.countryHint')}
                </span>
              }
            >
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className={inputClass}
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.name}
                  </option>
                ))}
              </select>
            </Field>

            <div>
              <span className="text-xs uppercase tracking-widest text-neutral-500">
                {t('gate.baseType')}
              </span>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {STARTER_SKINS.map((option) => {
                  const active = option.id === skin;
                  return (
                    <button
                      type="button"
                      key={option.id}
                      onClick={() => setSkin(option.id)}
                      className={`rounded border p-2 text-left ${
                        active
                          ? 'border-orange-500 bg-orange-950/30'
                          : 'border-neutral-800 bg-neutral-900/60 hover:border-neutral-600'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-4 w-4 rounded-sm"
                          style={{
                            backgroundColor: option.palette.ground,
                            boxShadow: `inset 0 0 0 2px ${option.palette.accent}`,
                          }}
                        />
                        <span className="text-sm font-medium text-neutral-100">{option.name}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="flex items-start gap-3 rounded border border-neutral-800 bg-neutral-900/60 p-3">
              <input
                type="checkbox"
                checked={adult}
                onChange={(e) => setAdult(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-orange-600"
              />
              <span className="text-sm text-neutral-300">
                {t('gate.ageConfirm')}
                <span className="mt-1 block text-xs text-neutral-500">{t('gate.ageNote')}</span>
              </span>
            </label>
          </>
        )}

        {error && (
          <p className="rounded border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !canSubmit}
          className="w-full rounded bg-orange-600 px-4 py-2 font-semibold text-white disabled:opacity-40"
        >
          {busy ? t('gate.working') : requesting ? t('gate.requestAccess') : t('gate.signIn')}
        </button>
      </form>

      <button
        onClick={() => {
          setMode(requesting ? 'signin' : 'request');
          setError(null);
          setAvailability('idle');
          setAvailabilityNote(null);
        }}
        className="mt-6 text-sm text-neutral-400 underline underline-offset-4 hover:text-neutral-200"
      >
        {requesting ? t('gate.toSignIn') : t('gate.toRequest')}
      </button>
    </div>
  );
}
