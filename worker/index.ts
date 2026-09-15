/**
 * World War Rogue API.
 *
 * Requests to /api/* are handled here; everything else falls through to the
 * static assets binding, which serves the built React client.
 */
import {handleAdminRequests} from './admin';
import {handleBotsPage} from './botsAdmin';
import {buyFromTradePost, readTradePost} from './tradePost';
import {isRoute} from '../shared/tradePost';
import {
  FARM_CEILING_SEASON_1,
  PLANT_BATCH_MAX,
  TEST_ROLE,
  growBotsInViewport,
  materialiseBot,
  mintTestBots,
  plantFarmBots,
} from './bots';
import {ensureRally, lastRalliedAt, rallyTo, readRally, setRally} from './rally';
import {assignSlot, deltaOpen, ensureRoster, moveSlot, readSquads, squadPower} from './squads';
import {packageUp, rankUp, resetPackages, settleWallet} from './upgrades';
import {readSystems, systemUp} from './combatSystems';
import {powerBreakdown} from '../shared/powerBreakdown';
import {createQaAccount, devAction, devSeedsEnabled, devStatus} from './devProgression';
import {claimCache, listGrants, noteDailyProgress, readDaily} from './dailyOps';
import {ensureExercises, readExercise, viewOf} from './exercises';
import {arenaView, listAttempts, makeAttempt, readAttempt} from './arena';
import {arenaSquadView, saveArenaSlots} from './arenaSquad';
import {allianceConvoyView, joinTruck, leaveTruck, setGuard, setGuardian, startContract, worldConvoys} from './allianceConvoy';
import {noteWarfront} from './warfrontLedger';
import {warfrontView} from './warfront';
import {seasonPhase} from '../shared/season1Ops';
import {FARM_ROLE} from './bots';
import {isCombatSystemLane} from '../shared/combatSystems';
import {buyResource, buySecondTeam, readBase, readLevels, startLevel} from './buildings';
import {applyShield, buyDelta, readSeasonState, saveGuide, startBuild} from './season1';
import {powerOf} from './power';
import {settleRepairs, startRepair} from './repair';
import {NEW_SHIELD_MS, isShielded} from '../shared/shields';
import {type LevelledBuilding, rankCeiling, signalsLeadMs} from '../shared/buildings';
import {BOARD_BUILDING_BY_ID} from '../shared/base';
import {isPackageKey} from '../shared/upgrades';
import {balanceRef, selectBalanceProfile} from '../shared/balance';
import {type Split} from '../shared/economy';
import {launchExercise, 
  deployments,
  launch,
  marchingSquads,
  pendingMarches,
  recall,
  settleArrivals,
} from './march';
import {SQUAD_NAMES, isSquadName} from '../shared/assets';
import {RALLY_COOLDOWN_MS, maySetRally, rallyCooldownLeft} from '../shared/rally';
import {listBattles, readBattle} from './battles';
import {REPORT_RETENTION_DAYS} from '../shared/battles';
import {
  CLASSIFIER_MODEL,
  TRANSLATION_MODEL,
  type Viewer,
  channelsFor,
  clearMentions,
  mentionableIn,
  pendingMentions,
  recordMentions,
  readChannel,
  readRecent,
  readGenerated,
  readTranslation,
  refineLanguage,
  resolveAccess,
  translateMissing,
} from './chat';
import {type ReportInput, fileReport, recentReports, reportAllowedAt} from './support';
import {
  LANGUAGE_CODES,
  MESSAGE_MAX,
  RETENTION_DAYS,
  detectLanguage,
  dmChannel,
  dmOther,
  flattenMessage,
  GROUP_CAPACITY,
  GROUP_NAME_MAX,
  groupChannel,
  isLanguage,
} from '../shared/chat';
import {
  atCapacity,
  createAlliance,
  mayActOn,
  memberCount,
  membershipOf,
  rosterOf,
} from './alliance';
import {
  ALLIANCE_CAPACITY,
  type AllianceRank,
  DESCRIPTION_MAX,
  MAX_LIEUTENANTS,
} from '../shared/alliances';
import {
  type ProfileEdit,
  clearPortrait,
  loadProfile,
  imageResponse,
  savePortrait,
  validateEdit,
  validatePortrait,
} from './profile';
import {isPortraitTint} from '../shared/portraits';
import {
  COSMETIC_SLOTS,
  checkLoadout,
  ownedItemIds,
} from './cosmetics';
import {COSMETICS, normaliseLoadout} from '../shared/cosmetics';
import {arrange as arrangeBoard, readPlacements} from './baseBoard';
import {
  SESSION_TTL_MS,
  hashPassword,
  newId,
  newToken,
  readSessionCookie,
  sessionCookie,
  validateCredentials,
  verifyPassword,
} from './auth';
import {
  type MailerConfig,
  CALLSIGN_RULE,
  approvalEmail,
  decisionEmail,
  sendMail,
  validateAccessRequest,
  validateCallsign,
} from './signup';
import {
  assignHomeWorld,
  basesInViewport,
  getWorld,
  placeSomewhereFree,
  reachableWorlds,
  tryPlace,
} from './world';
import {
  BUILDINGS,
  BUILDING_KINDS,
  SKINS,
  SKIN_IDS,
  STARTER_SKIN_IDS,
  ALL_SKINS_UNLOCKED,
  type SkinId,
  WORLD_EXTENT,
  candidatePlots,
  isSkinId,
  type BuildingKind,
  type ResourceKind,
  STORAGE_CAP,
  isBuildingKind,
  maxAllowedLevel,
  productionPerHour,
  totalPower,
  upgradeCost,
  upgradeDurationMs,
} from './game';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Workers AI, used only for chat translation. Optional so a deploy without
   *  the binding still runs, with translation simply absent. */
  AI?: {run: (model: string, input: unknown) => Promise<unknown>};
  DEBUG_ERRORS?: string;
  /** Set with: wrangler secret put RESEND_API_KEY */
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  OWNER_EMAIL?: string;
  /** Set with: wrangler secret put TEST_BOT_SECRET. Unset = test bots cannot be minted. */
  TEST_BOT_SECRET?: string;
  /** "on" lets test-bot accounts order attacks. Off on the live server. */
  TEST_BOTS_MAY_ATTACK?: string;
  /** Where Tokens are bought - the website, never the game. Unset = no button. */
  WWR_TOKEN_STORE_URL?: string;
  /**
   * "true" turns on the development-only progression seed tools
   * (worker/devProgression.ts). Set ONLY under env.test in wrangler.jsonc.
   */
  ALLOW_DEV_PROGRESSION_SEEDS?: string;
  /**
   * The balance profile building upgrades are priced from (shared/balance.ts),
   * as "id" or "id@version". Unset = the shipped tables. Set ONLY under env.test
   * in wrangler.jsonc; an unknown or mis-versioned name pauses upgrade starts.
   */
  WWR_BALANCE_PROFILE?: string;
}

const RESOURCES: ResourceKind[] = ['fuel', 'steel', 'munitions', 'alloy'];

function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {'Content-Type': 'application/json; charset=utf-8', ...(init.headers ?? {})},
  });
}

function fail(status: number, error: string): Response {
  return json({error}, {status});
}

interface PlayerRow {
  id: string;
  username: string;
  role: string;
  /** Their chosen language. Drives chat translation AND the interface. */
  locale: string;
}

async function authenticate(request: Request, env: Env): Promise<PlayerRow | null> {
  const token = readSessionCookie(request);
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT p.id AS id, p.username AS username, p.role AS role, p.locale AS locale
       FROM sessions s JOIN players p ON p.id = s.player_id
      WHERE s.token = ?1 AND s.expires_at > ?2`,
  )
    .bind(token, Date.now())
    .first<PlayerRow>();
  return row ?? null;
}

/**
 * Places a base on a free plot.
 *
 * Collision is settled by the unique index on (plot_x, plot_y) rather than by
 * checking first and then writing: two players registering in the same instant
 * would both pass a check, but only one can win the insert. A rejected attempt
 * simply tries the next candidate.
 */
/** Creates the starting base for a new player. */
async function seedBase(
  env: Env,
  playerId: string,
  username: string,
  skin: SkinId,
  now: number,
  /** Bots are planted into a named world; players go wherever there is room. */
  worldId?: number,
): Promise<void> {
  worldId ??= await assignHomeWorld(env.DB, now);
  const statements = [
    env.DB.prepare(
      `INSERT INTO bases (player_id, name, resources_at, created_at, skin, home_world_id)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    ).bind(playerId, `${username}'s Forward Base`, now, now, skin, worldId),
    ...BUILDING_KINDS.map((kind) =>
      env.DB.prepare(`INSERT INTO buildings (player_id, kind, level) VALUES (?1, ?2, ?3)`).bind(
        playerId,
        kind,
        kind === 'command_post' ? 1 : 0,
      ),
    ),
  ];
  await env.DB.batch(statements);
  const world = await getWorld(env.DB, worldId);
  await placeSomewhereFree(env.DB, worldId, playerId, world?.extent ?? WORLD_EXTENT, now);
}

interface BaseRow {
  player_id: string;
  name: string;
  fuel: number;
  steel: number;
  munitions: number;
  alloy: number;
  resources_at: number;
  skin: string;
  home_world_id: number | null;
  banner: string;
  emblem: string;
  lights: string;
  decal: string;
}

interface JobRow {
  id: string;
  kind: string;
  to_level: number;
  started_at: number;
  completes_at: number;
}

/**
 * Reads the base and brings it up to date.
 *
 * This is where the "no ticking loop" model lives: production accrued since
 * resources_at is settled now, and any build job whose completes_at has passed
 * is applied now. Nothing runs in the background; state becomes true the moment
 * somebody looks at it.
 */
async function settleAndLoad(env: Env, playerId: string, now: number) {
  const base = await env.DB.prepare(`SELECT * FROM bases WHERE player_id = ?1`)
    .bind(playerId)
    .first<BaseRow>();
  if (!base) return null;

  const buildingRows = await env.DB.prepare(
    `SELECT kind, level FROM buildings WHERE player_id = ?1`,
  )
    .bind(playerId)
    .all<{kind: string; level: number}>();

  const levels = Object.fromEntries(BUILDING_KINDS.map((k) => [k, 0])) as Record<BuildingKind, number>;
  for (const row of buildingRows.results ?? []) {
    if (isBuildingKind(row.kind)) levels[row.kind] = row.level;
  }

  let job = await env.DB.prepare(
    `SELECT id, kind, to_level, started_at, completes_at
       FROM build_jobs WHERE player_id = ?1 AND collected_at IS NULL`,
  )
    .bind(playerId)
    .first<JobRow>();

  const writes: D1PreparedStatement[] = [];

  // Apply a finished upgrade before computing production, so the new level
  // starts earning from the instant it completed rather than from now.
  let productionFrom = base.resources_at;
  let completedJob: {kind: BuildingKind; level: number} | null = null;
  if (job && job.completes_at <= now && isBuildingKind(job.kind)) {
    levels[job.kind] = job.to_level;
    completedJob = {kind: job.kind, level: job.to_level};
    writes.push(
      env.DB.prepare(`UPDATE buildings SET level = ?3 WHERE player_id = ?1 AND kind = ?2`).bind(
        playerId,
        job.kind,
        job.to_level,
      ),
      env.DB.prepare(`UPDATE build_jobs SET collected_at = ?2 WHERE id = ?1`).bind(job.id, now),
    );
    job = null;
  }

  if (writes.length > 0) await env.DB.batch(writes);

  // Resources are the v2 base's now (worker/buildings.ts): produced by the
  // four producer buildings' levels, capped by the Warehouse, settled there.
  const v2 = await readBase(env.DB, playerId, now);
  const resources = v2.resources;
  const rate = v2.productionPerHour;
  const cap = v2.storageCap;
  const baseLevel = v2.levels.command_center;

  return {base, levels, resources, rate, cap, job, completedJob, baseLevel};
}

function baseView(state: NonNullable<Awaited<ReturnType<typeof settleAndLoad>>>, now: number) {
  return {
    serverTime: now,
    name: state.base.name,
    skin: state.base.skin,
    loadout: normaliseLoadout(state.base),
    homeWorldId: state.base.home_world_id,
    resources: state.resources,
    productionPerHour: state.rate,
    storageCap: state.cap,
    /** The Command Center's level (base levels v2) - the Base Level. */
    baseLevel: state.baseLevel,
    justCompleted: state.completedJob,
    buildings: BUILDING_KINDS.map((kind) => {
      const level = state.levels[kind];
      const spec = BUILDINGS[kind];
      const ceiling = maxAllowedLevel(kind, state.levels.command_post);
      return {
        kind,
        name: spec.name,
        blurb: spec.blurb,
        level,
        maxLevel: spec.maxLevel,
        canUpgrade: level < ceiling,
        blockedByCommandPost: level >= ceiling && level < spec.maxLevel,
        nextCost: level < spec.maxLevel ? upgradeCost(kind, level) : null,
        nextDurationMs: level < spec.maxLevel ? upgradeDurationMs(kind, level) : null,
      };
    }),
    job: state.job
      ? {
          kind: state.job.kind,
          toLevel: state.job.to_level,
          startedAt: state.job.started_at,
          completesAt: state.job.completes_at,
        }
      : null,
  };
}

/**
 * Access request handlers.
 *
 * Registering no longer creates an account. It creates a request, which is
 * approved or declined from a link in an email. An account exists only after
 * approval.
 */

/** Nobody may hold more than one pending request, and the queue is capped. */
const MAX_PENDING = 200;

async function handleCallsignCheck(request: Request, env: Env): Promise<Response> {
  const name = new URL(request.url).searchParams.get('name') ?? '';
  const parsed = validateCallsign(name);
  if (!parsed.ok) return json({available: false, reason: parsed.error});

  const key = parsed.value.toLowerCase();
  const [player, pending] = await Promise.all([
    env.DB.prepare(`SELECT 1 AS hit FROM players WHERE username_key = ?1`).bind(key).first(),
    env.DB.prepare(`SELECT 1 AS hit FROM signups WHERE username_key = ?1 AND status = 'pending'`)
      .bind(key)
      .first(),
  ]);

  return player || pending
    ? json({available: false, reason: 'That callsign is taken.'})
    : json({available: true});
}

async function handleRequestAccess(request: Request, env: Env): Promise<Response> {
  const now = Date.now();
  const parsed = validateAccessRequest(await request.json().catch(() => null));
  if (!parsed.ok) return fail(400, parsed.error);
  const req = parsed.value;

  const emailKey = req.email.toLowerCase();
  const usernameKey = req.username.toLowerCase();

  const [callsignTaken, emailKnown, pending] = await Promise.all([
    env.DB.prepare(
      `SELECT 1 AS hit FROM players WHERE username_key = ?1
        UNION SELECT 1 FROM signups WHERE username_key = ?1 AND status = 'pending'`,
    )
      .bind(usernameKey)
      .first(),
    env.DB.prepare(
      `SELECT 1 AS hit FROM players WHERE email_key = ?1
        UNION SELECT 1 FROM signups WHERE email_key = ?1 AND status = 'pending'`,
    )
      .bind(emailKey)
      .first(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM signups WHERE status = 'pending'`).first<{n: number}>(),
  ]);

  // A taken callsign is answered plainly - every callsign is already on show
  // across the map, so refusing to say costs the applicant a guessing game and
  // protects nothing.
  if (callsignTaken) return fail(409, 'That callsign is taken. Choose another.');

  // Whether an address already has an account is not public anywhere, so this
  // answers exactly as it would for a brand new address.
  if (emailKnown) {
    return json({
      status: 'pending',
      message: 'Request sent. You will be emailed once it has been reviewed.',
    });
  }

  if ((pending?.n ?? 0) >= MAX_PENDING) {
    return fail(503, 'The request queue is full. Try again later.');
  }

  const token = newToken();

  await env.DB.prepare(
    `INSERT INTO signups (id, email, email_key, username, username_key, password_hash,
                          age_confirmed, country, locale, skin, decide_token,
                          created_at, request_ip)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8, ?9, ?10, ?11, ?12)`,
  )
    .bind(
      newId(),
      req.email,
      emailKey,
      req.username,
      usernameKey,
      await hashPassword(req.password),
      req.country,
      req.locale,
      req.skin,
      token,
      now,
      request.headers.get('CF-Connecting-IP') ?? null,
    )
    .run();

  const mailer = mailerFrom(env);
  if (mailer) {
    const origin = new URL(request.url).origin;
    const mail = approvalEmail({
      username: req.username,
      email: req.email,
      country: req.country,
      origin,
      token,
      pendingCount: (pending?.n ?? 0) + 1,
    });
    const sent = await sendMail(mailer, mailer.owner, mail.subject, mail.html);
    // A stored request is not a failure just because the notification did not
    // go out: the request still waits in the queue either way.
    if (!sent.ok) console.error('Approval email failed:', sent.error);
  } else {
    console.error('RESEND_API_KEY is not configured; approval email not sent.');
  }

  return json({
    status: 'pending',
    message: 'Request sent. You will be emailed once it has been reviewed.',
  });
}

/**
 * Approve or decline, from the link in the notification email.
 *
 * Answers HTML rather than JSON: this is opened in a mail client, by a person.
 */
async function handleDecision(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') ?? '';
  const decision = url.searchParams.get('decision');
  if (!token || (decision !== 'approve' && decision !== 'decline')) {
    return page('Bad link', 'That approval link is not valid.');
  }

  const row = await env.DB.prepare(
    `SELECT id, email, username, username_key, password_hash, country, locale, skin, status
       FROM signups WHERE decide_token = ?1`,
  )
    .bind(token)
    .first<{
      id: string;
      email: string;
      username: string;
      username_key: string;
      password_hash: string;
      country: string;
      locale: string;
      skin: string;
      status: string;
    }>();

  if (!row) return page('Not found', 'That request no longer exists.');
  if (row.status !== 'pending') {
    return page('Already decided', `${row.username} was already ${row.status}.`);
  }

  const now = Date.now();
  const approved = decision === 'approve';

  if (approved) {
    const taken = await env.DB.prepare(`SELECT id FROM players WHERE username_key = ?1`)
      .bind(row.username_key)
      .first();
    if (taken) {
      await env.DB.prepare(
        `UPDATE signups SET status = 'declined', decided_at = ?2 WHERE id = ?1`,
      )
        .bind(row.id, now)
        .run();
      return page('Callsign taken', `${row.username} was claimed while this request was waiting.`);
    }

    const playerId = newId();
    await env.DB.prepare(
      `INSERT INTO players (id, username, username_key, password_hash, created_at, last_seen_at,
                            email, email_key, country, locale, approved_at,
                            shield_until, shield_kind)
       VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6, ?7, ?8, ?9, ?5, ?10, 'new')`,
    )
      .bind(
        playerId,
        row.username,
        row.username_key,
        row.password_hash,
        now,
        row.email,
        row.email.toLowerCase(),
        row.country,
        row.locale,
        now + NEW_SHIELD_MS,
      )
      .run();
    await seedBase(env, playerId, row.username, isSkinId(row.skin) ? row.skin : STARTER_SKIN_IDS[0], now);
  }

  // The stored password hash is cleared on decision: an approved request has
  // handed it to the account, and a declined one has no use for it.
  await env.DB.prepare(
    `UPDATE signups SET status = ?2, decided_at = ?3, password_hash = '' WHERE id = ?1`,
  )
    .bind(row.id, approved ? 'approved' : 'declined', now)
    .run();

  const mailer = mailerFrom(env);
  if (mailer) {
    const mail = decisionEmail({username: row.username, approved, origin: url.origin});
    const sent = await sendMail(mailer, row.email, mail.subject, mail.html);
    if (!sent.ok) console.error('Decision email failed:', sent.error);
  }

  return page(
    approved ? 'Approved' : 'Declined',
    approved
      ? `${row.username} can now sign in. They have been emailed.`
      : `${row.username} has been declined and emailed.`,
  );
}

function page(title: string, body: string): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
     <title>${title}</title>
     <div style="font-family:ui-sans-serif,system-ui,sans-serif;background:#0a0c0b;color:#e5e7eb;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px">
       <div style="max-width:420px">
         <p style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#ea580c;margin:0">World War Rogue</p>
         <h1 style="font-size:22px;margin:8px 0 10px">${title}</h1>
         <p style="color:#9ca3af;font-size:14px;margin:0">${body}</p>
       </div>
     </div>`,
    {status: 200, headers: {'Content-Type': 'text/html; charset=utf-8'}},
  );
}

function mailerFrom(env: Env): MailerConfig | null {
  if (!env.RESEND_API_KEY) return null;
  return {
    apiKey: env.RESEND_API_KEY,
    from: env.MAIL_FROM ?? 'World War Rogue <noreply@worldwarrogue.com>',
    owner: env.OWNER_EMAIL ?? 'support@worldwarrogue.com',
  };
}

/* -------------------------------------------------------------------------- */
/* Bots                                                                        */
/* -------------------------------------------------------------------------- */

function seedBaseFor(env: Env) {
  // A random starter skin each, so a row of bots does not share one look.
  return (playerId: string, username: string, now: number, worldId?: number) =>
    seedBase(env, playerId, username, STARTER_SKIN_IDS[Math.floor(Math.random() * STARTER_SKIN_IDS.length)], now, worldId);
}

/**
 * Mint test accounts. Authenticated by a shared secret rather than a session,
 * because the harness that calls it has no account yet - that is what it is
 * asking for. Refused outright when the secret is not configured.
 */
async function handleMintTestBots(request: Request, env: Env): Promise<Response> {
  if (!env.TEST_BOT_SECRET) return fail(404, 'No such endpoint.');
  const given = request.headers.get('X-Test-Bot-Secret') ?? '';
  if (given.length === 0 || given !== env.TEST_BOT_SECRET) return fail(404, 'No such endpoint.');
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const count = Math.min(10, Math.max(1, Number(body?.count) || 5));
  const now = Date.now();
  const bots = await mintTestBots(env.DB, count, seedBaseFor(env), NEW_SHIELD_MS, now);
  return json({bots, note: 'Passwords are shown once. Store them now.'});
}

/** Owner only: plant a batch of farm bots in one world. */
async function handlePlantFarmBots(request: Request, env: Env, player: PlayerRow): Promise<Response> {
  if (player.role !== 'owner') return fail(404, 'No such endpoint.');
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const worldId = Number(body?.worldId);
  if (!Number.isInteger(worldId)) return fail(400, 'Which world?');
  const world = await getWorld(env.DB, worldId);
  if (!world) return fail(404, 'No such world.');
  const count = Math.min(PLANT_BATCH_MAX, Math.max(1, Number(body?.count) || PLANT_BATCH_MAX));
  const ceiling = Math.min(50, Math.max(1, Number(body?.ceiling) || FARM_CEILING_SEASON_1));
  const planted = await plantFarmBots(env.DB, worldId, count, ceiling, seedBaseFor(env), Date.now());
  return json({planted: planted.length, bots: planted});
}

/**
 * Owner only: sign in as any account. Replaces the owner's own session cookie
 * with the target's, so signing out afterwards and back in is how the owner
 * returns to being themselves. Answers a redirect because the link lives on
 * the bots page and is opened by a person.
 */
async function handleImpersonate(request: Request, env: Env, player: PlayerRow): Promise<Response> {
  if (player.role !== 'owner') return fail(404, 'No such endpoint.');
  const url = new URL(request.url);
  const playerId = url.searchParams.get('player') ?? '';
  const target = await env.DB.prepare(`SELECT id, username, role FROM players WHERE id = ?1`)
    .bind(playerId)
    .first<{id: string; username: string; role: string}>();
  if (!target) return fail(404, 'No such player.');
  const session = await startSession(env, target.id, target.username, Date.now(), target.role);
  const cookie = session.headers.get('Set-Cookie') ?? '';
  return new Response(null, {status: 303, headers: {Location: '/', 'Set-Cookie': cookie}});
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  const parsed = validateCredentials(await request.json().catch(() => null));
  if (!parsed.ok) return fail(400, parsed.error);
  const {username, password} = parsed.value;

  const row = await env.DB.prepare(
    `SELECT id, username, password_hash, role FROM players WHERE username_key = ?1`,
  )
    .bind(username.toLowerCase())
    .first<{id: string; username: string; password_hash: string; role: string}>();

  // Same response whether the account is missing or the password is wrong, so
  // the endpoint cannot be used to enumerate callsigns.
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    return fail(401, 'Callsign or password is incorrect.');
  }
  return startSession(env, row.id, row.username, Date.now(), row.role);
}

async function startSession(
  env: Env,
  playerId: string,
  username: string,
  now: number,
  role = 'player',
): Promise<Response> {
  const token = newToken();
  const expiresAt = now + SESSION_TTL_MS;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO sessions (token, player_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)`,
    ).bind(token, playerId, now, expiresAt),
    env.DB.prepare(`UPDATE players SET last_seen_at = ?2 WHERE id = ?1`).bind(playerId, now),
    env.DB.prepare(`DELETE FROM sessions WHERE expires_at < ?1`).bind(now),
  ]);
  return json(
    {player: {id: playerId, username, role}},
    {headers: {'Set-Cookie': sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000))}},
  );
}

/**
 * The map viewport.
 *
 * Bounded by what is on screen rather than by the population, so a world with
 * a thousand bases costs the same to draw as one with ten.
 */
async function handleWorld(request: Request, env: Env, player: PlayerRow): Promise<Response> {
  const url = new URL(request.url);
  const now = Date.now();
  const num = (key: string, fallback: number) => {
    const raw = Number.parseInt(url.searchParams.get(key) ?? '', 10);
    return Number.isFinite(raw) ? raw : fallback;
  };

  const worlds = await reachableWorlds(env.DB, player.id, now);
  if (worlds.length === 0) return fail(409, 'You have not been deployed yet.');

  // A player may only look at worlds they can actually stand in: their home,
  // and any open event admitting it. Asking for another world is refused
  // rather than quietly answered with someone else's map.
  const requested = url.searchParams.get('world');
  const world = requested
    ? worlds.find((entry) => String(entry.id) === requested)
    : (worlds.find((entry) => entry.kind === 'home') ?? worlds[0]);
  if (!world) return fail(403, 'That world is not open to you.');

  const x = num('x', 0);
  const y = num('y', 0);
  const w = Math.min(80, Math.max(1, num('w', 40)));
  const h = Math.min(80, Math.max(1, num('h', 40)));

  // Farm bots inside the rectangle are brought up to date first, so the
  // levels drawn on the map are the ones a raid would meet. worker/bots.ts.
  await growBotsInViewport(env.DB, world.id, x, y, w, h, now);

  const [bases, self, home] = await Promise.all([
    basesInViewport(env.DB, world.id, x, y, w, h),
    env.DB.prepare(
      `SELECT plot_x AS x, plot_y AS y FROM placements WHERE world_id = ?1 AND player_id = ?2`,
    )
      .bind(world.id, player.id)
      .first<{x: number; y: number}>(),
    env.DB.prepare(`SELECT home_world_id AS id FROM bases WHERE player_id = ?1`)
      .bind(player.id)
      .first<{id: number | null}>(),
  ]);

  const ownAlliance = await env.DB.prepare(
    `SELECT alliance_id AS id, rank AS rank FROM alliance_members WHERE player_id = ?1`,
  )
    .bind(player.id)
    .first<{id: string; rank: string}>();

  // The rendezvous point rides along with the map rather than being polled on
  // its own. It changes when an officer moves it, which is exactly as often as
  // the map is already being refreshed, so a second endpoint would be a second
  // request for the same information.
  // Any march that has landed is fought now, by whoever looked first. Nothing
  // ticks in the background, so a raid that arrives at three in the morning
  // still lands correctly - it simply lands the next time anybody reads.
  await settleArrivals(env.DB, world.id, now, newId);

  const [rallyPoint, ralliedAt, marches, away, viewerLevels] = await Promise.all([
    ownAlliance ? ensureRally(env.DB, ownAlliance.id, world.id, now) : Promise.resolve(null),
    lastRalliedAt(env.DB, world.id, player.id),
    pendingMarches(env.DB, world.id),
    // Read after settling, so a squad that just landed is not still listed as
    // in the air on the one panel that is supposed to say where it is.
    deployments(env.DB, player.id, now),
    // The viewer's Signals Center decides how early other people's marches show.
    readLevels(env.DB, player.id),
  ]);

  // Today's daily map exercises, spawned on the first look after 00:00 RST.
  // Personal: read for the viewer only, on their home world only.
  const exercises =
    world.kind === 'home' && self
      ? (await ensureExercises(env.DB, player.id, world.id, self, world.extent, await marchingSquads(env.DB, player.id), now))
          .map((r) => viewOf(r, seasonPhase(now).week))
          .filter((v): v is NonNullable<typeof v> => v !== null)
      : [];

  return json({
    viewport: {x, y, w, h},
    world: {
      id: world.id,
      name: world.name,
      kind: world.kind,
      extent: world.extent,
      closesAt: world.closes_at,
    },
    worlds: worlds.map((entry) => ({id: entry.id, name: entry.name, kind: entry.kind})),
    you: {
      username: player.username,
      plot: self ?? null,
      // Everything the client needs to colour a base by allegiance.
      homeWorldId: home?.id ?? null,
      allianceId: ownAlliance?.id ?? null,
      rank: ownAlliance?.rank ?? null,
      maySetRally: maySetRally(ownAlliance?.rank),
      rallyCooldownMs: rallyCooldownLeft(ralliedAt, now),
      // Where your squads are. Rides along with the map because it changes
      // exactly when the map does, and a second endpoint would be a second
      // request for the same answer.
      deployments: away,
    },
    // Null when the player has no alliance, or nobody has planted one. Only
    // shown on the world it was planted in - a marker in your home world is
    // not a place you can walk to from an event map.
    rally: rallyPoint && rallyPoint.worldId === world.id ? rallyPoint : null,
    // Everything in transit. Drawn on the map, so a defender sees what is
    // coming - which is the whole reason marching exists rather than an
    // attack being a button that resolves instantly.
    marches: marches
      // Your own marches are always yours to see. Anyone else's shows only
      // once it is within your Signals Center's lead time of landing -
      // BUILDING EFFECTS v1: visibleAt = max(sentAt, arrivalAt - lead).
      .filter((m) => m.attacker_id === player.id || m.arrives_at - signalsLeadMs(viewerLevels.signals_center) <= now)
      // An exercise column is personal, like its target: nobody else sees a
      // Task Force walking to an empty plot. The return leg is a return leg.
      .filter((m) => m.kind !== 'exercise' || m.attacker_id === player.id)
      .map((m) => ({
      id: m.id,
      attacker: m.attacker,
      defender: m.defender,
      squad: m.squad,
      from: {x: m.from_x, y: m.from_y},
      to: {x: m.to_x, y: m.to_y},
      departedAt: m.departed_at,
      arrivesAt: m.arrives_at,
      mine: m.attacker_id === player.id,
      incoming: m.defender_id === player.id,
      kind: m.kind,
    })),
    skins: SKINS,
    exercises,
    // Launched Alliance Convoys crossing this world, drawn as moving
    // formations. Cosmetic and unattackable in Season 1.
    convoys: await worldConvoys(env.DB, world.id, now),
    // A shield shows on the map only while it is up; the instant itself is
    // public, since the popup says how long is left.
    // `contract` marks a Dominion outpost a solo commander may take a neutral
    // contract against (Daily Operations, Cooperation lane). Only offered to
    // players with no alliance - members reinforce instead - and the role
    // itself is not sent.
    bases: bases.map(({role, ...b}) => ({
      ...b,
      shieldUntil: isShielded(b.shieldUntil, now) ? b.shieldUntil : null,
      contract: !ownAlliance && role === FARM_ROLE,
    })),
    // The map refetches on every camera settle, which makes it the most
    // frequent corrector of the client's clock offset. Everything with a
    // countdown on it is drawn against this rather than against the device.
    serverTime: now,
  });
}

/**
 * Move to a chosen plot.
 *
 * The plot is claimed by writing it, not by checking it first: two players
 * pressing Move on the same square in the same instant would both see it free,
 * and only the unique index can decide between them. The loser is asked to
 * pick again rather than being silently dumped somewhere else.
 */
async function handleMove(request: Request, env: Env, player: PlayerRow): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const x = Number(body?.x);
  const y = Number(body?.y);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return fail(400, 'Pick a plot on the map.');

  const now = Date.now();
  const worlds = await reachableWorlds(env.DB, player.id, now);
  if (worlds.length === 0) return fail(409, 'You have not been deployed yet.');

  const requested = body?.worldId;
  const world =
    requested === undefined
      ? (worlds.find((entry) => entry.kind === 'home') ?? worlds[0])
      : worlds.find((entry) => entry.id === Number(requested));
  if (!world) return fail(403, 'That world is not open to you.');

  if (Math.abs(x) > world.extent || Math.abs(y) > world.extent) {
    return fail(400, 'That is beyond the edge of the map.');
  }

  // Moving is instant, and a squad in transit is aimed at where you ARE. Allow
  // both and an attacker sends a squad, sees the counter-attack coming, and
  // relocates - the raid lands on empty ground and the defender has wasted the
  // one squad they committed. Attacking has to pin you as well as thin you.
  const away = await marchingSquads(env.DB, player.id);
  if (away.size > 0) {
    return fail(409, 'You cannot move while a squad is out.');
  }

  const moved = await tryPlace(env.DB, world.id, player.id, x, y, now);
  if (!moved) return fail(409, 'Another base already holds that ground.');

  return json({world: {id: world.id, name: world.name}, plot: {x, y}});
}

/**
 * Plant, move or clear the alliance's rendezvous point.
 *
 * Rank is read from the database on every call, never taken from the request.
 * A soldier who edits the button back into existence in their own browser
 * still cannot set a marker, because the browser is not what is asked.
 */
async function handleSetRally(request: Request, env: Env, player: PlayerRow): Promise<Response> {
  const membership = await membershipOf(env.DB, player.id);
  if (!membership) return fail(409, 'You are not in an alliance.');
  if (!maySetRally(membership.rank)) {
    return fail(403, 'Only a General or Lieutenant can set the rendezvous.');
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const now = Date.now();

  // There is no clearing a rendezvous, only moving it. An alliance always has
  // one, so the button on the map always points somewhere.
  const x = Number(body?.x);
  const y = Number(body?.y);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return fail(400, 'Pick a plot on the map.');

  const worlds = await reachableWorlds(env.DB, player.id, now);
  const requested = body?.worldId;
  const world =
    requested === undefined
      ? (worlds.find((entry) => entry.kind === 'home') ?? worlds[0])
      : worlds.find((entry) => entry.id === Number(requested));
  if (!world) return fail(403, 'That world is not open to you.');
  if (Math.abs(x) > world.extent || Math.abs(y) > world.extent) {
    return fail(400, 'That is beyond the edge of the map.');
  }

  await setRally(env.DB, membership.alliance.id, player.id, world.id, x, y, now);
  return json({rally: await readRally(env.DB, membership.alliance.id)});
}

/**
 * Answer the rendezvous: move to the nearest free plot beside the marker.
 *
 * The destination is chosen here and never sent by the client. Letting the
 * browser name the plot would turn RV into an unlimited teleport to anywhere
 * on the map with an alliance marker as its excuse.
 */
async function handleRally(env: Env, player: PlayerRow): Promise<Response> {
  const membership = await membershipOf(env.DB, player.id);
  if (!membership) return fail(409, 'You are not in an alliance.');

  const now = Date.now();
  const worlds = await reachableWorlds(env.DB, player.id, now);
  const home = worlds.find((entry) => entry.kind === 'home') ?? worlds[0];

  const point = home
    ? await ensureRally(env.DB, membership.alliance.id, home.id, now)
    : await readRally(env.DB, membership.alliance.id);
  if (!point) return fail(404, 'Your alliance has nowhere to rally to yet.');

  const world = worlds.find((entry) => entry.id === point.worldId);
  if (!world) return fail(403, 'That rendezvous is in a world you cannot reach.');

  const result = await rallyTo(env.DB, world.id, world.extent, player.id, point, now);
  if (!result.ok) {
    if (result.reason === 'cooldown') {
      const minutes = Math.ceil(result.waitMs / 60000);
      return fail(429, `You can rally again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
    }
    if (result.reason === 'edge') return fail(409, 'That rendezvous sits off the edge of the map.');
    return fail(409, 'No open ground near the rendezvous.');
  }

  return json({
    world: {id: world.id, name: world.name},
    plot: {x: result.x, y: result.y},
    cooldownMs: RALLY_COOLDOWN_MS,
  });
}

/** Battle reports, newest first. Empty until combat exists and writes some. */
async function handleBattles(request: Request, env: Env, player: PlayerRow): Promise<Response> {
  const url = new URL(request.url);
  const scope = url.searchParams.get('scope') === 'alliance' ? 'alliance' : 'mine';
  const beforeRaw = Number.parseInt(url.searchParams.get('before') ?? '', 10);
  const before = Number.isFinite(beforeRaw) ? beforeRaw : null;

  const membership = await membershipOf(env.DB, player.id);
  const battles = await listBattles(
    env.DB,
    player.id,
    membership?.alliance.id ?? null,
    scope,
    before,
  );
  return json({scope, battles, retentionDays: REPORT_RETENTION_DAYS});
}

/** One report in full. Access is decided by the participants table, not by the client. */
async function handleBattle(request: Request, env: Env, player: PlayerRow): Promise<Response> {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return fail(400, 'Which battle?');

  const membership = await membershipOf(env.DB, player.id);
  const report = await readBattle(env.DB, player.id, membership?.alliance.id ?? null, id);
  if (!report) return fail(404, 'No such battle report.');
  return json(report);
}

/**
 * Is translation actually working?
 *
 * Owner only. This exists because translation fails invisibly: a message that
 * was never translated looks exactly like a message that did not need
 * translating, so two separate causes were guessed at from the same symptom.
 * This turns "it didn't translate" into an answer.
 *
 * It reports each link in the chain separately - whether the binding is even
 * present on this deploy, what the model returned verbatim, and how the parser
 * read it - because those fail for completely different reasons and only the
 * first one is fixed by editing code.
 */
async function handleAiCheck(request: Request, env: Env, player: PlayerRow): Promise<Response> {
  if (player.role !== 'owner') return fail(404, 'No such endpoint.');

  const url = new URL(request.url);
  const text = url.searchParams.get('text') ?? 'Hola, vamos a atacar al amanecer.';
  // 'from' is only the offline guess here; the classifier below overrides it,
  // which is the whole point of running both.
  const from = url.searchParams.get('from') ?? detectLanguage(text, 'en');
  const to = url.searchParams.get('to') ?? 'en';

  if (!env.AI) {
    return json({
      bound: false,
      detected: from,
      problem:
        'The AI binding is not present on this deploy. Check the "ai" block in ' +
        'wrangler.jsonc, that Workers AI is enabled on the account, and that ' +
        'this Worker was deployed after the binding was added.',
    });
  }

  const started = Date.now();
  try {
    // Both models, because they fail independently and the symptom is the
    // same either way: the classifier deciding a Spanish message is English is
    // indistinguishable, from the outside, from the translator being down.
    const classifierRaw = await env.AI.run(CLASSIFIER_MODEL, {
      messages: [
        {
          role: 'system',
          content:
            'You identify what language a short chat message is written in. ' +
            'Answer with exactly one ISO 639-1 code from this list and nothing ' +
            `else: ${LANGUAGE_CODES.join(', ')}. No explanation, no punctuation.`,
        },
        {role: 'user', content: text},
      ],
      max_tokens: 4,
      temperature: 0,
    });
    const classifierText = readGenerated(classifierRaw);
    const classified = classifierText?.toLowerCase().match(/[a-z]{2}/)?.[0] ?? null;
    const source = classified && LANGUAGE_CODES.includes(classified) ? classified : from;

    const raw = await env.AI.run(TRANSLATION_MODEL, {
      text,
      source_lang: source,
      target_lang: to,
    });
    return json({
      bound: true,
      classifier: {
        model: CLASSIFIER_MODEL,
        said: classifierText,
        parsed: classified,
      },
      translator: {model: TRANSLATION_MODEL},
      sent: {text, source_lang: source, target_lang: to},
      guessedWithoutModel: from,
      wouldTranslate: source !== to,
      tookMs: Date.now() - started,
      // Verbatim, so a changed field name is visible rather than inferred.
      raw,
      parsed: readTranslation(raw),
    });
  } catch (error) {
    return json({
      bound: true,
      model: TRANSLATION_MODEL,
      sent: {text, source_lang: from, target_lang: to},
      tookMs: Date.now() - started,
      threw: error instanceof Error ? error.message : String(error),
      note: 'One of the two model calls failed. The message names which.',
    });
  }
}

/**
 * Who can be named in this channel.
 *
 * The autocomplete list. It is the same query the send path checks a mention
 * against, on purpose: two lists would drift, and the drift would show up as
 * somebody being notified about a channel they cannot open.
 */
async function handleMentionable(
  request: Request,
  env: Env,
  player: PlayerRow,
): Promise<Response> {
  const channel = new URL(request.url).searchParams.get('channel');
  if (!channel) return fail(400, 'Which channel?');

  const viewer = await chatViewer(env, player);
  const access = resolveAccess(channel, viewer);
  if (!access.ok) return fail(403, access.error);

  const people = await mentionableIn(env.DB, channel, viewer);
  // Only the names. Player ids are the server's business, and the client needs
  // nothing but a string to complete.
  return json({channel, names: people.map((p) => p.username)});
}

/** Mentions this player has not looked at, newest first. */
async function handleMentions(env: Env, player: PlayerRow): Promise<Response> {
  return json({mentions: await pendingMentions(env.DB, player.id)});
}

/**
 * The roster and the four squads.
 *
 * Lift budgets come from the base's own buildings, so this reads base state
 * rather than taking a number from the client. Sending the budget down is
 * fine; believing one that comes back up is not.
 */
async function handleSquads(env: Env, player: PlayerRow): Promise<Response> {
  const now = Date.now();
  const state = await settleAndLoad(env, player.id, now);
  if (!state) return fail(404, 'No base found.');

  // Finished repairs first, so the roster shows whole what is whole.
  await settleRepairs(env.DB, player.id, now);
  const [owned, board, away, base] = await Promise.all([
    ensureRoster(env.DB, player.id, now),
    readSquads(env.DB, player.id),
    marchingSquads(env.DB, player.id),
    readBase(env.DB, player.id, now),
  ]);

  const roster = new Map(owned.map((o) => [o.assetId, o]));
  const [wallet, systems] = await Promise.all([
    settleWallet(env.DB, player.id, now),
    readSystems(env.DB, player.id),
  ]);

  return json({
    owned,
    // Every Task Force's Combat Systems lanes, for the cards on the same screen.
    systems,
    // The wallet rides along with the roster because the upgrade buttons are on
    // the roster screen, and a second request for two numbers already in hand
    // is a second request for nothing.
    wallet: {tokens: wallet.tokens, credits: wallet.credits},
    squads: board,
    power: Object.fromEntries(
      SQUAD_NAMES.map((name) => [name, squadPower(board, roster, name, base.levels)]),
    ),
    // The Command Center and asset-building levels, so every asset card can
    // draw the attributes the building boost gives without a second request.
    base: {...baseLevelsView(base, env), season: CURRENT_SEASON, wallet: {tokens: wallet.tokens, credits: wallet.credits}},
    season1: await readSeasonState(env.DB, player.id, now),
    deltaOpen: await deltaOpen(env.DB, player.id, base.levels.command_center, now),
    // Echoed so the squad screen can show them without asking for the base
    // separately. They no longer affect what fits in a squad.
    buildings: {
      motor_pool: state.levels.motor_pool,
      airfield: state.levels.airfield,
      barracks: state.levels.barracks,
    },
    // Squads in the field. Sent so the screen can lock them rather than
    // letting a player make a change that the server is going to refuse.
    away: [...away],
  });
}


/* -------------------------------------------------------------------------- */
/* Upgrades                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The payment split, if the client chose one.
 *
 * Absent means "spend Credits first", which is the default the server applies.
 * A malformed split is rejected rather than silently corrected: a player who
 * meant to pay in Credits and was quietly charged in Tokens has been robbed as
 * far as they are concerned, and being wrong loudly is much cheaper.
 */
function readSplit(body: Record<string, unknown> | null): Split | null | 'bad' {
  const raw = body?.split;
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'object') return 'bad';
  const s = raw as Record<string, unknown>;
  const tokens = Number(s.tokens);
  const credits = Number(s.credits);
  if (!Number.isInteger(tokens) || !Number.isInteger(credits)) return 'bad';
  if (tokens < 0 || credits < 0) return 'bad';
  return {tokens, credits};
}

/** Which season's cap applies. One place, so nothing reads it off a request. */
const CURRENT_SEASON = 1;

/** A building's player-facing name, for server messages. */
function buildingName(b: LevelledBuilding): string {
  return b === 'command_center' ? 'Command Center' : BOARD_BUILDING_BY_ID[b]?.name ?? b;
}

/**
 * The balance profile this server prices building upgrades from. Read per
 * request from the environment, so there is one place that decides it.
 */
function balanceFor(env: Env) {
  return selectBalanceProfile(env.WWR_BALANCE_PROFILE);
}

/** The base's levelled state as the client reads it. */
function baseLevelsView(base: Awaited<ReturnType<typeof readBase>>, env: Env) {
  const balance = balanceFor(env);
  return {
    // Which profile priced the timers on screen, so the client shows the same
    // numbers and a tester can see what is live. Null when misconfigured.
    balance: balance.ok ? balanceRef(balance.profile) : null,
    levels: base.levels,
    jobs: base.jobs,
    queues: base.queues,
    secondTeamAt: base.secondTeamAt,
    resources: base.resources,
    productionPerHour: base.productionPerHour,
    storageCap: base.storageCap,
  };
}

async function handleRankUp(
  request: Request,
  env: Env,
  player: PlayerRow,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const assetId = typeof body?.assetId === 'string' ? body.assetId : '';
  const target = Number(body?.target);
  const split = readSplit(body);
  if (split === 'bad') return fail(400, 'That payment does not make sense.');

  const base = await readBase(env.DB, player.id, Date.now());
  const result = await rankUp(
    env.DB,
    player.id,
    assetId,
    target,
    split,
    CURRENT_SEASON,
    Date.now(),
    rankCeiling(base.levels),
  );
  if (!result.ok) return fail(400, result.error);
  await noteDailyProgress(env.DB, player.id, 'readiness', Date.now()).catch(() => undefined);
  return json({
    ok: true,
    wallet: {tokens: result.wallet.tokens, credits: result.wallet.credits},
    asset: result.asset,
  });
}

async function handlePackageUp(
  request: Request,
  env: Env,
  player: PlayerRow,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const assetId = typeof body?.assetId === 'string' ? body.assetId : '';
  const target = Number(body?.target);
  const key = body?.package;
  if (!isPackageKey(key)) return fail(400, 'No such package.');
  const split = readSplit(body);
  if (split === 'bad') return fail(400, 'That payment does not make sense.');

  const result = await packageUp(env.DB, player.id, assetId, key, target, split, Date.now());
  if (!result.ok) return fail(400, result.error);
  await noteDailyProgress(env.DB, player.id, 'readiness', Date.now()).catch(() => undefined);
  return json({
    ok: true,
    wallet: {tokens: result.wallet.tokens, credits: result.wallet.credits},
    asset: result.asset,
  });
}

/**
 * Raise one Combat Systems lane of one Task Force. Same shape as a rank-up:
 * the cap is the season's and the Command Center's, read here, never from
 * the request.
 */
async function handleSystemUp(request: Request, env: Env, player: PlayerRow): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const squad = typeof body?.squad === 'string' ? body.squad : '';
  const lane = body?.lane;
  if (!isCombatSystemLane(lane)) return fail(400, 'No such Combat System.');
  const target = Number(body?.target);
  const split = readSplit(body);
  if (split === 'bad') return fail(400, 'That payment does not make sense.');

  const base = await readBase(env.DB, player.id, Date.now());
  const result = await systemUp(
    env.DB,
    player.id,
    squad,
    lane,
    target,
    split,
    CURRENT_SEASON,
    Date.now(),
    rankCeiling(base.levels),
  );
  if (!result.ok) return fail(400, result.error);
  await noteDailyProgress(env.DB, player.id, 'readiness', Date.now()).catch(() => undefined);
  return json({
    ok: true,
    wallet: {tokens: result.wallet.tokens, credits: result.wallet.credits},
    systems: result.systems,
  });
}

async function handlePackageReset(
  request: Request,
  env: Env,
  player: PlayerRow,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const assetId = typeof body?.assetId === 'string' ? body.assetId : '';

  const result = await resetPackages(env.DB, player.id, assetId, Date.now());
  if (!result.ok) return fail(400, result.error);
  return json({
    ok: true,
    wallet: {tokens: result.wallet.tokens, credits: result.wallet.credits},
    asset: result.asset,
  });
}

/**
 * Send a squad at somebody.
 *
 * The target is a plot, not a player id: you attack what is standing on a
 * square, and who that is gets read here. A client naming the defender could
 * name anyone.
 */
async function handleAttack(request: Request, env: Env, player: PlayerRow): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const squad = body?.squad;
  const x = Number(body?.x);
  const y = Number(body?.y);
  const contract = body?.contract === true;
  if (!isSquadName(squad)) return fail(400, 'No such squad.');
  if (!Number.isInteger(x) || !Number.isInteger(y)) return fail(400, 'Pick a plot on the map.');

  const now = Date.now();
  const worlds = await reachableWorlds(env.DB, player.id, now);
  const world = worlds.find((entry) => entry.kind === 'home') ?? worlds[0];
  if (!world) return fail(409, 'You have not been deployed yet.');

  const [mine, target] = await Promise.all([
    env.DB.prepare(
      `SELECT plot_x AS x, plot_y AS y FROM placements WHERE world_id = ?1 AND player_id = ?2`,
    )
      .bind(world.id, player.id)
      .first<{x: number; y: number}>(),
    env.DB.prepare(
      `SELECT pl.player_id AS id, p.role AS role FROM placements pl JOIN players p ON p.id = pl.player_id
        WHERE pl.world_id = ?1 AND pl.plot_x = ?2 AND pl.plot_y = ?3`,
    )
      .bind(world.id, x, y)
      .first<{id: string; role: string}>(),
  ]);

  if (!mine) return fail(409, 'You are not standing anywhere yet.');
  if (!target) return fail(404, 'Nobody is there.');

  // Test bots on the live server never attack a person. The harness enforces
  // it too, but the server is the one that has to be right.
  if (player.role === TEST_ROLE && env.TEST_BOTS_MAY_ATTACK !== 'on') {
    return fail(403, 'Test accounts may not attack on this server.');
  }

  // An alliance is the one place where the answer has to be no rather than
  // "yes, but you shouldn't". The same march becomes a reinforcement: it takes
  // the same time and everybody watches it, but on arrival it joins their
  // defence instead of fighting it.
  const [mineAlliance, theirs] = await Promise.all([
    env.DB.prepare(`SELECT alliance_id AS id FROM alliance_members WHERE player_id = ?1`)
      .bind(player.id)
      .first<{id: string}>(),
    env.DB.prepare(`SELECT alliance_id AS id FROM alliance_members WHERE player_id = ?1`)
      .bind(target.id)
      .first<{id: string}>(),
  ]);
  const allied = !!mineAlliance && mineAlliance.id === theirs?.id;

  // A neutral contract is the solo commander's Cooperation route: an attack on
  // a Dominion outpost (farm bot) by somebody with no alliance to reinforce.
  // Anyone in an alliance has allies to stand with instead, and a contract
  // against a real player is just an attack.
  if (contract) {
    if (mineAlliance) return fail(409, 'Contracts are for commanders without an alliance. Reinforce an ally instead.');
    if (target.role !== FARM_ROLE) return fail(409, 'Contracts are only issued against Dominion outposts.');
  }

  const result = await launch(
    env.DB,
    world.id,
    player.id,
    squad,
    target.id,
    mine,
    {x, y},
    now,
    newId,
    allied ? 'reinforce' : 'attack',
    contract && !allied,
  );
  if (!result.ok) return fail(409, result.error);

  // Daily Operations. One action, one lane: a reinforcement is Cooperation
  // the moment it leaves; an attack is Mobilization now and Engagement (or,
  // for a contract, Cooperation) when the battle resolves.
  await noteDailyProgress(env.DB, player.id, allied ? 'cooperation' : 'mobilization', now).catch(() => undefined);
  // Warfront: a reinforcement is Support Score the moment it leaves.
  if (allied) await noteWarfront(env.DB, player.id, 'reinforce', `reinforce:${player.id}:${now}`, 'Reinforced an ally', now).catch(() => undefined);

  return json({
    arrivesAt: result.arrivesAt,
    seconds: result.seconds,
    kind: allied ? 'reinforce' : 'attack',
  });
}

/**
 * Bring a squad home.
 *
 * The whole decision is server-side: which march the squad is on, where it has
 * got to, and how long the way back takes. The client sends a squad name.
 */
async function handleRecall(request: Request, env: Env, player: PlayerRow): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const squad = body?.squad;
  if (!isSquadName(squad)) return fail(400, 'No such squad.');

  const result = await recall(env.DB, player.id, squad, Date.now(), newId);
  if (!result.ok) return fail(409, result.error);
  return json({arrivesAt: result.arrivesAt});
}

/** Drag one slot onto another: move, or swap with whatever is already there. */
async function handleMove2(request: Request, env: Env, player: PlayerRow): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const from = body?.from as {squad?: unknown; slot?: unknown} | undefined;
  const to = body?.to as {squad?: unknown; slot?: unknown} | undefined;

  if (!isSquadName(from?.squad) || !isSquadName(to?.squad)) return fail(400, 'No such squad.');
  if (!Number.isInteger(Number(from?.slot)) || !Number.isInteger(Number(to?.slot))) {
    return fail(400, 'No such slot.');
  }

  const now = Date.now();
  const state = await settleAndLoad(env, player.id, now);
  if (!state) return fail(404, 'No base found.');
  await ensureRoster(env.DB, player.id, now);

  const result = await moveSlot(
    env.DB,
    player.id,
    {squad: from.squad, slot: Number(from.slot)},
    {squad: to.squad, slot: Number(to.slot)},
    await marchingSquads(env.DB, player.id),
    state.baseLevel,
  );
  if (!result.ok) return fail(409, result.error);
  // Daily Operations, Mobilization lane: a real formation change.
  await noteDailyProgress(env.DB, player.id, 'mobilization', now).catch(() => undefined);
  return handleSquads(env, player);
}

/** Put an asset in a slot, move it there from another squad, or clear a slot. */
async function handleAssign(request: Request, env: Env, player: PlayerRow): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const squad = body?.squad;
  const slot = Number(body?.slot);
  const assetId = body?.assetId;

  if (!isSquadName(squad)) return fail(400, 'No such squad.');
  if (!Number.isInteger(slot)) return fail(400, 'No such slot.');
  if (assetId !== null && typeof assetId !== 'string') return fail(400, 'No such asset.');

  const now = Date.now();
  const state = await settleAndLoad(env, player.id, now);
  if (!state) return fail(404, 'No base found.');
  await ensureRoster(env.DB, player.id, now);

  const result = await assignSlot(
    env.DB,
    player.id,
    squad,
    slot,
    assetId,
    await marchingSquads(env.DB, player.id),
    state.baseLevel,
  );
  if (!result.ok) return fail(409, result.error);
  // Daily Operations, Mobilization lane: a slot filled, moved or cleared.
  await noteDailyProgress(env.DB, player.id, 'mobilization', now).catch(() => undefined);

  return handleSquads(env, player);
}

/**
 * Detailed error text is returned while the backend is being brought up, so a
 * failure is diagnosable from the client instead of arriving as an opaque
 * "Worker threw exception" page. Set DEBUG_ERRORS to "off" once real players
 * exist - internal messages should not be public then.
 */
function serverError(error: unknown, env: Env): Response {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error('Unhandled API error:', detail);
  const expose = (env.DEBUG_ERRORS ?? 'on') !== 'off';
  return json({error: expose ? detail : 'Something went wrong on the server.'}, {status: 500});
}

/**
 * The catalogue, what this player owns, and what their base is wearing.
 *
 * Everything is sent in one response because the customisation screen needs
 * all three to draw a single row, and three round trips to render one screen
 * is three chances to show a half-built page.
 */
async function handleCosmetics(env: Env, player: PlayerRow): Promise<Response> {
  const [owned, base] = await Promise.all([
    ownedItemIds(env.DB, player.id),
    env.DB.prepare(`SELECT skin, banner, emblem, lights, decal FROM bases WHERE player_id = ?1`)
      .bind(player.id)
      .first<Record<string, string>>(),
  ]);

  // The base skin is not a cosmetic item, but ownership of a premium one is
  // recorded in the same table keyed by the skin id. That way there is exactly
  // one place to look to answer "may this player wear this", and granting a
  // skin and granting a banner are the same operation.
  const skinsOwned = ALL_SKINS_UNLOCKED
    ? [...SKIN_IDS]
    : SKIN_IDS.filter((id) => STARTER_SKIN_IDS.includes(id) || owned.has(id));

  return json({
    slots: COSMETIC_SLOTS,
    items: COSMETICS,
    owned: [...owned],
    loadout: normaliseLoadout(base ?? {}),
    skins: SKINS,
    skinIds: SKIN_IDS,
    skinsOwned,
    skin: base?.skin ?? STARTER_SKIN_IDS[0],
  });
}

/**
 * Equips a loadout.
 *
 * Ownership is checked here and only here. The client can preview anything it
 * likes - that is what makes a store worth browsing - but what the rest of the
 * map sees is whatever this function was willing to write.
 */
async function handleEquip(request: Request, env: Env, player: PlayerRow): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return fail(400, 'Nothing to equip.');

  const owned = await ownedItemIds(env.DB, player.id);
  const result = checkLoadout(body, owned);
  if ('rejected' in result) {
    return fail(
      result.rejected.reason === 'unknown' ? 400 : 403,
      result.rejected.reason === 'unknown'
        ? 'That item does not exist.'
        : 'You do not own that item yet.',
    );
  }

  // The base skin travels with the loadout because a player changes both on
  // the same screen, and saving them separately would let a half-applied look
  // exist if the second request failed.
  const current = await env.DB.prepare(`SELECT skin FROM bases WHERE player_id = ?1`)
    .bind(player.id)
    .first<{skin: string}>();
  let skin = current?.skin ?? STARTER_SKIN_IDS[0];

  if (body.skin !== undefined && body.skin !== null) {
    if (!isSkinId(body.skin)) return fail(400, 'That base skin does not exist.');
    if (
      !ALL_SKINS_UNLOCKED &&
      !STARTER_SKIN_IDS.includes(body.skin) &&
      !owned.has(body.skin)
    ) {
      return fail(403, 'You do not own that base skin yet.');
    }
    skin = body.skin;
  }

  const {loadout} = result;
  const changed = await env.DB.prepare(
    `UPDATE bases SET skin = ?2, banner = ?3, emblem = ?4, lights = ?5, decal = ?6
      WHERE player_id = ?1`,
  )
    .bind(player.id, skin, loadout.banner, loadout.emblem, loadout.lights, loadout.decal)
    .run();

  if (!changed.success) return fail(500, 'Could not save that loadout.');
  return json({loadout, skin});
}

/**
 * Anyone's profile, by callsign.
 *
 * Signed-in players only - not because the contents are sensitive, but because
 * an open endpoint that enumerates players by name is a list of accounts to
 * try passwords against, and there is no reason to publish one.
 */
async function handleProfile(request: Request, env: Env): Promise<Response> {
  const name = new URL(request.url).searchParams.get('name');
  if (!name) return fail(400, 'Which player?');
  const profile = await loadProfile(env.DB, name);
  if (!profile) return fail(404, 'No such callsign.');
  return json({profile});
}

/** Edits your own, and only your own. */
async function handleEditProfile(
  request: Request,
  env: Env,
  player: PlayerRow,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as ProfileEdit | null;
  if (!body) return fail(400, 'Nothing to save.');

  const result = validateEdit(body);
  if (!result.ok) return fail(400, result.error);

  // A null language means the edit did not include one, so the existing choice
  // is kept rather than being reset to a default nobody picked.
  await env.DB.prepare(
    `UPDATE players SET portrait_glyph = ?2, portrait_tint = ?3, motto = ?4,
            locale = COALESCE(?5, locale)
      WHERE id = ?1`,
  )
    .bind(player.id, result.glyph, result.tint, result.motto, result.language)
    .run();

  const profile = await loadProfile(env.DB, player.username);
  return json({profile});
}

/**
 * Sets or removes your own portrait.
 *
 * Separate from the profile edit because the payload is tens of kilobytes and
 * the rest of a profile edit is a few dozen bytes. Sending them together would
 * mean re-uploading a photograph every time somebody changed their motto.
 */
async function handlePortrait(
  request: Request,
  env: Env,
  player: PlayerRow,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {image?: unknown} | null;
  if (!body) return fail(400, 'Nothing received.');

  if (body.image === null) {
    await clearPortrait(env.DB, player.id);
    const cleared = await loadProfile(env.DB, player.username);
    return json({profile: cleared});
  }

  const result = validatePortrait(body.image);
  if (!result.ok) return fail(400, result.error);

  await savePortrait(env.DB, player.id, result, Date.now());
  const profile = await loadProfile(env.DB, player.username);
  return json({profile});
}

/**
 * Your alliance, its roster, and the applications waiting on it.
 *
 * Applications are only included for officers and above. A member seeing the
 * queue would be harmless; a member seeing it and being unable to act on it is
 * a screen that invites a click it will then refuse.
 */
async function handleAlliance(env: Env, player: PlayerRow): Promise<Response> {
  const membership = await membershipOf(env.DB, player.id);
  if (!membership) {
    const pending = await env.DB.prepare(
      `SELECT a.tag AS tag, a.name AS name
         FROM alliance_applications ap
         JOIN alliances a ON a.id = ap.alliance_id
        WHERE ap.player_id = ?1`,
    )
      .bind(player.id)
      .all<{tag: string; name: string}>();
    return json({alliance: null, applied: pending.results ?? []});
  }

  const {alliance, rank} = membership;
  const roster = await rosterOf(env.DB, alliance.id);

  let applications: Array<{username: string; power: number; createdAt: number}> = [];
  if (rank === 'leader' || rank === 'officer') {
    const rows = await env.DB.prepare(
      `SELECT p.username AS username, ap.created_at AS created_at
         FROM alliance_applications ap
         JOIN players p ON p.id = ap.player_id
        WHERE ap.alliance_id = ?1
        ORDER BY ap.created_at ASC`,
    )
      .bind(alliance.id)
      .all<{username: string; created_at: number}>();
    applications = (rows.results ?? []).map((r) => ({
      username: r.username,
      power: 0,
      createdAt: r.created_at,
    }));
  }

  return json({
    alliance: {
      id: alliance.id,
      tag: alliance.tag,
      name: alliance.name,
      description: alliance.description,
      homeWorldId: alliance.home_world_id,
      openJoin: alliance.open_join === 1,
      createdAt: alliance.created_at,
      capacity: ALLIANCE_CAPACITY,
      emblemTint: alliance.emblem_tint,
      hasCrest: alliance.has_crest === 1,
    },
    rank,
    roster,
    applications,
  });
}

/**
 * Every alliance on this player's home server.
 *
 * Carries the four things somebody actually decides on: how strong it is, who
 * runs it, how full it is, and whether they can walk in. A list of names and
 * member counts makes every alliance look the same, which is the one thing a
 * join screen must not do.
 *
 * Power is summed in TypeScript from raw building levels rather than computed
 * in SQL. Doing the arithmetic in the query would be faster and would create a
 * second definition of power that drifts from the one on the profile - and two
 * numbers that disagree about the same alliance is worse than one query.
 */
async function handleBrowseAlliances(env: Env, player: PlayerRow): Promise<Response> {
  const home = await env.DB.prepare(`SELECT home_world_id AS id FROM bases WHERE player_id = ?1`)
    .bind(player.id)
    .first<{id: number | null}>();
  if (!home?.id) return fail(409, 'You have not been deployed yet.');

  const [list, levels] = await Promise.all([
    env.DB.prepare(
      `SELECT a.id AS id, a.tag AS tag, a.name AS name, a.description AS description,
              a.open_join AS open_join, a.emblem_tint AS emblem_tint,
              (CASE WHEN ap.alliance_id IS NULL THEN 0 ELSE 1 END) AS has_crest,
              COUNT(m.player_id) AS members,
              (SELECT p.username
                 FROM alliance_members lm
                 JOIN players p ON p.id = lm.player_id
                WHERE lm.alliance_id = a.id AND lm.rank = 'leader'
                LIMIT 1) AS leader
         FROM alliances a
         LEFT JOIN alliance_members m ON m.alliance_id = a.id
         LEFT JOIN alliance_portraits ap ON ap.alliance_id = a.id
        WHERE a.home_world_id = ?1
        GROUP BY a.id
        LIMIT 100`,
    )
      .bind(home.id)
      .all<{
        id: string;
        tag: string;
        name: string;
        description: string | null;
        open_join: number;
        members: number;
        leader: string | null;
        emblem_tint: string;
        has_crest: number;
      }>(),
    env.DB.prepare(
      `SELECT m.alliance_id AS aid, m.player_id AS pid
         FROM alliance_members m
         JOIN alliances a ON a.id = m.alliance_id
        WHERE a.home_world_id = ?1`,
    )
      .bind(home.id)
      .all<{aid: string; pid: string}>(),
  ]);

  // Power per player (assets held), summed per alliance.
  const memberRows = levels.results ?? [];
  const powers = await powerOf(
    env.DB,
    memberRows.map((r) => r.pid),
  );
  const powerByAlliance = new Map<string, number>();
  for (const {aid, pid} of memberRows) {
    powerByAlliance.set(aid, (powerByAlliance.get(aid) ?? 0) + (powers.get(pid)?.power ?? 0));
  }

  const alliances = (list.results ?? [])
    .map((r) => ({
      id: r.id,
      tag: r.tag,
      name: r.name,
      description: r.description,
      openJoin: r.open_join === 1,
      members: r.members,
      leader: r.leader,
      power: powerByAlliance.get(r.id) ?? 0,
      emblemTint: r.emblem_tint,
      hasCrest: r.has_crest === 1,
    }))
    // Strongest first. Somebody browsing is looking for the alliance worth
    // joining, and that is the order that answers it.
    .sort((a, b) => b.power - a.power || b.members - a.members);

  return json({homeWorldId: home.id, capacity: ALLIANCE_CAPACITY, alliances});
}

/** Founds an alliance. The founder becomes its leader. */
async function handleCreateAlliance(
  request: Request,
  env: Env,
  player: PlayerRow,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return fail(400, 'Nothing to create.');

  const existing = await membershipOf(env.DB, player.id);
  if (existing) return fail(409, 'Leave your current alliance first.');

  const home = await env.DB.prepare(`SELECT home_world_id AS id FROM bases WHERE player_id = ?1`)
    .bind(player.id)
    .first<{id: number | null}>();
  if (!home?.id) return fail(409, 'You have not been deployed yet.');

  const tag = typeof body.tag === 'string' ? body.tag.trim() : '';
  const name = typeof body.name === 'string' ? body.name : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  // Required, not optional. An alliance with no stated purpose is one nobody
  // browsing can tell apart from the others, and the browse list is where the
  // decision to join is actually made.
  if (description.length < 8) {
    return fail(400, 'Say what the alliance is for, in a sentence or more.');
  }

  const result = await createAlliance(
    env.DB,
    player.id,
    home.id,
    newId(),
    tag,
    name,
    description,
    body.openJoin !== false,
    Date.now(),
  );
  if (!result.ok) return fail(409, result.error);

  // Any applications elsewhere are void the moment you found something.
  await env.DB.prepare(`DELETE FROM alliance_applications WHERE player_id = ?1`)
    .bind(player.id)
    .run();

  return handleAlliance(env, player);
}

/**
 * Joins an open alliance, or applies to a closed one.
 *
 * Capacity is checked here and enforced by the insert failing if two people
 * take the last seat at once - the check is a courtesy that produces a good
 * message, not the thing keeping the count right.
 */
async function handleJoinAlliance(
  request: Request,
  env: Env,
  player: PlayerRow,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {allianceId?: unknown} | null;
  const allianceId = typeof body?.allianceId === 'string' ? body.allianceId : null;
  if (!allianceId) return fail(400, 'Which alliance?');

  if (await membershipOf(env.DB, player.id)) {
    return fail(409, 'Leave your current alliance first.');
  }

  const home = await env.DB.prepare(`SELECT home_world_id AS id FROM bases WHERE player_id = ?1`)
    .bind(player.id)
    .first<{id: number | null}>();

  const alliance = await env.DB.prepare(
    `SELECT id, open_join, home_world_id FROM alliances WHERE id = ?1`,
  )
    .bind(allianceId)
    .first<{id: string; open_join: number; home_world_id: number}>();
  if (!alliance) return fail(404, 'No such alliance.');

  // An alliance belongs to a server. Joining across servers would make the
  // server number, and the map colour that depends on it, mean nothing.
  if (alliance.home_world_id !== home?.id) {
    return fail(403, 'That alliance belongs to another server.');
  }

  if (atCapacity(await memberCount(env.DB, alliance.id))) {
    return fail(409, 'That alliance is full.');
  }

  const now = Date.now();
  if (alliance.open_join === 1) {
    try {
      await env.DB.prepare(
        `INSERT INTO alliance_members (player_id, alliance_id, rank, joined_at)
         VALUES (?1, ?2, 'member', ?3)`,
      )
        .bind(player.id, alliance.id, now)
        .run();
    } catch {
      return fail(409, 'You are already in an alliance.');
    }
    await env.DB.prepare(`DELETE FROM alliance_applications WHERE player_id = ?1`)
      .bind(player.id)
      .run();
    return handleAlliance(env, player);
  }

  await env.DB.prepare(
    `INSERT INTO alliance_applications (alliance_id, player_id, created_at)
     VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING`,
  )
    .bind(alliance.id, player.id, now)
    .run();
  return handleAlliance(env, player);
}

/**
 * Leaves, or disbands.
 *
 * A leader cannot simply walk out of an alliance with people still in it -
 * that would leave a group with no one able to accept applications or remove
 * anybody, which is a dead alliance nobody can fix or leave cleanly. They hand
 * over first, or they disband it deliberately.
 */
async function handleLeaveAlliance(
  request: Request,
  env: Env,
  player: PlayerRow,
): Promise<Response> {
  const membership = await membershipOf(env.DB, player.id);
  if (!membership) return fail(409, 'You are not in an alliance.');

  const body = (await request.json().catch(() => null)) as {disband?: unknown} | null;
  const count = await memberCount(env.DB, membership.alliance.id);

  if (membership.rank === 'leader' && count > 1) {
    if (body?.disband !== true) {
      return fail(
        409,
        'Hand leadership to somebody else first, or disband the alliance.',
      );
    }
    // Disbanding takes the alliance with it; the cascade clears membership and
    // any outstanding applications.
    await env.DB.prepare(`DELETE FROM alliances WHERE id = ?1`)
      .bind(membership.alliance.id)
      .run();
    return json({alliance: null, applied: []});
  }

  await env.DB.prepare(`DELETE FROM alliance_members WHERE player_id = ?1`)
    .bind(player.id)
    .run();

  // A last member walking out takes the empty alliance with them, rather than
  // leaving a name and tag reserved by nobody.
  if (count <= 1) {
    await env.DB.prepare(`DELETE FROM alliances WHERE id = ?1`)
      .bind(membership.alliance.id)
      .run();
  }

  return json({alliance: null, applied: []});
}

/** Accepts or declines an application. Officers and above. */
async function handleDecideApplication(
  request: Request,
  env: Env,
  player: PlayerRow,
): Promise<Response> {
  const membership = await membershipOf(env.DB, player.id);
  if (!membership) return fail(409, 'You are not in an alliance.');
  if (membership.rank === 'member') return fail(403, 'Lieutenants and the general only.');

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const username = typeof body?.username === 'string' ? body.username : null;
  const accept = body?.accept === true;
  if (!username) return fail(400, 'Which applicant?');

  const applicant = await env.DB.prepare(
    `SELECT id FROM players WHERE username = ?1 COLLATE NOCASE`,
  )
    .bind(username)
    .first<{id: string}>();
  if (!applicant) return fail(404, 'No such callsign.');

  await env.DB.prepare(
    `DELETE FROM alliance_applications WHERE alliance_id = ?1 AND player_id = ?2`,
  )
    .bind(membership.alliance.id, applicant.id)
    .run();

  if (accept) {
    if (atCapacity(await memberCount(env.DB, membership.alliance.id))) {
      return fail(409, 'The alliance is full.');
    }
    try {
      await env.DB.prepare(
        `INSERT INTO alliance_members (player_id, alliance_id, rank, joined_at)
         VALUES (?1, ?2, 'member', ?3)`,
      )
        .bind(applicant.id, membership.alliance.id, Date.now())
        .run();
    } catch {
      return fail(409, 'They have joined another alliance.');
    }
  }

  return handleAlliance(env, player);
}

/**
 * Promotes, demotes, removes a member, or hands over leadership.
 *
 * Every one of these is the same question - may this rank act on that rank -
 * and the answer is always "only downward". That single rule is what stops two
 * officers removing each other and what stops a leader being kicked out of the
 * alliance they founded.
 */
async function handleAllianceRank(
  request: Request,
  env: Env,
  player: PlayerRow,
): Promise<Response> {
  const membership = await membershipOf(env.DB, player.id);
  if (!membership) return fail(409, 'You are not in an alliance.');

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const username = typeof body?.username === 'string' ? body.username : null;
  const action = typeof body?.action === 'string' ? body.action : null;
  if (!username || !action) return fail(400, 'Who, and what?');

  const target = await env.DB.prepare(
    `SELECT p.id AS id, m.rank AS rank, m.alliance_id AS alliance_id
       FROM players p
       JOIN alliance_members m ON m.player_id = p.id
      WHERE p.username = ?1 COLLATE NOCASE`,
  )
    .bind(username)
    .first<{id: string; rank: AllianceRank; alliance_id: string}>();

  if (!target || target.alliance_id !== membership.alliance.id) {
    return fail(404, 'They are not in your alliance.');
  }
  if (target.id === player.id) return fail(400, 'That one is about you.');
  if (!mayActOn(membership.rank, target.rank)) {
    return fail(403, 'You cannot act on somebody of that rank.');
  }

  const now = Date.now();

  if (action === 'remove') {
    await env.DB.prepare(`DELETE FROM alliance_members WHERE player_id = ?1`)
      .bind(target.id)
      .run();
    return handleAlliance(env, player);
  }

  if (action === 'promote' || action === 'demote') {
    // Only a leader creates or unmakes officers. An officer promoting another
    // officer would be creating a peer who could then act on nobody, and
    // demoting one would be acting sideways.
    if (membership.rank !== 'leader') return fail(403, 'Only the general may do that.');
    if (action === 'promote') {
      const count = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM alliance_members
          WHERE alliance_id = ?1 AND rank = 'officer'`,
      )
        .bind(membership.alliance.id)
        .first<{n: number}>();
      if ((count?.n ?? 0) >= MAX_LIEUTENANTS) {
        return fail(409, `An alliance may have at most ${MAX_LIEUTENANTS} lieutenants.`);
      }
    }
    const rank: AllianceRank = action === 'promote' ? 'officer' : 'member';
    await env.DB.prepare(`UPDATE alliance_members SET rank = ?2 WHERE player_id = ?1`)
      .bind(target.id, rank)
      .run();
    return handleAlliance(env, player);
  }

  if (action === 'handover') {
    if (membership.rank !== 'leader') return fail(403, 'Only the general may do that.');
    // Both writes or neither. A half-applied handover leaves an alliance with
    // two leaders or none, and either is worse than the change not happening.
    await env.DB.batch([
      env.DB.prepare(`UPDATE alliance_members SET rank = 'leader' WHERE player_id = ?1`).bind(
        target.id,
      ),
      env.DB.prepare(`UPDATE alliance_members SET rank = 'officer' WHERE player_id = ?1`).bind(
        player.id,
      ),
    ]);
    return handleAlliance(env, player);
  }

  return fail(400, 'Unknown action.');
}

/** Edits the alliance itself. Leaders only. */
async function handleAllianceSettings(
  request: Request,
  env: Env,
  player: PlayerRow,
): Promise<Response> {
  const membership = await membershipOf(env.DB, player.id);
  if (!membership) return fail(409, 'You are not in an alliance.');
  if (membership.rank !== 'leader') return fail(403, 'Only the general may do that.');

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return fail(400, 'Nothing to change.');

  const description =
    typeof body.description === 'string' ? body.description.trim().slice(0, DESCRIPTION_MAX) : '';
  const openJoin = body.openJoin !== false;

  await env.DB.prepare(
    `UPDATE alliances SET description = ?2, open_join = ?3 WHERE id = ?1`,
  )
    .bind(membership.alliance.id, description === '' ? null : description, openJoin ? 1 : 0)
    .run();

  return handleAlliance(env, player);
}

/** A player's uploaded portrait, as an image rather than as JSON. */
async function handlePortraitImage(request: Request, env: Env): Promise<Response> {
  const name = new URL(request.url).searchParams.get('name');
  if (!name) return fail(400, 'Which player?');

  const row = await env.DB.prepare(
    `SELECT pp.mime AS mime, pp.data_url AS data_url, pp.updated_at AS updated_at
       FROM players p
       JOIN player_portraits pp ON pp.player_id = p.id
      WHERE p.username = ?1 COLLATE NOCASE`,
  )
    .bind(name)
    .first<{mime: string; data_url: string; updated_at: number}>();
  if (!row) return fail(404, 'No portrait.');

  return imageResponse(request, row.data_url, row.mime, row.updated_at);
}

/** An alliance's uploaded crest. */
async function handleAllianceCrestImage(request: Request, env: Env): Promise<Response> {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return fail(400, 'Which alliance?');

  const row = await env.DB.prepare(
    `SELECT mime, data_url, updated_at FROM alliance_portraits WHERE alliance_id = ?1`,
  )
    .bind(id)
    .first<{mime: string; data_url: string; updated_at: number}>();
  if (!row) return fail(404, 'No crest.');

  return imageResponse(request, row.data_url, row.mime, row.updated_at);
}

/**
 * Sets or removes the alliance crest, and its fallback colour.
 *
 * Leaders only. A crest is the alliance's identity in every list it appears
 * in, and letting an officer change it means the thing other players recognise
 * an alliance by can be altered by somebody who did not found it.
 */
async function handleAllianceCrest(
  request: Request,
  env: Env,
  player: PlayerRow,
): Promise<Response> {
  const membership = await membershipOf(env.DB, player.id);
  if (!membership) return fail(409, 'You are not in an alliance.');
  if (membership.rank !== 'leader') return fail(403, 'Leaders only.');

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return fail(400, 'Nothing received.');

  if (typeof body.tint === 'string' && isPortraitTint(body.tint)) {
    await env.DB.prepare(`UPDATE alliances SET emblem_tint = ?2 WHERE id = ?1`)
      .bind(membership.alliance.id, body.tint)
      .run();
  }

  if (body.image === null) {
    await env.DB.prepare(`DELETE FROM alliance_portraits WHERE alliance_id = ?1`)
      .bind(membership.alliance.id)
      .run();
    return handleAlliance(env, player);
  }

  if (body.image !== undefined) {
    const result = validatePortrait(body.image);
    if (!result.ok) return fail(400, result.error);
    await env.DB.prepare(
      `INSERT INTO alliance_portraits (alliance_id, mime, data_url, bytes, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(alliance_id) DO UPDATE SET
         mime = excluded.mime, data_url = excluded.data_url,
         bytes = excluded.bytes, updated_at = excluded.updated_at`,
    )
      .bind(
        membership.alliance.id,
        result.mime,
        result.dataUrl,
        result.bytes,
        Date.now(),
      )
      .run();
  }

  return handleAlliance(env, player);
}

/** Everything about this player that decides which channels they belong to. */
async function chatViewer(env: Env, player: PlayerRow): Promise<Viewer> {
  const [home, membership, groups, self] = await Promise.all([
    env.DB.prepare(`SELECT home_world_id AS id FROM bases WHERE player_id = ?1`)
      .bind(player.id)
      .first<{id: number | null}>(),
    membershipOf(env.DB, player.id),
    env.DB.prepare(`SELECT group_id AS id FROM chat_group_members WHERE player_id = ?1`)
      .bind(player.id)
      .all<{id: string}>(),
    env.DB.prepare(`SELECT locale FROM players WHERE id = ?1`)
      .bind(player.id)
      .first<{locale: string}>(),
  ]);
  return {
    playerId: player.id,
    homeWorldId: home?.id ?? null,
    allianceId: membership?.alliance.id ?? null,
    rank: membership?.rank ?? null,
    groupIds: (groups.results ?? []).map((g) => g.id),
    language: isLanguage(self?.locale) ? self!.locale : 'en',
  };
}

/**
 * Reads a channel.
 *
 * Access is checked here as well as on send. A channel string in a request is
 * a claim, not a credential - if reads were trusted because writes were
 * checked, alliance planning would be readable by the people it is about.
 */
async function handleChatRead(
  request: Request,
  env: Env,
  player: PlayerRow,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const channel = url.searchParams.get('channel');
  if (!channel) return fail(400, 'Which channel?');

  const viewer = await chatViewer(env, player);
  const access = resolveAccess(channel, viewer);
  if (!access.ok) return fail(403, access.error);

  const sinceRaw = url.searchParams.get('since');
  const since = sinceRaw === null ? null : Number(sinceRaw);

  const messages =
    since === null || !Number.isFinite(since)
      ? await readRecent(env.DB, channel, 80, viewer.language)
      : await readChannel(env.DB, channel, since, 200, viewer.language);

  // Translation happens after this response has gone out. A message appears
  // immediately in the language it was typed in and grows a translation a
  // second later, rather than every message in the channel waiting behind a
  // model call.
  ctx.waitUntil(translateMissing(env, messages, viewer.language));

  // Opening a channel clears the mentions in it. This is a separate act from
  // marking the channel read - a mention is a thing somebody is waiting on an
  // answer to, so it is cleared by looking at the channel it is in, never by
  // the badge maths below.
  ctx.waitUntil(clearMentions(env.DB, player.id, {channel}, Date.now()));

  // Opening a channel marks it read. Anything arriving after this instant is
  // what the unread badge is counting.
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO channel_reads (player_id, channel, last_read_at)
     VALUES (?1, ?2, ?3)
     ON CONFLICT(player_id, channel) DO UPDATE SET last_read_at = excluded.last_read_at`,
  )
    .bind(player.id, channel, now)
    .run();

  return json({channel, messages, serverTime: now});
}

/**
 * Sends a message.
 *
 * Both sides of a private conversation get a thread row, so it appears in the
 * recipient's Private tab without them having to already know it exists -
 * otherwise the first message to somebody would be invisible to them.
 */
/**
 * A bug report from inside the game.
 *
 * Deliberately the dullest endpoint in the file. It does not translate, it
 * does not notify, and it depends on no feature a player might be reporting
 * on - a report about chat must not travel through chat.
 */
async function handleBugReport(request: Request, env: Env, player: PlayerRow): Promise<Response> {
  const now = Date.now();

  // Rate limit before reading the body, so a flood costs one indexed read.
  const blockedUntil = await reportAllowedAt(env.DB, player.id, now);
  if (blockedUntil !== null) return fail(429, 'You just sent one. Give it a minute.');

  const input = (await request.json().catch(() => null)) as ReportInput | null;
  if (!input) return fail(400, 'Nothing to report.');

  const home = await env.DB.prepare(`SELECT home_world_id AS id FROM bases WHERE player_id = ?1`)
    .bind(player.id)
    .first<{id: number | null}>();

  const result = await fileReport(
    env.DB,
    {id: player.id, username: player.username, homeWorldId: home?.id ?? null},
    isLanguage(player.locale) ? player.locale : 'en',
    request.headers.get('user-agent'),
    input,
    now,
  );
  if (!result.ok) return fail(400, result.error);
  return json({ok: true, id: result.id});
}

async function handleChatSend(
  request: Request,
  env: Env,
  player: PlayerRow,
  ctx: ExecutionContext,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const channelRaw = typeof body?.channel === 'string' ? body.channel : null;
  const textRaw = typeof body?.body === 'string' ? body.body : null;
  if (!channelRaw || textRaw === null) return fail(400, 'Nothing to send.');

  const text = flattenMessage(textRaw);
  if (text.length === 0) return fail(400, 'Say something.');
  if (text.length > MESSAGE_MAX) {
    return fail(400, `Messages are ${MESSAGE_MAX} characters or fewer.`);
  }

  const viewer = await chatViewer(env, player);
  const access = resolveAccess(channelRaw, viewer);
  if (!access.ok) return fail(403, access.error);
  if (!access.canWrite) return fail(403, 'You cannot post there.');

  // The message being answered, if any. Verified to be in the same channel:
  // without that check a reply could quote a line out of a channel the reader
  // cannot open, and the quote would be shown to everybody who can.
  const replyToRaw = typeof body?.replyTo === 'string' ? body.replyTo : null;
  let replyTo: string | null = null;
  if (replyToRaw) {
    const parent = await env.DB.prepare(`SELECT channel FROM messages WHERE id = ?1`)
      .bind(replyToRaw)
      .first<{channel: string}>();
    if (parent?.channel === channelRaw) replyTo = replyToRaw;
  }

  const now = Date.now();
  const messageId = newId();
  // The instant guess, so the send is not held behind a model call. It is
  // right for every non-Latin script and a placeholder for the rest, which
  // refineLanguage settles once the response has gone.
  const guessedLang = detectLanguage(text, viewer.language);
  const writes: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO messages (id, channel, author_id, body, created_at, lang, reply_to)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
      // Detected from the body, NOT taken from the author's preference. The
      // preference says what they want to read; this has to say what they
      // actually wrote, or a player typing in someone else's language - the
      // exact case translation exists for - produces a message that claims to
      // already be in the reader's language and is never translated.
    ).bind(messageId, channelRaw, player.id, text, now, guessedLang, replyTo),
  ];

  const other = dmOther(channelRaw, player.id);
  if (other) {
    for (const [owner, partner] of [
      [player.id, other],
      [other, player.id],
    ]) {
      writes.push(
        env.DB.prepare(
          `INSERT INTO dm_threads (player_id, other_id, channel, updated_at)
           VALUES (?1, ?2, ?3, ?4)
           ON CONFLICT(player_id, other_id) DO UPDATE SET updated_at = excluded.updated_at`,
        ).bind(owner, partner, channelRaw, now),
      );
    }
  }

  await env.DB.batch(writes);

  // Pruning rides on sending rather than on a schedule, because a Worker has
  // no background. One send in roughly two hundred pays for it, which is often
  // enough to keep the table bounded and rare enough to be invisible.
  if (Math.random() < 0.005) {
    await env.DB.prepare(`DELETE FROM messages WHERE created_at < ?1`)
      .bind(now - RETENTION_DAYS * 86_400_000)
      .run();
  }

  // Mentions are resolved against who can actually read this channel, so
  // naming somebody who is not in it notifies nobody rather than handing them
  // a line of text out of a room they cannot open.
  const mentioned = await recordMentions(env.DB, messageId, channelRaw, text, viewer, now);

  // Settle the language behind the response. Latin script cannot be read off
  // the characters, and a wrong language here is the difference between a
  // message that translates and one that silently does not.
  ctx.waitUntil(refineLanguage(env, messageId, text, guessedLang));

  return json({ok: true, serverTime: now, mentioned});
}

/** Which channels this player has, and how much is unread in each. */
async function handleChatChannels(env: Env, player: PlayerRow): Promise<Response> {
  const viewer = await chatViewer(env, player);
  const channels = channelsFor(viewer);

  const threads = await env.DB.prepare(
    `SELECT t.channel AS channel, p.username AS other, t.updated_at AS updatedAt
       FROM dm_threads t
       JOIN players p ON p.id = t.other_id
      WHERE t.player_id = ?1
      ORDER BY t.updated_at DESC
      LIMIT 50`,
  )
    .bind(player.id)
    .all<{channel: string; other: string; updatedAt: number}>();

  const groups = await env.DB.prepare(
    `SELECT g.id AS id, g.name AS name,
            (SELECT COUNT(*) FROM chat_group_members x WHERE x.group_id = g.id) AS members
       FROM chat_group_members m
       JOIN chat_groups g ON g.id = m.group_id
      WHERE m.player_id = ?1
      ORDER BY g.created_at DESC
      LIMIT 50`,
  )
    .bind(player.id)
    .all<{id: string; name: string; members: number}>();

  const groupList = (groups.results ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    members: g.members,
    channel: groupChannel(g.id),
  }));

  const keys = [channels.server, channels.alliance, channels.leadership]
    .concat((threads.results ?? []).map((t) => t.channel))
    .concat(groupList.map((g) => g.channel))
    .filter((k): k is string => k !== null);

  const unread: Record<string, number> = {};
  if (keys.length > 0) {
    const placeholders = keys.map((_, i) => `?${i + 2}`).join(', ');
    const rows = await env.DB.prepare(
      `SELECT m.channel AS channel, COUNT(*) AS n
         FROM messages m
         LEFT JOIN channel_reads r
                ON r.channel = m.channel AND r.player_id = ?1
        WHERE m.channel IN (${placeholders})
          AND m.author_id <> ?1
          AND m.created_at > COALESCE(r.last_read_at, 0)
        GROUP BY m.channel`,
    )
      .bind(player.id, ...keys)
      .all<{channel: string; n: number}>();
    for (const row of rows.results ?? []) unread[row.channel] = row.n;
  }

  // The most recent message in each channel, for the collapsed bar and the
  // private conversation list. One query rather than one per channel: a player
  // with a dozen conversations would otherwise pay a dozen round trips to
  // render a list they have not opened.
  const latest: Record<string, {author: string; body: string; createdAt: number}> = {};
  if (keys.length > 0) {
    const placeholders = keys.map((_, i) => `?${i + 1}`).join(', ');
    const rows = await env.DB.prepare(
      `SELECT m.channel AS channel, m.body AS body, m.created_at AS createdAt,
              p.username AS author
         FROM messages m
         JOIN players p ON p.id = m.author_id
         JOIN (SELECT channel, MAX(created_at) AS newest
                 FROM messages
                WHERE channel IN (${placeholders})
                GROUP BY channel) last
           ON last.channel = m.channel AND last.newest = m.created_at`,
    )
      .bind(...keys)
      .all<{channel: string; body: string; createdAt: number; author: string}>();
    for (const row of rows.results ?? []) {
      latest[row.channel] = {
        author: row.author,
        body: row.body,
        createdAt: row.createdAt,
      };
    }
  }

  return json({
    channels,
    threads: threads.results ?? [],
    groups: groupList,
    unread,
    latest,
    rank: viewer.rank,
    serverTime: Date.now(),
  });
}

/** Opens (or finds) a private conversation with somebody, by callsign. */
async function handleChatOpenDm(
  request: Request,
  env: Env,
  player: PlayerRow,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {username?: unknown} | null;
  const username = typeof body?.username === 'string' ? body.username : null;
  if (!username) return fail(400, 'Who with?');

  const other = await env.DB.prepare(
    `SELECT id, username FROM players WHERE username = ?1 COLLATE NOCASE`,
  )
    .bind(username)
    .first<{id: string; username: string}>();
  if (!other) return fail(404, 'No such callsign.');
  if (other.id === player.id) return fail(400, 'That one is you.');

  const channel = dmChannel(player.id, other.id);
  // Only the opener's own thread row is created. The recipient's appears when
  // there is something in it to see - a list of conversations nobody has
  // spoken in is a list of people who tried to talk to you and did not.
  await env.DB.prepare(
    `INSERT INTO dm_threads (player_id, other_id, channel, updated_at)
     VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(player_id, other_id) DO NOTHING`,
  )
    .bind(player.id, other.id, channel, Date.now())
    .run();

  return json({channel, other: other.username});
}

/** Starts a group conversation. The founder is simply its first member. */
async function handleGroupCreate(
  request: Request,
  env: Env,
  player: PlayerRow,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const name = typeof body?.name === 'string' ? flattenMessage(body.name) : '';
  if (name.length < 2) return fail(400, 'Give the group a name.');
  if (name.length > GROUP_NAME_MAX) {
    return fail(400, `Names are ${GROUP_NAME_MAX} characters or fewer.`);
  }

  const id = newId();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO chat_groups (id, name, created_by, created_at) VALUES (?1, ?2, ?3, ?4)`,
    ).bind(id, name, player.id, now),
    env.DB.prepare(
      `INSERT INTO chat_group_members (group_id, player_id, added_at) VALUES (?1, ?2, ?3)`,
    ).bind(id, player.id, now),
  ]);

  return json({channel: groupChannel(id), id, name});
}

/**
 * Adds somebody to a group.
 *
 * Anybody already inside may do this, which is what a group chat is - there is
 * no owner to ask. The cap is checked here and, because two people adding the
 * twenty-first member at once would both pass that check, the count is read
 * inside the same request that writes. It can still race by one under real
 * contention; twenty-one people in a group is a cosmetic problem, where a
 * lock would be a real one.
 */
async function handleGroupAdd(
  request: Request,
  env: Env,
  player: PlayerRow,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const groupId = typeof body?.groupId === 'string' ? body.groupId : null;
  const username = typeof body?.username === 'string' ? body.username : null;
  if (!groupId || !username) return fail(400, 'Who, and to which group?');

  const mine = await env.DB.prepare(
    `SELECT 1 AS ok FROM chat_group_members WHERE group_id = ?1 AND player_id = ?2`,
  )
    .bind(groupId, player.id)
    .first<{ok: number}>();
  if (!mine) return fail(403, 'That conversation is not yours.');

  const target = await env.DB.prepare(
    `SELECT id FROM players WHERE username = ?1 COLLATE NOCASE`,
  )
    .bind(username)
    .first<{id: string}>();
  if (!target) return fail(404, 'No such callsign.');

  const count = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM chat_group_members WHERE group_id = ?1`,
  )
    .bind(groupId)
    .first<{n: number}>();
  if ((count?.n ?? 0) >= GROUP_CAPACITY) {
    return fail(409, `A group holds ${GROUP_CAPACITY} people.`);
  }

  await env.DB.prepare(
    `INSERT INTO chat_group_members (group_id, player_id, added_at)
     VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING`,
  )
    .bind(groupId, target.id, Date.now())
    .run();

  return handleChatChannels(env, player);
}

/** Leaves a group. A group nobody is left in is deleted with its messages. */
async function handleGroupLeave(
  request: Request,
  env: Env,
  player: PlayerRow,
): Promise<Response> {
  const body = (await request.json().catch(() => null)) as {groupId?: unknown} | null;
  const groupId = typeof body?.groupId === 'string' ? body.groupId : null;
  if (!groupId) return fail(400, 'Which group?');

  await env.DB.prepare(
    `DELETE FROM chat_group_members WHERE group_id = ?1 AND player_id = ?2`,
  )
    .bind(groupId, player.id)
    .run();

  const left = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM chat_group_members WHERE group_id = ?1`,
  )
    .bind(groupId)
    .first<{n: number}>();
  if ((left?.n ?? 0) === 0) {
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM messages WHERE channel = ?1`).bind(groupChannel(groupId)),
      env.DB.prepare(`DELETE FROM chat_groups WHERE id = ?1`).bind(groupId),
    ]);
  }

  return handleChatChannels(env, player);
}

async function route(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

  const endpoint = `${request.method} ${url.pathname}`;

  if (endpoint === 'POST /api/access/request') return handleRequestAccess(request, env);

  if (endpoint === 'GET /api/access/decide') return handleDecision(request, env);

  if (endpoint === 'GET /api/access/callsign') return handleCallsignCheck(request, env);
  if (endpoint === 'POST /api/auth/login') return handleLogin(request, env);
  if (endpoint === 'POST /api/admin/testbots/mint') return handleMintTestBots(request, env);

  if (endpoint === 'POST /api/auth/logout') {
    const token = readSessionCookie(request);
    if (token) await env.DB.prepare(`DELETE FROM sessions WHERE token = ?1`).bind(token).run();
    return json({ok: true}, {headers: {'Set-Cookie': sessionCookie('', 0)}});
  }

  const player = await authenticate(request, env);
  if (!player) return fail(401, 'Not signed in.');

  // The interface language rides along with the player, so the client knows
  // which dictionary to draw in before it renders anything.
  if (endpoint === 'GET /api/me') {
    return json({player: {...player, language: isLanguage(player.locale) ? player.locale : 'en'}});
  }

  if (endpoint === 'GET /api/access/requests') return handleAdminRequests(env, player);

  if (endpoint === 'GET /api/admin/ai-check') return handleAiCheck(request, env, player);

  if (endpoint === 'GET /api/admin/bots') return handleBotsPage(env, player);
  if (endpoint === 'GET /api/admin/impersonate') return handleImpersonate(request, env, player);
  if (endpoint === 'POST /api/admin/farmbots/plant') return handlePlantFarmBots(request, env, player);

  if (endpoint === 'POST /api/support/report') return handleBugReport(request, env, player);

  // Development-only progression seeds. 404 unless the flag is on AND the
  // caller is the owner - the same silence as the admin routes.
  if (url.pathname === '/api/dev/progression') {
    if (!devSeedsEnabled(env) || player.role !== 'owner') return fail(404, 'No such endpoint.');
    if (request.method === 'GET') return json({enabled: true, ...(await devStatus(env.DB))});
    if (request.method === 'POST') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (!body) return fail(400, 'Send JSON.');
      const now = Date.now();
      const result =
        body.action === 'create'
          ? await createQaAccount(env.DB, String(body.password ?? ''), seedBaseFor(env), player.id, now)
          : await devAction(env.DB, player.id, body, now);
      if (!result.ok) return fail(400, result.error);
      return json({...result, status: await devStatus(env.DB)});
    }
  }

  // Owner-only, and 404 rather than 403 so the endpoint does not announce
  // itself to everyone else - the shape the admin routes already use.
  if (endpoint === 'GET /api/support/reports') {
    if (player.role !== 'owner') return fail(404, 'No such endpoint.');
    return json({reports: await recentReports(env.DB, url.searchParams.get('status'), 200)});
  }

  if (endpoint === 'GET /api/base') {
    const now = Date.now();
    const [state, wallet, placements, season1] = await Promise.all([
      settleAndLoad(env, player.id, now),
      // Settled here as well as on the roster screen, because this is the read
      // every player makes on every visit - a tester who never opens the roster
      // still gets their weekly top-up.
      settleWallet(env.DB, player.id, now),
      readPlacements(env.DB, player.id),
      readSeasonState(env.DB, player.id, now),
    ]);
    if (!state) return fail(404, 'No base found.');
    return json({
      ...baseView(state, now),
      wallet: {tokens: wallet.tokens, credits: wallet.credits},
      placements,
      season1,
    });
  }

  // Moving a building on the base board. Visual only - the server's interest
  // is that a pad holds one building and the centre stays the Command Center.
  if (endpoint === 'POST /api/base/arrange') {
    const body = (await request.json().catch(() => null)) as {buildingId?: unknown; padId?: unknown} | null;
    if (typeof body?.buildingId !== 'string' || typeof body?.padId !== 'string') {
      return fail(400, 'Say which building and which pad.');
    }
    const result = await arrangeBoard(env.DB, player.id, body.buildingId, body.padId);
    if (!result.ok) return fail(409, result.error);
    return json({placements: result.placements});
  }

  if (endpoint === 'POST /api/assets/rank') return handleRankUp(request, env, player);

  if (endpoint === 'GET /api/season') {
    return json(await readSeasonState(env.DB, player.id, Date.now()));
  }

  if (endpoint === 'POST /api/assets/build') {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const assetId = typeof body?.assetId === 'string' ? body.assetId : '';
    const result = await startBuild(env.DB, player.id, assetId, Date.now(), (b) => buildingName(b as LevelledBuilding));
    if (!result.ok) return fail(400, result.error);
    return handleSquads(env, player);
  }

  if (endpoint === 'POST /api/assets/repair') {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const target = typeof body?.assetId === 'string' ? body.assetId : 'all';
    const result = await startRepair(
      env.DB,
      player.id,
      target,
      await marchingSquads(env.DB, player.id),
      Date.now(),
      (b) => buildingName(b as LevelledBuilding),
    );
    if (!result.ok) return fail(400, result.error);
    await noteDailyProgress(env.DB, player.id, 'readiness', Date.now()).catch(() => undefined);
    return handleSquads(env, player);
  }

  if (endpoint === 'POST /api/squads/systems') return handleSystemUp(request, env, player);

  if (endpoint === 'POST /api/squads/delta') {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const split = readSplit(body);
    if (split === 'bad') return fail(400, 'That payment does not make sense.');
    const levels = await readLevels(env.DB, player.id);
    const result = await buyDelta(env.DB, player.id, levels.command_center, split, Date.now());
    if (!result.ok) return fail(400, result.error);
    return handleSquads(env, player);
  }

  if (endpoint === 'POST /api/shield') {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const kind = typeof body?.kind === 'string' ? body.kind : '';
    const split = readSplit(body);
    if (split === 'bad') return fail(400, 'That payment does not make sense.');
    const result = await applyShield(env.DB, player.id, kind, split, Date.now());
    if (!result.ok) return fail(400, result.error);
    return json({
      ok: true,
      wallet: {tokens: result.wallet.tokens, credits: result.wallet.credits},
      season1: await readSeasonState(env.DB, player.id, Date.now()),
    });
  }

  if (endpoint === 'POST /api/guide') {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    await saveGuide(env.DB, player.id, {
      step: typeof body?.step === 'number' ? body.step : undefined,
      enabled: typeof body?.enabled === 'boolean' ? body.enabled : undefined,
      completed: body?.completed === true ? true : undefined,
      tip: typeof body?.tip === 'string' ? body.tip : undefined,
    });
    return json({ok: true, season1: await readSeasonState(env.DB, player.id, Date.now())});
  }

  if (endpoint === 'GET /api/base/levels') {
    const now = Date.now();
    const [base, wallet] = await Promise.all([
      readBase(env.DB, player.id, now),
      settleWallet(env.DB, player.id, now),
    ]);
    return json({
      ...baseLevelsView(base, env),
      season: CURRENT_SEASON,
      wallet: {tokens: wallet.tokens, credits: wallet.credits},
    });
  }

  if (endpoint === 'POST /api/base/level') {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const building = typeof body?.building === 'string' ? body.building : '';
    const balance = balanceFor(env);
    if (!balance.ok) {
      // Refuse loudly rather than price the upgrade from a profile nobody chose.
      console.error(`WWR_BALANCE_PROFILE: ${balance.error}`);
      return fail(503, 'Building upgrades are paused while the server is reconfigured. Try again shortly.');
    }
    const result = await startLevel(
      env.DB, player.id, building, CURRENT_SEASON, Date.now(), buildingName, balance.profile,
    );
    if (!result.ok) return fail(400, result.error);
    if (balance.profile.status !== 'default') {
      // base_jobs has no column for the profile (a schema change, not made
      // here); Workers Logs keep the record of which table priced this job.
      const job = result.base.jobs.find((j) => j.building === building);
      console.log(
        JSON.stringify({
          event: 'base_job_started',
          player: player.id,
          building,
          toLevel: job?.toLevel ?? null,
          jobId: job?.id ?? null,
          completesAt: job?.completesAt ?? null,
          balance: `${balance.profile.id}@${balance.profile.version}`,
        }),
      );
    }
    // Daily Operations, Command lane: the upgrade has started and been paid for.
    await noteDailyProgress(env.DB, player.id, 'command', Date.now()).catch(() => undefined);
    const wallet = await settleWallet(env.DB, player.id, Date.now());
    return json({
      ok: true,
      ...baseLevelsView(result.base, env),
      season: CURRENT_SEASON,
      wallet: {tokens: wallet.tokens, credits: wallet.credits},
    });
  }

  if (endpoint === 'POST /api/depot/resources') {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const kind = typeof body?.resource === 'string' ? body.resource : '';
    const split = readSplit(body);
    if (split === 'bad') return fail(400, 'That payment does not make sense.');
    const result = await buyResource(env.DB, player.id, kind, Number(body?.amount), split, Date.now());
    if (!result.ok) return fail(400, result.error);
    return json({
      ok: true,
      ...baseLevelsView(result.base, env),
      season: CURRENT_SEASON,
      wallet: {tokens: result.wallet.tokens, credits: result.wallet.credits},
      bought: result.bought,
    });
  }

  if (endpoint === 'POST /api/base/second-team') {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const split = readSplit(body);
    if (split === 'bad') return fail(400, 'That payment does not make sense.');
    const result = await buySecondTeam(env.DB, player.id, split, Date.now(), buildingName);
    if (!result.ok) return fail(400, result.error);
    return json({
      ok: true,
      ...baseLevelsView(result.base, env),
      season: CURRENT_SEASON,
      wallet: {tokens: result.wallet.tokens, credits: result.wallet.credits},
    });
  }

  if (endpoint === 'POST /api/assets/package') return handlePackageUp(request, env, player);

  if (endpoint === 'GET /api/trade-post') {
    return json(await readTradePost(env.DB, player.id, Date.now(), env.WWR_TOKEN_STORE_URL ?? null));
  }
  if (endpoint === 'POST /api/trade-post/buy') {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const key = body?.package;
    if (!isPackageKey(key)) return fail(400, 'No such package.');
    if (!isRoute(body?.route)) return fail(400, 'Pick Tokens or Command Credits.');
    // Note what is NOT read here: no cost, no balance, no limit, no reset. The
    // client chooses; the server prices, counts and grants.
    const result = await buyFromTradePost(
      env.DB,
      player.id,
      {
        purchaseId: typeof body?.purchaseId === 'string' ? body.purchaseId : '',
        offerId: typeof body?.offerId === 'string' ? body.offerId : '',
        assetId: typeof body?.assetId === 'string' ? body.assetId : '',
        key,
        route: body.route,
      },
      Date.now(),
    );
    if (!result.ok) return json({error: result.error, code: result.code}, {status: result.code === 'bad-request' ? 400 : 409});
    return json(result);
  }

  if (endpoint === 'POST /api/assets/reset') return handlePackageReset(request, env, player);

  if (endpoint === 'GET /api/squads') return handleSquads(env, player);

  if (endpoint === 'POST /api/squads/assign') return handleAssign(request, env, player);

  if (endpoint === 'POST /api/squads/move') return handleMove2(request, env, player);

  if (endpoint === 'POST /api/attack') return handleAttack(request, env, player);
  if (endpoint === 'POST /api/recall') return handleRecall(request, env, player);

  if (endpoint === 'GET /api/chat') return handleChatRead(request, env, player, ctx);

  if (endpoint === 'POST /api/chat') return handleChatSend(request, env, player, ctx);

  if (endpoint === 'GET /api/chat/channels') return handleChatChannels(env, player);

  if (endpoint === 'GET /api/chat/mentionable') return handleMentionable(request, env, player);

  if (endpoint === 'GET /api/chat/mentions') return handleMentions(env, player);

  if (endpoint === 'POST /api/chat/dm') return handleChatOpenDm(request, env, player);

  if (endpoint === 'POST /api/chat/group') return handleGroupCreate(request, env, player);

  if (endpoint === 'POST /api/chat/group/add') return handleGroupAdd(request, env, player);

  if (endpoint === 'POST /api/chat/group/leave') return handleGroupLeave(request, env, player);

  if (endpoint === 'GET /api/portrait') return handlePortraitImage(request, env);

  if (endpoint === 'GET /api/alliance/crest') return handleAllianceCrestImage(request, env);

  if (endpoint === 'POST /api/alliance/crest') return handleAllianceCrest(request, env, player);

  if (endpoint === 'GET /api/alliance') return handleAlliance(env, player);

  if (endpoint === 'GET /api/alliance/browse') return handleBrowseAlliances(env, player);

  if (endpoint === 'POST /api/alliance/create') {
    return handleCreateAlliance(request, env, player);
  }

  if (endpoint === 'POST /api/alliance/join') return handleJoinAlliance(request, env, player);

  if (endpoint === 'POST /api/alliance/leave') return handleLeaveAlliance(request, env, player);

  if (endpoint === 'POST /api/alliance/decide') {
    return handleDecideApplication(request, env, player);
  }

  if (endpoint === 'POST /api/alliance/rank') return handleAllianceRank(request, env, player);

  if (endpoint === 'POST /api/alliance/settings') {
    return handleAllianceSettings(request, env, player);
  }

  if (endpoint === 'GET /api/profile') return handleProfile(request, env);

  // Season 1 Daily Operations: today's lanes and Cache, the claim, and the
  // reward history the Reports screen shows (straight from event_reward_grants).
  if (endpoint === 'GET /api/ops/daily') return json(await readDaily(env.DB, player.id, Date.now()));
  if (endpoint === 'POST /api/ops/daily/claim') {
    const result = await claimCache(env.DB, player.id, Date.now());
    if (!result.ok) return fail(409, result.error);
    return json({ok: true, reward: result.reward, daily: await readDaily(env.DB, player.id, Date.now())});
  }
  if (endpoint === 'GET /api/ops/grants') return json({grants: await listGrants(env.DB, player.id)});

  // Dominion Warfront: the screen. Standings, the treasury, today's tally.
  if (endpoint === 'GET /api/warfront') {
    const now = Date.now();
    const worlds = await reachableWorlds(env.DB, player.id, now);
    const world = worlds.find((entry) => entry.kind === 'home') ?? worlds[0];
    if (!world) return fail(409, 'You have not been deployed yet.');
    return json(await warfrontView(env.DB, player.id, world.id, now));
  }

  // Alliance Convoy: the screen, boarding, the Guardian and their escort,
  // and the paid Contract Convoy. A Season 1 Convoy has no attack route.
  if (endpoint.startsWith('GET /api/convoy') || endpoint.startsWith('POST /api/convoy')) {
    const now = Date.now();
    const worlds = await reachableWorlds(env.DB, player.id, now);
    const world = worlds.find((entry) => entry.kind === 'home') ?? worlds[0];
    if (!world) return fail(409, 'You have not been deployed yet.');
    const view = () => allianceConvoyView(env.DB, player.id, world.id, world.extent, now);

    if (endpoint === 'GET /api/convoy') return json(await view());
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (endpoint === 'POST /api/convoy/join') {
      const r = await joinTruck(env.DB, player.id, String(body?.convoyId ?? ''), Number(body?.truck), now);
      if (!r.ok) return fail(409, r.error);
      return json({ok: true, view: await view()});
    }
    if (endpoint === 'POST /api/convoy/leave') {
      const r = await leaveTruck(env.DB, player.id, String(body?.convoyId ?? ''), now);
      if (!r.ok) return fail(409, r.error);
      return json({ok: true, view: await view()});
    }
    if (endpoint === 'POST /api/convoy/contract') {
      const r = await startContract(env.DB, player.id, world.id, world.extent, now);
      if (!r.ok) return fail(409, r.error);
      return json({ok: true, wallet: {tokens: r.wallet.tokens, credits: r.wallet.credits}, view: await view()});
    }
    if (endpoint === 'POST /api/convoy/guardian') {
      const r = await setGuardian(env.DB, player.id, String(body?.convoyId ?? ''), String(body?.username ?? ''), now);
      if (!r.ok) return fail(409, r.error);
      return json({ok: true, view: await view()});
    }
    if (endpoint === 'POST /api/convoy/guard') {
      const r = await setGuard(env.DB, player.id, String(body?.convoyId ?? ''), body?.guard, now);
      if (!r.ok) return fail(409, r.error);
      return json({ok: true, view: await view()});
    }
  }

  // The Arena Squad: the setup screen, and the save. Slots only; every
  // figure and every rule is the server's (worker/arenaSquad.ts).
  if (endpoint === 'GET /api/arena/squad' || endpoint === 'POST /api/arena/squad') {
    const now = Date.now();
    const away = await marchingSquads(env.DB, player.id);
    if (endpoint === 'POST /api/arena/squad') {
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      const saved = await saveArenaSlots(env.DB, player.id, body?.slots, now);
      if (!saved.ok) return fail(400, saved.error);
    }
    return json(await arenaSquadView(env.DB, player.id, away, now));
  }

  // A stored Arena report, re-opened: the whole fight as it was resolved.
  if (endpoint === 'GET /api/arena/report') {
    const id = url.searchParams.get('id') ?? '';
    const attempt = id ? await readAttempt(env.DB, player.id, id) : null;
    if (!attempt) return fail(404, 'No such report.');
    return json({attempt});
  }
  if (endpoint === 'GET /api/arena/reports') return json({attempts: await listAttempts(env.DB, player.id)});

  // Iron Dominion Arena: the screen, and one attempt.
  if (endpoint === 'GET /api/arena' || endpoint === 'POST /api/arena/attempt') {
    const now = Date.now();
    const worlds = await reachableWorlds(env.DB, player.id, now);
    const world = worlds.find((entry) => entry.kind === 'home') ?? worlds[0];
    if (!world) return fail(409, 'You have not been deployed yet.');
    const away = await marchingSquads(env.DB, player.id);
    if (endpoint === 'POST /api/arena/attempt') {
      const result = await makeAttempt(env.DB, player.id, player.username, world.id, away, now, newId);
      if (!result.ok) return fail(409, result.error);
      return json({...result, view: await arenaView(env.DB, player.id, world.id, away, now)});
    }
    return json(await arenaView(env.DB, player.id, world.id, away, now));
  }

  // March a Task Force to one of today's map exercises. No Fuel, no defender.
  if (endpoint === 'POST /api/ops/exercise') {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const id = typeof body?.id === 'string' ? body.id : '';
    const squad = body?.squad;
    if (!isSquadName(squad)) return fail(400, 'No such Task Force.');
    const now = Date.now();
    const exercise = await readExercise(env.DB, player.id, id);
    if (!exercise) return fail(404, 'No such target.');
    const mine = await env.DB.prepare(`SELECT plot_x AS x, plot_y AS y FROM placements WHERE world_id = ?1 AND player_id = ?2`)
      .bind(exercise.world_id, player.id)
      .first<{x: number; y: number}>();
    if (!mine) return fail(409, 'You are not standing anywhere yet.');
    const result = await launchExercise(env.DB, exercise.world_id, player.id, squad, exercise, mine, now, newId);
    if (!result.ok) return fail(409, result.error);
    return json({arrivesAt: result.arrivesAt, seconds: result.seconds, kind: 'exercise'});
  }

  // Where your own power comes from: the same inputs worker/power.ts sums,
  // itemised per asset and per source (shared/powerBreakdown.ts).
  if (endpoint === 'GET /api/power') {
    const now = Date.now();
    const [owned, base, board, systems] = await Promise.all([
      ensureRoster(env.DB, player.id, now),
      readBase(env.DB, player.id, now),
      readSquads(env.DB, player.id),
      readSystems(env.DB, player.id),
    ]);
    return json(powerBreakdown(owned, base.levels, board, systems));
  }

  if (endpoint === 'POST /api/profile') return handleEditProfile(request, env, player);

  if (endpoint === 'POST /api/profile/portrait') return handlePortrait(request, env, player);

  if (endpoint === 'GET /api/cosmetics') return handleCosmetics(env, player);

  if (endpoint === 'POST /api/cosmetics/equip') return handleEquip(request, env, player);

  if (endpoint === 'GET /api/world') return handleWorld(request, env, player);

  if (endpoint === 'POST /api/world/move') return handleMove(request, env, player);

  if (endpoint === 'POST /api/rally/set') return handleSetRally(request, env, player);

  if (endpoint === 'POST /api/rally') return handleRally(env, player);

  if (endpoint === 'GET /api/battles') return handleBattles(request, env, player);

  if (endpoint === 'GET /api/battle') return handleBattle(request, env, player);

  return fail(404, 'No such endpoint.');
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await route(request, env, ctx);
    } catch (error) {
      return serverError(error, env);
    }
  },
} satisfies ExportedHandler<Env>;
