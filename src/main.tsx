import {StrictMode, Suspense, lazy} from 'react';
import {createRoot} from 'react-dom/client';
import LiveApp from './live/LiveApp.tsx';
import {SANDBOX_ENABLED, SANDBOX_PATH} from './sandbox/flag';
import './index.css';

// The Field Sandbox is its own page: signed out or in, no API, its own
// download. Everything else is the game, and the root URL is the front door.
const Sandbox = lazy(() => import('./sandbox/Sandbox'));
const inSandbox = SANDBOX_ENABLED && window.location.pathname.replace(/\/+$/, '') === SANDBOX_PATH;

// The game is closed: the root URL is the front door. Anyone arriving without
// an account gets sign in or request access, and nothing else.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {inSandbox ? (
      <Suspense fallback={<div className="p-10 text-sm text-neutral-500">Loading the sandbox…</div>}>
        <Sandbox />
      </Suspense>
    ) : (
      <LiveApp />
    )}
  </StrictMode>,
);
