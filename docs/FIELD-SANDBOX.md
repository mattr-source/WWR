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
   - **Every Service Rank step 2–10 installs one service component suited to the Asset type** (visual only;
     the rank's real effect is the live attribute change). The earlier components stay fitted, and a small
     blanking cover marks the mount the next rank will use.
     - **Armour** (also artillery and naval): tow shackles, track guards, smoke grenade launchers, commander's
       sight, spare track links, turret stowage rack, jerry-can rack, remote weapon station, reactive armour bricks.
     - **Rotary:** wire-strike cutter, flare dispensers, exhaust IR suppressor, rescue hoist, laser warning
       receivers, refuelling probe, door gun mount, tail rotor guard, cockpit armour frame.
     - **Aircraft** (drone and fixed wing): air-data probe, wingtip navigation lights, GPS antenna blades,
       leading-edge de-icing boots, tail flare dispenser, ventral datalink antenna, conformal fuel tank,
       winglets, engine intake guard.
     - At rank 10 they sit on the existing r10 render. Placements are checked on both the r01 and r10 renders of
       all three starter Assets.
     - **Two detail levels:** the Hangar and the ceremonies draw everything, including empty package mounts, level
       pips and the next-mount cover. The ~50 px map sprite (`detail="map"`) keeps every fitted component and
       module, so the per-rank change stays visible, but leaves out the empty mounts, pips and cover and uses a
       smaller rank plate, to cut clutter.
     - `tools/tests/sandboxRefitArt.test.ts` renders the kit markup and checks, for each starter Asset, that
       every rank adds exactly one new component and keeps the earlier ones.
   - **Every upgrade plays a skippable install ceremony in the Hangar bay:** the old rank plate or package module
     lifts off the Asset's own render and the new one drops on. For a rank, that's the component's blanking cover
     and the old plate out, the component and new plate in. At rank 10 the render itself also changes to the
     existing r10 art. Then the real before/after attributes, sandbox HP and volley.
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

## Two views: Matt's original World and base layouts (2026-09-15)

Matt's direction: two views, the world view and the base view he had already built, with the same layout,
buttons and Comms layout, merged with the sandbox systems. The sandbox therefore ports the live presentation
into `src/sandbox/original/` (the sandbox may not import `src/live` or `src/net`, so these are ports, checked
against the live files by `tools/tests/sandboxScenes.test.ts`). The view is in the URL hash: no hash or `#world`
opens the World view (the live game opens on the map), `#base` the base.

| Live source | Sandbox port | What is the same | What differs, and why |
|---|---|---|---|
| `src/live/WorldMap.tsx` HUD | `original/WorldView.tsx` | Task Forces (grid icon) top-left; world card with RST clock; account portrait and **My base** top-right; **Task forces out** with **Recall** under them; bottom column: selection panel, **+ / −** left, **Reports** and **Home** right; same classes and English strings | The map under it is the practice sector (`SectorMap.tsx` on the live terrain), not the pannable server world: + / − and Home zoom that sector. Test ⏩ sits in Task forces out. Controls lift above General Rider so nothing is covered. |
| World map bases (`skins.ts`, `skinArt.ts`, `drawNameplate`) | `worldSkins.tsx` | Base **skin** art, bottom-anchored, fill 1.12, overhang 0.25; the callsign **nameplate** along the bottom (orange for you) | SVG instead of canvas. Practice base: the default starter skin; mock rival: another starter. Never an exclusive. |
| `src/live/BaseBoard.tsx` | `original/SandboxBaseBoard.tsx` | Painting covers the screen and pans; buildings at their pads with no permanent labels; one tap names a building, a second tap opens it; Command Center hit box; four Task Force slabs | Default placements; press-and-hold says moving buildings needs the server; slabs read the practice Task Force. |
| `src/live/LiveApp.tsx` base header | `Sandbox.tsx` | Account left, RST clock centre, **World map** right | A "Practice sandbox" chip under the clock. |
| `src/live/Chat.tsx` | `Comms.tsx` | Pinned bottom COMMS bar; full-screen panel with header, Close, Server/Alliance/Leadership/Private tabs, Private tab rows, composer | Offline: no channels, so tabs lock as live chat locks a channel-less tab; inputs and Send disabled; an offline notice. No messages invented. |
| `src/live/guide/Guide.tsx` | `original/SandboxGuide.tsx` | Portrait bottom-left above Comms, bubble with Next / Skip tour, ✕ folds to the portrait, cyan pulse on the step's target, steps aside while a sheet is open | Drives the sandbox tutorial, saved locally. The screens reserve its measured height only while the walkthrough is running; once it is skipped or finished the World map and base board run down to Comms again, with no reload. |
| `src/live/Squads.tsx` Task Force card | `original/SandboxPanels.tsx` `SquadSetup` | Name, slots-filled bar, drone line, 3×2 slot grid, repair button; opened from the Task Force slab at the bottom of the base | Six slots are the practice robots and Assets; a tap sends a unit or keeps it home. No band labels (positions are not used by practice battles). |
| `PlayerPanel` in `LiveApp.tsx` | `AccountPanel` | Portrait and name, two-column readout, list of doors | Readout is practice supplies and test Credits; profile, customise, alliance, settings and sign out need the server and are not offered. |

**Squads (Matt):** "squads when they attack are simple one click and attack button appears and they go. The
squads are setup inside the base view at the bottom." The line-up is set on the **Task Force Alpha slab** (saved
in the practice save as `squad`; older saves without it mean the whole Task Force). On the World view a tap on a
target shows **Attack** in the selection panel; pressing it marches the line-up's ready units. If nothing can go,
the panel says why (no ready robot, no ready drone, already out). No chooser sheet on the map.

**Where each sandbox system lives now:**

| System | Reached from |
|---|---|
| Robot Bay, Field Workshop | Base Fabrication Shop |
| Repairs | Base Materials Recovery Yard; the line-up's repair button |
| Hangar (Asset ranks, packages, refits) | Base Armour / Helicopter / Drone buildings (Missile and Fixed-Wing: no practice Asset) |
| Season 1 Events hub, then Operations | Base Tactical Operations Center; account menu |
| Command Center (record, test controls) | Base Command Center; account menu |
| Battle reports | World **Reports** |
| Attack, march, battle, return | World: tap target, Attack; Task forces out |

Removed from the earlier sandbox build: the invented five-tab bottom bar, the HUD Events button, the always-labelled
Home Base board, the docked Rider strip and the force-picker target card.

## Season 1 Events hub (2026-09-15)

`src/sandbox/SeasonHub.tsx` over the pure model `src/sandbox/seasonHub.ts`. An overlay, not a third view: opened
from the base's Tactical Operations Center (where the live game keeps Events) and the account menu.

- **Banner:** "Mech Uprising — Iron Dominion" (`SEASON_1_NAME`), practice week N/10 with its chapter name, story
  beat and featured play, the phase by the live `seasonPhase` rule, and the live Season 1 calendar week and
  00:00 RST daily/weekly resets (`dailyWindow`, `weeklyWindow`). Art: General Rider (`rider-full.webp`), the
  Tactical Operations Center, terrain props, the temporary Dominion Walker and Crawler (labelled).
- **Chapters:** the ten-week strip is the design table in `docs/SEASON-1-LIVE-OPS-DESIGN-v1.md`, copied verbatim
  (a test checks every row against the doc). No chapter score weights exist in the design, so none are shown.
  Each week shows how many Assets unlock (`UNLOCK_WEEK`) with their r01 renders, or their category's runway
  building art where no render exists.
- **Week:** progress and rewards follow the sandbox's own clock (practice week = `sandboxWeek`), so the test clock
  can walk through chapters. The live calendar week is shown beside it for reference.
- **Event cards:**
  - Daily Operations: lanes done/4 and Cache state from sandbox state; opens Operations.
  - Daily Exercises: today's targets from the real picker with cleared state and real week rewards; each jumps to
    its World Map target.
  - Iron Dominion Arena: **locked, live server event.** Phase, attempts, Field Cache and the live rules
    (`shared/arena.ts`). Not simulated: the Warden and rankings come from other players.
  - Dominion Warfront: **locked, alliance event.** An estimate of what today's practice would score under the
    live point table (`POINTS`, `cappedMetric`, `cappedDayScore`); nothing is submitted. Live rules.
  - Alliance Convoy: **locked, alliance event.** Truck art and the live rules, minus the Contract Convoy line
    (its payment rule is unsettled and not a sandbox currency).

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
| `src/sandbox/Sandbox.tsx` | The screen: HUD, Rider, scene switch, target card, battle report, Hangar, Operations, record, test controls. |
| `src/sandbox/original/*` | Ports of the live World HUD, base board, guide, squad card and account panel (see Two views). |
| `src/sandbox/baseRoles.ts` | What each base building opens in the sandbox. |
| `src/sandbox/worldSkins.tsx` | Base skins with nameplates on the World view. |
| `src/sandbox/worldGround.ts` | Live Season 1 terrain painted under the World Map. |
| `src/sandbox/BasePanels.tsx` | Building-art cards, Repairs, the no-function building sheet. |
| `src/sandbox/Comms.tsx` | Offline Comms bar and panel. |
| `src/sandbox/SeasonHub.tsx`, `seasonHub.ts` | Season 1 Events hub and its pure model. |

## Art: what's real and what's temporary

- **Existing WWR art reused:**
  - Asset hero renders `public/assets/<id>/r01.webp` (via `shared/assetVisuals.ts`), as the live world map draws them.
  - Matt's base buildings (`building-fabrication-shop`, `building-recovery-yard`, `building-garrison-barracks` for the mock rival).
  - The whole live base: `board-v5.webp` and all fifteen building and vehicle arts, on Home Base and as card art
    in Operations, Repairs and Reports.
  - The live Season 1 terrain generator and prop atlas, under the World Map.
  - Terrain atlas props (`shared/terrainAtlas.ts`) and the Alliance Convoy truck.
  - General Rider's portrait.
- **Temporary vector art (labelled "Temporary art" on screen), not approved final art:**
  - The humanoid robots: five internal looks per part, from salvaged scrap at level 1 to glowing powered armour at level 50, plus a visible change at every tier.
  - The Dominion Crawler and Walker.
  - The Asset kit modules, service components, rank plates and Field Workshop fittings. They are drawn over existing art so every
    level shows a visible change, but no per-level Asset or building art exists. The only real per-level Asset art
    change in Season 1 is the rank 10 render.
  - The World view carries a permanent label, "Temporary art: robots, Dominion machines, kit", in its own strip
    between the map and General Rider / Comms, outside the map area, so it never covers a target, a unit or the base
    nameplate. The base view shows no temporary art; its header chip says "Practice sandbox".
  - No approved robot or Dominion art exists yet. No paid or generated images were used.
- The rejected flat unit SVGs (`public/sandbox/units/*`) and the old `Battlefield.tsx` are removed.

## Asset visuals per level: which direction applies

- **Sep 7:** the Season 1 decisions (`docs/season-1/13-DECISIONS.md` §11, 2026-09-07) say Asset visuals change
  only at Service Rank milestones, that package upgrades change no visuals, and that there are no layered
  component overlays.
- **Sep 15:** Matt's later direction ("Animated upgrades at each level even if its just one item", with the
  changed part staying visible) **supersedes Sep 7 for this private prototype sandbox**. No further approval is
  needed to keep the per-level parts here.
- **What this does not cover:**
  - It is not a change to the live game.
  - It is not approval of final overlay art.
  - It is not authorization for paid image generation.
  - Whether the live game adopts per-level overlays, and with what art, remains a separate art and production
    decision.

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
