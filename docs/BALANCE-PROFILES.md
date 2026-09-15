# Balance profiles and CC10 pacing

Status: **built and tested locally, not deployed.** The candidate profile is
**unapproved**. Nothing here changes the live game unless someone sets
`WWR_BALANCE_PROFILE`.

## What it is

`shared/balance.ts` holds the building numbers a season or event is allowed
to change. Each set is a typed, versioned and validated **profile**:

- Timer minutes for levels 2-10, per group: Command Center, asset hubs,
  producers, departments.
- A Command Center cost multiplier for levels 2-10.
- An optional clamp on how long any single build can take (at most 72 h).

The rest stays fixed in code, and no profile can reach it:

- gates, the queue, settle-on-read and absolute timers;
- starting stock and production;
- the Depot's 1:1 rates and daily caps;
- the 10,000 weekly Token cap (a ruling; the simulation enforces it);
- Service Rank ×1.045 and the Combat Systems curve.

| Profile | Status | What it is |
|---|---|---|
| `season-1-shipped@1` | default | The tables exactly as shipped. A test checks it matches `buildingStep` for every building, levels 2-50. |
| `season-1-candidate-cc10@1` | candidate | Command Center timers from L6 (72 h clamp) and cost from L4. Every other table is unchanged. |

## Selecting one (Worker)

- **Leave `WWR_BALANCE_PROFILE` unset:** the server runs the shipped tables. This is the default everywhere.
- **Set it to `id` or `id@version`** (for example `season-1-candidate-cc10@1`) to opt in. Put it **only** under `env.test.vars` in `wrangler.jsonc`. This branch does **not** add it there.
- **Unknown, malformed or wrong-version name:** `POST /api/base/level` refuses with a 503 and logs the reason. It never quietly falls back to the default, because a tester who thinks they're on the candidate would waste the test.
- **What the client sees:** every base payload carries `balance: {id, version, status}`, and `BuildingPanel` prices with that same profile.

**Running timers never move.** The profile is read only when a job
*starts*. `base_jobs.completes_at` is absolute, so switching profiles leaves a
running job exactly where it was. `tools/tests/balance.test.ts` proves this
against the real `worker/buildings.ts` and every migration, run on in-memory
SQLite.

**Recording the version.** `base_jobs` has no column for it. While a
non-default profile is active, each job start writes one JSON line to
Workers Logs:

```
{event: 'base_job_started', jobId, toLevel, completesAt, balance: 'id@version'}
```

This branch adds no migration. **Schema need** for a durable record, to be
decided later (additive, no table rebuild):

```sql
ALTER TABLE base_jobs ADD COLUMN balance_profile TEXT;
ALTER TABLE base_jobs ADD COLUMN balance_version INTEGER;
```

## The simulation

Run `npm run sim:pacing` (add `-- --log` for the day each Command Center level lands).

`tools/sim/seasonPacing.ts` is deterministic. It imports every price, timer,
production rate, Depot rule, Engineer/Depot effect and gate from `shared/`.
The one exception is starting stock, which is checked against the migrated
schema.

**What it models (actual mechanics):**
- production;
- Daily Operations lanes and the Cache;
- the day's exercises, from the game's own picker;
- the Arena Field Cache and Full Engagement bonus;
- Credits and Tokens spent 1:1 at the Depot under the daily caps, with Tokens capped at 10,000 per Monday week.

Today the Depot is the only way money touches building progress.

**What it leaves out** (so results lean slow):
- weekly rank rewards;
- raids;
- the Worker paying a finished producer's new rate backdated to the last read.

**Plans.** It tries 16 build-order families for each player (Command Center
rush, plus producers at lag 0/2/4, Engineer Yard, Depot) and keeps the
fastest. A cleverer player could beat the best family, so treat free-player
days as an upper bound.

**Targets, read as windows:**
- typical free player reaches CC10 on day 49-56 (week 8);
- heavy spender reaches CC10 on day 14-21 (week 3).

### Results (actual mechanics)

| Profile | Free typical CC10 | Heavy spender CC10 | Whole base L2-10, raw |
|---|---|---|---|
| shipped | day 16.8 (**early**) | day 9.8 (**early**) | 67.1 d |
| candidate v1 | day 33.7 (**early**) | day 20.7 (on target) | 71.3 d |

### Why no profile hits both

1. **No table reaches both windows.** Searches over Command Center timers (up to the 72 h cap), Command Center cost multipliers and producer timers found nothing that puts the heavy spender at day 21 or earlier and the free player at day 49 or later.
2. **The spender's money is capped.** A heavy spender can buy at most 30,000 Tokens by day 21. That's the ruling, not a Depot limit.
3. **The free player's producers make up the gap.** Once Command Center costs are high enough to slow the free player, the producers they unlock out-earn the spender's Tokens.
4. **Adding more levers doesn't fix it.** Longer producer timers push the free player later, but with the smarter plans the spender gets slower too, and the whole base goes past 100 days.

### Hypothetical options (not in the game, not authorized)

These run on candidate v1, heavy spender only. A free player has no Tokens, so none of them change the free result (day 33.7).

| What-if | Spender CC10 |
|---|---|
| Depot daily caps ×3 | 16.8 |
| Second Engineer Team at Engineer Yard 5 | 18.1 |
| Command Center timer cut at 50 currency/h | 13.3 |

**None of them moves the free player to week 8.** That needs the free player's
own progress to slow down, which means changing production, costs of
buildings other than the Command Center, or gates. All three are design
decisions for Matt and ChatGPT.

## Note on the earlier CC5 report

`wwr-cc5-pacing-check.md` read `COMMAND_CENTER_ROWS` one row low. Command
Center 2 is row 2: 1350/1050/900/**750**, 120 min. Row 1 (900/.../500, 60
min) is never charged. With 0 starting Alloy at 120/h, the first Command
Center upgrade therefore waits **6 h 15 m**, not 4 h 10 m. The test
`shipped numbers are pinned` locks this in.
