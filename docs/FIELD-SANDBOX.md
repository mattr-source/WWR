# Field Sandbox (first playable slice)

Status: **built and tested locally, not deployed.** All numbers are
**provisional test defaults** for playing the loop. None of them is an economy
ruling.

## What it is

A single-player practice patrol at `/sandbox`. Two places link to it:

- the sign-in screen (a card above "Report for duty");
- the signed-in account menu ("Field Sandbox (practice)").

Nothing in it needs an account.

**The loop:**
1. General Rider gives one instruction at a time (10 steps, skippable).
2. You start a patrol against three Dominion Crawlers. These are NPCs.
3. Your company fights with three chassis: Scout (marks a target, +25% company damage), Assault (main gun), Support (patches the most damaged chassis).
4. You fire volleys round by round, and the robots answer. The tutorial fight always wins and always leaves the Scout **disabled**.
5. You collect supplies, which pay for the **Field Workshop** upgrade. It runs on a real timer (3 min to level 2) and gives less damage taken and faster repairs.
6. Recovery works as follows:
   - A **disabled** chassis is repaired.
   - A **destroyed** chassis is replaced with a new serial number. A chassis is destroyed when a hit leaves it 30% of max HP below zero, which Walkers can do from patrol 2.
   - With no supplies, a repair or replacement still comes, only slower, so nobody gets stuck.
   - A lost patrol is retried at the same strength.
7. **The company lasts:** its name and XP carry over when chassis are replaced. Each company level adds 5% damage.
8. **Records are kept apart:**
   - "Training kills (NPC robots)" counts sandbox kills.
   - "Confirmed PvP destructions" is always 0, with a line saying it counts only real battles against other commanders.
   - The engine cannot raise the PvP number, and a stored state that claims one is thrown away.
9. **Test controls** (dashed amber panel, collapsed by default):
   - "+1/+5/+30 min" moves only the sandbox's own clock offset.
   - "Reset sandbox" clears the sandbox company.

## How it is isolated

- **Engine:** `shared/sandbox.ts` is pure and deterministic, with no clock, randomness or I/O.
- **Storage:** `src/sandbox/store.ts` saves to **this browser's localStorage** under one key, `wwr.sandbox.v1`.
- **No server contact:** there is no API call, no Worker change and no migration. A test checks that the sandbox files import nothing but React and each other, and that no file in `worker/`, `src/live/` or `src/net/` reads sandbox state.
- **Reload and resume:** every action saves. Timers are absolute instants, settled when the page reads them. Closing the page doesn't stop a timer.
- **Idempotent:**
  - Every tap carries a unique action id, and a replayed id changes nothing.
  - Rewards (`reward:<encounter>`) and robot destructions (`destroyed:<encounter>:<robot>`) are ledger keys that count once.
  - Each action re-reads storage first, so two open tabs take turns instead of overwriting each other.
- **Switch:** building with `VITE_WWR_SANDBOX=off` hides the links and the route.
- **Limitation:** sandbox state is browser-side, not server-authoritative. That's acceptable only because it grants nothing real. Moving it server-side would need a new table (a schema change, not made here).

## Art

`public/sandbox/units/{scout,assault,support}.svg` are copied unmodified
from the reviewed art starter kit (`/srv/axiom/docs/wwr-art-prototype/assets/svg`,
byte-identical). They are original hand-written SVG. The art connector was not
imported. The enemy robots are inline SVG placeholders in `Sandbox.tsx`.
General Rider's portrait is the game's existing `/guide/rider-portrait.webp`.

## Private preview (for AXIOM to run; Matt only opens the link)

The preview serves the built client only. There is no Worker, so **sign-in
does not work in the preview**. The sign-in screen's sandbox card and the
sandbox itself do work.

On the server, from `/srv/projects/wwr-build-foundation`:

```bash
npm run build
WWR_PREVIEW_HOSTS=axiom.tail84303e.ts.net nohup npx vite preview --host 127.0.0.1 --port 4180 --strictPort > /tmp/wwr-sandbox-preview.log 2>&1 &
tailscale serve --bg --https=8443 http://127.0.0.1:4180
```

Matt's link (tailnet only, phone must be on the tailnet):
**https://axiom.tail84303e.ts.net:8443/sandbox**

To take it down:

```bash
tailscale serve --https=8443 off
```

Then stop the `vite preview` process on port 4180.

- The preview binds to 127.0.0.1 only. Tailscale serve is the only way in, and it's private to the tailnet. It is not Funnel, so it isn't public.
- `WWR_PREVIEW_HOSTS` is needed because Vite rejects an unlisted Host header (checked: 403 without it, 200 with it). It affects `vite preview` only, not the production build.
- The existing `https://axiom.tail84303e.ts.net/` (port 443, AXIOM) is untouched. The preview uses port 8443.

## Verified locally (2026-09-15)

- `npm test`: 96 pass (12 of them for the sandbox).
- `tsc` clean on client and worker; `npm run build` passes its size budget. The sandbox is its own 9 KB gzipped chunk, so the entry bundle doesn't grow.
- Headless Chromium at 390×844 (touch, mobile):
  - the sign-in card opens `/sandbox`;
  - the tutorial runs from step 1 to completed;
  - reloading mid-fight resumes at the same round;
  - after collecting and reloading, there is no "Collect" button;
  - the Workshop reaches level 2 and the repair finishes via the test clock;
  - the record shows 3 training kills and 0 confirmed PvP;
  - only `wwr.sandbox.v1` is in storage;
  - no horizontal overflow and no page errors.

## Not in this slice

- The signed-in menu link can only be clicked with a running Worker, and that needs a local D1 migration, which wasn't authorized.
- Strings are English only; the i18n pass hasn't been run.
- Numbers are untuned beyond a playthrough script (`tools/sim/sandboxPlaythrough.ts`). Patrol 6 (a fourth robot) is a wall until the Workshop and company level catch up.
- Not built yet: work orders, multiplayer, server persistence, and real PvP.
