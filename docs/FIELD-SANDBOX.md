# Field Sandbox: Season 1 private test build

Status: **built and tested locally on branch `axiom/season-config-foundation`. Not deployed and not pushed.**
Every number here is a **test-only default** for playing the loop. None of it is an economy, price, timer or
payment ruling.

## What it is

A single-player practice loop at `/sandbox`, reached from the sign-in screen card and the signed-in account
menu ("Field Sandbox (practice)"). It needs no account and never calls the API.

**The loop, all on one sector map:**

1. **General Rider** gives one instruction at a time (12 steps, skippable). The season name comes from the config.
2. **Pick a target** on today's map:
   - three **real Season 1 exercises**, chosen by the real daily picker (`shared/exercises.ts`) with their real
     reward table and week multiplier;
   - a **Dominion Patrol** that grows after every win (test-only enemies and reward);
   - a **Mock Rival Base**: the base-attack pattern as a private mock. Not a real player, no loot (base-attack loot
     is not decided), kills are training kills, confirmed PvP stays 0.
3. **Choose the Task Force**: the humanoid **robot troops** (Scout, Assault, Support) and the starter **Assets**
   (Abrams, Hind, Global Hawk). Every march needs its drone, as in the live game. The card compares plain HP and
   firepower totals, with no invented rating or verdict.
4. **March.** The column (Assets behind, robots in front) moves along its route on the map.
5. **Attack.** On arrival the engine resolves the whole fight into recorded rounds, and the map plays them: the
   Scout's mark, shells from Assets and rounds from robots, the Dominion answering, damage numbers, HP bars,
   wrecks, knock-outs. **Victory** or **Defeat** shows over the target, then the **battle report** (reward, XP,
   training kills, PvP 0, and every unit's before/after HP or casualty, plus the round-by-round log).
   Hold exercises are held instead, with a progress ring.
6. **Return.** The column turns for home. Damaged Assets smoke or burn and set a slower pace (the live
   `marchHpFactor`). Destroyed robots don't come back: their wrecks stay at the target.
7. **Recover at base.**
   - A damaged or disabled robot is **repaired** (supplies + time, faster with the Field Workshop).
   - A destroyed robot is **remanufactured** (supplies + time) with a new serial and **keeps its level and every
     part**.
   - A damaged Asset is repaired by the **live repair bill** (`shared/repair.ts`). Assets are never destroyed.
   - With no supplies, all of these still happen free and slower, so nobody is stuck (the free path completes no
     Daily Operations lane).
8. **Upgrade in the Robot Bay.** Every robot level (test cap 50) installs exactly one part, in the order head,
   torso, legs, arms, gear, and raises at least one real stat. The screen shows the part removed and fitted
   (neutral "Mk N" names) and the true before → after numbers. When the timer ends, an **install ceremony** plays
   for **every** level: gantry arms come down, the old part lifts out, the new one drops in, weld, power-up, then
   the real numbers. It can be skipped, and it is recorded as seen, so a reload doesn't replay it. The new part
   stays visible everywhere the robot is drawn.
9. **Upgrade Assets in the Hangar** (added after `fa92745`). Each starter Asset has the live game's **Service
   Rank** (1 to the Season 1 cap of 10) and four **packages** (Armament, Protection, Propulsion, Electronics),
   with the live rules: a package can never outrank its Asset, and upgrades are instant.
   - **Stats are the live ones:** `attributesWith` from `shared/upgrades.ts`, with the rank 10 milestone double step.
     Sandbox HP, volley and the repair bill are derived from them, so an upgraded Asset really fights and repairs
     differently.
   - **Prices** are the live provisional step prices (`rankStepCost` / `packageStepCost` in `shared/economy.ts`),
     paid in the sandbox in **test Credits**. The Tokens/Credits split rules are not imported.
   - **Every upgrade plays a skippable install ceremony in the Hangar bay:** the old rank plate or package module
     lifts off the Asset's own render and the new one drops on. At rank 10 the render itself changes to the existing
     r10 art. Then the real before/after attributes, sandbox HP and volley.
   - **The fitted kit stays visible:** it shows in the Hangar, on the target card's render and on the Asset on the map.
10. **Field Workshop level-ups** (Robot Bay sheet) now play an **on-site** ceremony when the timer ends. The crane
    lowers the new fitting onto Matt's building art, then the before/after damage-taken and robot-repair factors
    (sandbox test-only numbers). Each level's fitting stays on the building on the map.
11. **Operations.** Today's Season 1 objectives (read from state; they add no rewards of their own), the six real
   Daily Operations lanes with their real rewards, and the four-lane Cache.
12. **Records.** Training kills (NPC), battles won and lost, patrols, exercises, robots destroyed, and **Confirmed
    PvP destructions: 0**.
13. **Test controls** (dashed amber, always labelled): +1/+5/+30 min, skip to the next march moment, next sandbox
    day, +5,000 test supplies, "finish now" on jobs, a look-preview slider for levels 1 to 50 (changes nothing),
    and Reset.

## Where things live

| File | What |
|---|---|
| `shared/sandboxSeason.ts` | `SandboxSeasonConfig`, a typed and validated **test-only** config: robot stats, part bonuses, the level-50 test cap, upgrade costs (supplies only) and timers, repair and remanufacture, march and hold seconds, Task Force Assets, round length. `testOnly: true` is required. |
| `shared/sandbox.ts` | The pure engine: state, actions, settle-on-read, `resolveBattle` (structured round events), Assets, sites, lanes, objectives, tutorial, save reading. Enemy stats, patrol reward and Field Workshop steps are still test-only constants here. |
| `src/sandbox/store.ts` | localStorage under `wwr.sandbox.v1`; `openSandbox` returns a visible notice when a save can't be kept. |
| `src/sandbox/beats.ts` | Turns a resolved battle into what's on screen at any instant. |
| `src/sandbox/SectorMap.tsx` | The map, columns, battle cluster and effects. |
| `src/sandbox/RobotBay.tsx`, `InstallCeremony.tsx` | Robot Bay, Field Workshop, look preview, install ceremony. |
| `src/sandbox/RobotFigure.tsx` | Robot troops and Dominion machines as layered vector parts (**temporary art**). |
| `src/sandbox/RefitArt.tsx`, `RefitCeremony.tsx` | Asset kit modules, rank plates and Workshop fittings (**temporary prototype art**), and the install ceremony for Asset and Workshop upgrades. |
| `src/sandbox/Sandbox.tsx` | The screen: HUD, Rider, target card, battle report, Hangar, Operations, record, test controls. |

## Art: what's real and what's temporary

- **Existing WWR art reused:**
  - Asset hero renders `public/assets/<id>/r01.webp` (via `shared/assetVisuals.ts`), as the live world map draws them.
  - Matt's base buildings (`building-fabrication-shop`, `building-recovery-yard`, `building-garrison-barracks` for the mock rival).
  - Terrain atlas props (`shared/terrainAtlas.ts`) and the Alliance Convoy truck.
  - General Rider's portrait.
- **Temporary vector art (labelled "Temporary art" on screen), not approved final art:**
  - The humanoid robots: five internal looks per part, from salvaged scrap at level 1 to glowing powered armour at level 50, plus a visible change at every tier.
  - The Dominion Crawler and Walker.
  - The Asset kit modules, rank plates and Field Workshop fittings. They are drawn over existing art so every
    level shows a visible change, but no per-level Asset or building art exists. The only real per-level Asset art
    change in Season 1 is the rank 10 render.
  - The map carries a permanent label: "Temporary art: robots, Dominion machines, fitted kit".
  - No approved robot or Dominion art exists yet. No paid or generated images were used.
- The rejected flat unit SVGs (`public/sandbox/units/*`) and the old `Battlefield.tsx` are removed.

## Needs Matt's decision: Asset visuals per level

The Season 1 decisions (`docs/season-1/13-DECISIONS.md` §11, 2026-09-07) say Asset visuals change only at Service
Rank milestones, that **package upgrades change no visuals**, and that there are **no layered component overlays**.
Matt's later direction (2026-09-15, "Animated upgrades at each level even if its just one item") asks for a visible,
persistent part at every level. The sandbox follows the later direction, as a labelled private prototype. Either
the decision is updated (and overlay art commissioned), or the kit overlays come out and only the ceremony and
numbers remain. Nothing in the live game changed.

## Saves

- A save from another state format (the previous battlefield build wrote schema 1) or another season config
  **starts over with a visible notice**: "The practice test build changed…".
- A save from the same config at another tuning `version` is **kept**; tuning is re-read and robot levels are held
  at the current cap. Bump the config `version` for tuning. Only a state-shape change bumps `SANDBOX_SCHEMA`.
- Saves from `fa92745` (before Asset upgrades) are **kept**: their Assets load at rank 1 with nothing fitted, no notice.

## How it is isolated

- **No server contact:** no API call, no Worker change, no migration.
- **Strict imports:** `tools/tests/sandbox.test.ts` holds a per-file import allow-list. It also follows every
  import the sandbox reaches and fails on anything in `src/live`, `src/net` or `worker/`, any `fetch`/`/api/`,
  and any wallet or payment module. The one exception: `shared/sandbox.ts` may import exactly `rankStepCost` and
  `packageStepCost` from `shared/economy.ts`, and the test checks that it's only those two. Nothing in the live
  game reads sandbox state.
- **Idempotent:** every tap carries an action id. Rewards (`reward:`), battles (`battle:`), destructions
  (`destroyed:`), lanes and the Cache are ledger keys that count once. Each action re-reads storage first.
- **Currency:** sandbox Credits always read "test Credits". A test fails on "Command Credits", "Tokens" or a bare
  "Credits" in the sandbox UI.
- **Switch:** building with `VITE_WWR_SANDBOX=off` hides the links and the route.
- **Limitation:** state is browser-side, not server-authoritative. That's acceptable only because it grants
  nothing real.

## Verified (2026-09-15)

- `npm test`: 106 pass (`sandbox.test.ts` 18, `sandboxBeats.test.ts` 4, all existing suites). `tsc` clean on client and worker.
- `vite build` passes the size budget, built into a separate folder so the live preview's `dist/` was untouched:
  - entry 67 KB gzipped (was 66);
  - the sandbox chunk is 43 KB gzipped plus 2 KB CSS, loaded only on `/sandbox`.
- **Headless Chromium, 390×844 touch, normal and `prefers-reduced-motion` (18/18 checks each).** Screenshots are in `/srv/axiom-data/reports/wwr-sandbox-season1/`:
  - tutorial start;
  - a double tap on Attack starts one march;
  - reload mid-march resumes it;
  - the battle plays on the map, then Victory and the report;
  - the reward is applied once;
  - Robot Bay upgrade, ceremony with before/after firepower, marked seen, no replay after reload;
  - repair, then the Cache claimed once;
  - a defeat at the Mock Rival Base (no reward, PvP 0), and the damaged return with the burning drone;
  - no horizontal overflow, no control under 44 px, only `wwr.sandbox.v1` in storage, no `/api/` requests, no page errors.

## Exposing a candidate to Matt's private preview (for AXIOM; no live change)

The private preview at `https://axiom.tail84303e.ts.net:8443/sandbox` is `vite preview` on `127.0.0.1:4180`,
serving this worktree's `dist/`. Tailnet only, not Funnel. `vite preview` reads from disk, so a swapped `dist/`
shows on the next page load, with no restart and no `tailscale serve` change.

**Never run `npm run build` into the served `dist/`, and never keep the only backup in `/tmp`** (tmpfs, wiped on
reboot). Build separately, verify, back up durably, then swap atomically:

```bash
G=/srv/projects/wwr-build-foundation
C=$(git -C "$G" rev-parse --short HEAD)
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
B=/srv/axiom-data/wwr-preview-builds/$C-$STAMP
mkdir -p "$B"

# 1. Build exactly the commit, not the working tree, into its own folder.
mkdir -p "$B/src" && git -C "$G" archive "$C" | tar -x -C "$B/src"
ln -s "$G/node_modules" "$B/src/node_modules"
(cd "$B/src" && npx tsc --noEmit && npx tsc --noEmit -p worker && npm test && npx vite build --outDir "$B/dist" && mkdir -p "$B/budget" && ln -sfn "$B/dist" "$B/budget/dist" && ln -sfn "$B/src/public" "$B/budget/public" && (cd "$B/budget" && node "$B/src/scripts/budget.mjs"))

# 2. Verify the built folder on a private port (not 4180), e.g. the 390x844 normal + reduced-motion script:
#    (cd "$B/src" && npx vite preview --outDir "$B/dist" --host 127.0.0.1 --port 4191 --strictPort)
#    then stop that server.

# 3. Durable backup of what is served now, checked identical.
cp -a "$G/dist" "$B/served-backup" && diff -r "$G/dist" "$B/served-backup"

# 4. Atomic swap: stage beside dist on the same filesystem, then exchange in one step.
cp -a "$B/dist" "$G/.dist-next" && diff -r "$B/dist" "$G/.dist-next"
mv -T --exchange "$G/.dist-next" "$G/dist"      # dist is now the candidate; .dist-next holds the old build
diff -r "$B/dist" "$G/dist" && rm -rf "$G/.dist-next"
curl -s -o /dev/null -w '%{http_code}\n' https://axiom.tail84303e.ts.net:8443/sandbox
```

Roll back, again atomically:

```bash
cp -a "$B/served-backup" "$G/.dist-rollback" && mv -T --exchange "$G/.dist-rollback" "$G/dist" && rm -rf "$G/.dist-rollback"
```

Pages left open on the old build need a refresh. If the preview process isn't running, start it (serving the
existing `dist/`, no build):

```bash
cd /srv/projects/wwr-build-foundation
WWR_PREVIEW_HOSTS=axiom.tail84303e.ts.net setsid nohup npx vite preview --host 127.0.0.1 --port 4180 --strictPort > /srv/axiom-data/wwr-preview-builds/preview.log 2>&1 &
```

Sign-in does not work in the preview (no Worker); the sandbox does.

## Not in this slice (Season 1 is NOT complete)

- **Server side:** no persistence, multiplayer or real PvP. The rival base is a mock.
- **Payments and progression:** no payments, no Work Orders, no real base or asset progression.
- **Assets:**
  - Asset upgrades cover the three starter Assets only.
  - No package reset or refund (the live rule allows one reset per season).
  - No building boost or Combat Systems.
  - No readiness-band clamp.
- **Numbers:** robot, enemy, patrol, repair, remanufacture, march and battle numbers are untuned test defaults. CC10 pacing targets are not modelled.
- **Art:**
  - No approved robot or Dominion art; the vector figures are temporary.
  - No per-level Asset or building art: the kit modules, rank plates and Workshop fittings are temporary overlays.
- **Alliance:** the Cooperation lane is not available.
- **Presentation:**
  - English only (no i18n pass);
  - no sound, camera or zoom;
  - one fixed portrait map.
- **Proposal names awaiting Matt:** Robot Bay, Repair Yard, remanufacture, Mk part names, Crawler and Walker, Mock Rival Base, "1st Iron Task Force", Field Workshop (also a base skin's name).
