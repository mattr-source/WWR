/**
 * Thin client for the game API.
 *
 * Every value returned here was decided by the server. Nothing in this file
 * computes game state - it only reads what it is told, which is the whole
 * point of moving the rules server-side.
 */

import type {CosmeticItem, CosmeticSlot, Loadout} from '../../shared/cosmetics';
import type {Placement} from '../../shared/base';
import type {BattleDetail, BattleSummary} from '../../shared/battles';
import type {Deployment, MarchKind} from '../../shared/march';
import type {PackageKey, Packages} from '../../shared/upgrades';
import type {CombatSystemLane, CombatSystems} from '../../shared/combatSystems';
import type {PowerBreakdown} from '../../shared/powerBreakdown';
import type {Lane, Reward} from '../../shared/season1Ops';
import type {ExerciseView} from '../../shared/exercises';
import type {ScoreBreakdown} from '../../shared/arena';
import type {CombatEvent, CombatantSpec} from '../../shared/combat';
import type {BalanceProfileRef} from '../../shared/balance';
import type {BuildingLevels} from '../../shared/buildings';

export interface ChatMessage {
  id: string;
  author: string;
  body: string;
  createdAt: number;
  rank: 'leader' | 'officer' | 'member' | null;
  hasPortrait: number;
  /** The language it was typed in. */
  lang: string;
  /** Present when the reader's language differs and a translation exists. */
  translated: string | null;
  /** The message this one answers, when it answers one. */
  replyTo: string | null;
  replyAuthor: string | null;
  replyBody: string | null;
}

export interface BugReportInput {
  body: string;
  screen: string;
  build: string;
  viewport: string;
  console: string[];
}

export interface PendingMention {
  messageId: string;
  channel: string;
  createdAt: number;
  author: string;
  body: string;
}

export interface ChatChannels {
  channels: {server: string | null; alliance: string | null; leadership: string | null};
  threads: Array<{channel: string; other: string; updatedAt: number}>;
  groups: Array<{id: string; name: string; members: number; channel: string}>;
  unread: Record<string, number>;
  /** The most recent message in each channel, for previews. */
  latest: Record<string, {author: string; body: string; createdAt: number}>;
  rank: 'leader' | 'officer' | 'member' | null;
  serverTime: number;
}

export interface AllianceSummary {
  id: string;
  tag: string;
  name: string;
  description: string | null;
  openJoin: boolean;
  members: number;
  emblemTint: string;
  hasCrest: boolean;
  /** Callsign of whoever runs it. Null only if the leader row is missing. */
  leader: string | null;
  /** Every member's power added together. */
  power: number;
}

export interface AllianceMember {
  username: string;
  rank: 'leader' | 'officer' | 'member';
  power: number;
  commandPost: number;
  joinedAt: number;
  portrait: {glyph: string; tint: string; hasImage: boolean};
}

export interface AllianceView {
  alliance: {
    id: string;
    tag: string;
    name: string;
    description: string | null;
    homeWorldId: number;
    openJoin: boolean;
    createdAt: number;
    capacity: number;
    emblemTint: string;
    hasCrest: boolean;
  } | null;
  rank?: 'leader' | 'officer' | 'member';
  roster?: AllianceMember[];
  applications?: Array<{username: string; createdAt: number}>;
  applied?: Array<{tag: string; name: string}>;
}

export interface Profile {
  username: string;
  portrait: {glyph: string; tint: string; hasImage: boolean};
  motto: string | null;
  country: string;
  language: string;
  homeWorldId: number | null;
  power: number;
  commandPost: number;
  baseName: string;
  skin: string;
  alliance: {tag: string; name: string} | null;
  plot: {x: number; y: number} | null;
  joinedAt: number | null;
}

export type ResourceKind = 'fuel' | 'steel' | 'munitions' | 'alloy';
export type Resources = Record<ResourceKind, number>;

export const RESOURCE_ORDER: ResourceKind[] = ['fuel', 'steel', 'munitions', 'alloy'];

export interface BuildingView {
  kind: string;
  name: string;
  blurb: string;
  level: number;
  maxLevel: number;
  canUpgrade: boolean;
  blockedByCommandPost: boolean;
  nextCost: Resources | null;
  nextDurationMs: number | null;
}

export interface BaseView {
  /** The server's clock when it answered. Offsets are measured against this. */
  serverTime: number;
  name: string;
  skin: string;
  loadout: Loadout;
  resources: Resources;
  productionPerHour: Resources;
  storageCap: number;
  /** The Command Center's level - the Base Level. */
  baseLevel: number;
  /** Construction, shield and guide state - the shield badge and the ring. */
  season1?: SeasonState;
  justCompleted: {kind: string; level: number} | null;
  buildings: BuildingView[];
  job: {kind: string; toLevel: number; startedAt: number; completesAt: number} | null;
  wallet: Wallet;
  /** Where each board building stands. Resolved server-side; never empty. */
  placements: Placement[];
}

export interface SkinSpec {
  id: string;
  name: string;
  blurb: string;
  palette: {ground: string; structure: string; accent: string};
}

export interface PlacedBase {
  x: number;
  y: number;
  skin: string;
  username: string;
  level: number;
  /** The instant its shield ends, while one is up. */
  shieldUntil: number | null;
  /** A Dominion outpost a solo commander may take a neutral contract against. */
  contract?: boolean;
  worldId: number;
  /** Home world, not current world - what "same server" means in an event. */
  homeWorldId: number | null;
  /** Whose colours they fly. Null when they belong to no alliance. */
  allianceId: string | null;
  /** The equipped cosmetic layers, sent per base so the map can draw them. */
  banner: string;
  emblem: string;
  lights: string;
  decal: string;
}

export interface WorldView {
  viewport: {x: number; y: number; w: number; h: number};
  world: {id: number; name: string; kind: string; extent: number; closesAt: number | null};
  worlds: Array<{id: number; name: string; kind: string}>;
  you: {
    username: string;
    plot: {x: number; y: number} | null;
    homeWorldId: number | null;
    allianceId: string | null;
    rank: string | null;
    /** Whether this player may plant the marker. Decided by the server. */
    maySetRally: boolean;
    /** Milliseconds until they may answer one; 0 when they may now. */
    rallyCooldownMs: number;
    /** Every squad of yours that is not at home, and what it is doing. */
    deployments: Deployment[];
  };
  skins: Record<string, SkinSpec>;
  bases: PlacedBase[];
  /** The alliance's marker, when there is one in the world being viewed. */
  rally: RallyPoint | null;
  /** Squads in transit, so a defender can see what is coming. */
  marches: MarchView[];
  /** Today's daily map exercises - yours alone, on your home world. */
  exercises: ExerciseView[];
  /** Launched Alliance Convoys crossing this world, drawn as moving formations. */
  convoys: ConvoyOnMap[];
  /** The server's clock at the moment this was built. */
  serverTime: number;
}

export interface MarchView {
  id: string;
  attacker: string;
  defender: string;
  squad: string;
  from: {x: number; y: number};
  to: {x: number; y: number};
  departedAt: number;
  arrivesAt: number;
  mine: boolean;
  incoming: boolean;
  /**
   * What the column is for. An attack and a reinforcement look different on
   * the map on purpose - an alliance member watching a friendly squad cross
   * their plot should not have to read the name to know it is not an attack -
   * and a return leg is drawn dimly because there is nothing left to decide
   * about it.
   */
  kind: MarchKind;
}

/** What a player is holding, spendable on Service Rank and the four packages. */
export interface Wallet {
  /** Bought. Never spent first by default. */
  tokens: number;
  /** Earned. */
  credits: number;
}

export interface OwnedAsset {
  assetId: string;
  /** Displays as Service Rank. Permanent - the one thing a reset cannot undo. */
  level: number;
  packages: Packages;
  /** Command Credits sunk into the packages, and so refunded in full on a reset. */
  packageCredits: number;
  /** Hit points left, 0-1. Below 1 it fights and marches weaker; 0 is disabled. */
  hp: number;
  /** When its repair finishes, while one runs. */
  repairEndsAt: number | null;
}

export interface UpgradeResponse {
  ok: true;
  wallet: Wallet;
  asset: {
    asset_id: string;
    level: number;
    pkg_armament: number;
    pkg_protection: number;
    pkg_propulsion: number;
    pkg_electronics: number;
    pkg_credits: number;
  };
}

export interface SquadView {
  owned: OwnedAsset[];
  wallet: Wallet;
  squads: Record<string, Array<string | null>>;
  power: Record<string, number>;
  buildings: {motor_pool: number; airfield: number; barracks: number};
  /** Squads in the field. Locked: what marched out is what fights. */
  away: string[];
  /** The Command Center and asset-building levels, and the job running. */
  base: BaseLevelsView;
  /** Construction, shield and guide state. */
  season1: SeasonState;
  /** Task Force Delta: bought, or earned. */
  deltaOpen: boolean;
  /** Every Task Force's Combat Systems lanes (shared/combatSystems.ts). */
  systems: Record<string, CombatSystems>;
}

export interface DailyView {
  season: number;
  week: number;
  dayKey: string;
  resetAt: number;
  lanes: Array<{lane: Lane; done: boolean; doneAt: number | null; reward: Reward}>;
  doneCount: number;
  lanesForCache: number;
  cache: {reward: Reward; claimable: boolean; claimedAt: number | null};
  industryMs: number;
}

export interface ArenaSideResult {
  name: string;
  power: number;
  losses: number;
  strength: number;
  units: Array<{assetId: string; name: string; damaged: boolean; remaining: number}>;
  modifiers: string[];
}

/** The fight as the server resolved and stored it; the replay plays it. */
export interface ArenaBattle {
  opponent: string;
  benchmark: CombatantSpec[];
  events: CombatEvent[];
  rounds: Array<{index: number; summary: string; attackerDamage: number; defenderDamage: number}>;
  notes: string[];
  attacker: ArenaSideResult;
  defender: ArenaSideResult;
  seed: number;
}

export interface ArenaAttempt {
  id: string;
  n: number;
  squad: string;
  score: number;
  outcome: string;
  breakdown: ScoreBreakdown | null;
  units: CombatantSpec[];
  battle: ArenaBattle | null;
  createdAt: number;
  dayKey: string;
}

export interface ArenaSquadView {
  slots: Array<string | null>;
  power: number;
  blocked: string | null;
  systems: {fire_control: number; survivability: number; sustainment: number};
  wallet: Wallet;
  commandCenter: number;
  season: number;
  roster: Array<{
    assetId: string;
    level: number;
    hp: number;
    repairing: boolean;
    away: boolean;
    power: number;
    taskForce: string | null;
    unavailable: string | null;
  }>;
  taskForces: Record<string, Array<string | null>>;
}

export interface ArenaBoardRow {
  username: string;
  score: number;
  best: number;
  attempts: number;
  reachedAt: number;
  rank: number;
}

export interface ArenaView {
  phase: 'pre' | 'proving_ground' | 'head_to_head' | 'offseason';
  seasonWeek: number;
  dayKey: string;
  resetAt: number;
  closesAt: number;
  attemptsUsed: number;
  attemptsPerDay: number;
  force: {squad: string; power: number; units: Array<{assetId: string; level: number; slot: number}>} | null;
  forceBlocked: string | null;
  benchmark: {
    units: Array<{assetId: string; category: string; level: number}>;
    power: number;
    hardpoints: Array<{index: number; name: string; category: string; level: number}>;
    name: string;
  };
  attempts: ArenaAttempt[];
  daily: ArenaBoardRow[];
  myDaily: {rank: number; best: number} | null;
  weekly: ArenaBoardRow[];
  myWeekly: {rank: number; score: number; attempts: number} | null;
  lastSettlement: {at: number; ranked: number} | null;
}

export interface ConvoyRoutePoint {
  x: number;
  y: number;
}

export interface ConvoyGuardAsset {
  slot: string;
  assetId: string;
  level: number;
}

export interface ConvoyOnMap {
  id: string;
  tag: string;
  route: {from: ConvoyRoutePoint; to: ConvoyRoutePoint};
  startsAt: number;
  guard: ConvoyGuardAsset[];
}

export interface ConvoyView {
  id: string;
  kind: 'daily' | 'contract';
  state: 'joining' | 'launched';
  startsAt: number;
  locksAt: number;
  route: {from: ConvoyRoutePoint; to: ConvoyRoutePoint};
  trucks: number[];
  capacity: number;
  myTruck: number | null;
  guardian: {username: string; isMe: boolean} | null;
  guard: ConvoyGuardAsset[] | null;
  guardConfigured: boolean;
}

export interface AllianceConvoyView {
  inAlliance: boolean;
  isLeadership: boolean;
  members: number;
  minMembers: number;
  contractTokens: number;
  daily: ConvoyView | null;
  contract: ConvoyView | null;
  roster: Array<{username: string}>;
  myAssets: Array<{assetId: string; level: number; ready: boolean; reason: string | null}>;
}
export interface WarfrontStandingRow {
  rank: number;
  allianceId: string;
  tag: string;
  name: string;
  total: number;
  memberSum: number;
  contributors: number;
  activeMembers: number;
  activeBonus: number;
  coordinatedOps: number;
  division: string;
  mine: boolean;
}

export interface WarfrontView {
  phase: 'pre' | 'proving_ground' | 'head_to_head' | 'offseason';
  seasonWeek: number;
  weekKey: string;
  closesAt: number;
  resetAt: number;
  today: {
    earned: Record<'assault' | 'operations' | 'support', number>;
    counted: Record<'assault' | 'operations' | 'support', number>;
    score: number;
    caps: Record<'assault' | 'operations' | 'support', number>;
    dailyCap: number;
  };
  weekScore: number;
  weekForAlliance: number;
  membership: {allianceId: string; tag: string; name: string; joinedAt: number; eligibleAt: number | null; eligible: boolean} | null;
  standings: WarfrontStandingRow[];
  mine: {
    rank: number;
    score: {memberSum: number; contributors: number; activeMembers: number; activeBonus: number; coordinatedOps: number; coordinatedBonus: number; total: number; reachedAt: number};
    division: {name: string; label: string; pool: Reward | null; member: Reward; memberThreshold: number};
    members: Array<{username: string; score: number; active: boolean; me: boolean}>;
  } | null;
  treasury: {
    credits: number;
    fuel: number;
    steel: number;
    munitions: number;
    alloy: number;
    ledger: Array<{id: string; kind: string; credits: number; fuel: number; steel: number; munitions: number; alloy: number; detail: string; createdAt: number}>;
  } | null;
  recent: Array<{id: string; metric: 'assault' | 'operations' | 'support'; points: number; source: string; detail: string; countedFor: string | null; createdAt: number}>;
  lastWeek: Array<{allianceId: string; rank: number; tag: string; name: string; score: number; contributors: number; division: string; mine: boolean}>;
}

export interface RewardGrant {
  id: string;
  source: string;
  season: number;
  week: number;
  dayKey: string;
  credits: number;
  fuel: number;
  steel: number;
  munitions: number;
  alloy: number;
  detail: string;
  createdAt: number;
}

export interface DevStatus {
  enabled: boolean;
  account: {username: string; id: string; role: string} | null;
  tracks: Array<{id: string; displayName: string; category: string; placeholderFrom: number | null}>;
  registryProblems: Array<{track: string; level?: number; problem: string}>;
  recent: Array<{action: string; params: string; at: number}>;
  buildings: string[];
  squads: string[];
}

export interface SeasonState {
  build: {id: string; assetId: string; startedAt: number; completesAt: number} | null;
  shield: {
    until: number | null;
    kind: string | null;
    cooldownUntil: number | null;
    coupons: {h8: boolean; h4: boolean};
  };
  guide: {step: number; enabled: boolean; completed: boolean; tips: string[]};
}

export interface BaseJobView {
  id: string;
  building: string;
  toLevel: number;
  startedAt: number;
  completesAt: number;
}

/** The levelled base: every building's level, the jobs running, the stock. */
export interface BaseLevelsView {
  /** The balance profile the server priced upgrades from (shared/balance.ts); null if misconfigured. */
  balance?: BalanceProfileRef | null;
  levels: BuildingLevels;
  jobs: BaseJobView[];
  queues: number;
  secondTeamAt: number | null;
  resources: Resources;
  productionPerHour: Resources;
  storageCap: number;
  season: number;
  wallet: Wallet;
}

export interface RallyPoint {
  x: number;
  y: number;
  worldId: number;
  setBy: string;
  setAt: number;
}

export interface Player {
  id: string;
  username: string;
  role?: string;
  /** The language the interface is drawn in. Chosen in the profile. */
  language?: string;
}

/** GET /api/trade-post. Everything priced and counted by the server. */
export interface TradePostView {
  serverTime: number;
  wallet: Wallet;
  /** Present only when the website store is configured. No button otherwise. */
  tokenStoreUrl: string | null;
  shelves: Array<{
    shelf: 'weekly' | 'monthly';
    resetAt: number;
    emptyText: string;
    offers: Array<{id: string; kind: string; name: string; description: string; art: string; limit: number; remaining: number}>;
  }>;
  targets: Array<{
    assetId: string;
    code: string;
    name: string;
    level: number;
    eligible: boolean;
    packages: Record<PackageKey, {current: number; target: number; cost: number} | null>;
  }>;
}

export interface TradePostBuyResponse {
  ok: true;
  duplicate: boolean;
  wallet: Wallet;
  remaining: number;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: {'Content-Type': 'application/json', ...(init?.headers ?? {})},
  });

  const raw = await response.text();
  let parsed: unknown = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    // An HTML body means the request never reached the Worker and the static
    // asset fallback answered instead. Say that plainly rather than reporting
    // a confusing JSON parse failure.
    throw new ApiError('The server returned a page instead of data.', response.status);
  }

  if (!response.ok) {
    const message =
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as {error?: unknown}).error === 'string'
        ? (parsed as {error: string}).error
        : `Request failed (${response.status}).`;
    throw new ApiError(message, response.status);
  }
  return parsed as T;
}

export const api = {
  me: () => call<{player: Player}>('/api/me'),
  checkCallsign: (name: string) =>
    call<{available: boolean; reason?: string}>(
      `/api/access/callsign?name=${encodeURIComponent(name)}`,
    ),
  requestAccess: (body: {
    email: string;
    username: string;
    password: string;
    country: string;
    locale: string;
    skin: string;
    ageConfirmed: boolean;
  }) =>
    call<{status: string; message: string}>('/api/access/request', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  login: (username: string, password: string) =>
    call<{player: Player}>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({username, password}),
    }),
  logout: () => call<{ok: true}>('/api/auth/logout', {method: 'POST'}),
  reportBug: (body: BugReportInput) =>
    call<{ok: true; id: string}>('/api/support/report', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  base: () => call<BaseView>('/api/base'),
  arrange: (buildingId: string, padId: string) =>
    call<{placements: Placement[]}>('/api/base/arrange', {
      method: 'POST',
      body: JSON.stringify({buildingId, padId}),
    }),
  world: (x: number, y: number, w: number, h: number, worldId?: number) => {
    const params = new URLSearchParams({x: String(x), y: String(y), w: String(w), h: String(h)});
    if (worldId !== undefined) params.set('world', String(worldId));
    return call<WorldView>(`/api/world?${params.toString()}`);
  },
  move: (x: number, y: number, worldId?: number) =>
    call<{world: {id: number; name: string}; plot: {x: number; y: number}}>('/api/world/move', {
      method: 'POST',
      body: JSON.stringify(worldId === undefined ? {x, y} : {x, y, worldId}),
    }),
  setRally: (x: number, y: number, worldId?: number) =>
    call<{rally: RallyPoint | null}>('/api/rally/set', {
      method: 'POST',
      body: JSON.stringify(worldId === undefined ? {x, y} : {x, y, worldId}),
    }),
  rally: () =>
    call<{world: {id: number; name: string}; plot: {x: number; y: number}; cooldownMs: number}>(
      '/api/rally',
      {method: 'POST'},
    ),
  squads: () => call<SquadView>('/api/squads'),
  season: () => call<SeasonState>('/api/season'),
  buyDelta: (split?: Wallet) =>
    call<SquadView>('/api/squads/delta', {method: 'POST', body: JSON.stringify({split})}),
  repair: (assetId: string | 'all') =>
    call<SquadView>('/api/assets/repair', {method: 'POST', body: JSON.stringify({assetId})}),
  buildAsset: (assetId: string) =>
    call<SquadView>('/api/assets/build', {method: 'POST', body: JSON.stringify({assetId})}),
  applyShield: (kind: string, split?: Wallet) =>
    call<{ok: true; wallet: Wallet; season1: SeasonState}>('/api/shield', {
      method: 'POST',
      body: JSON.stringify({kind, split}),
    }),
  guide: (patch: {step?: number; enabled?: boolean; completed?: boolean; tip?: string}) =>
    call<{ok: true; season1: SeasonState}>('/api/guide', {method: 'POST', body: JSON.stringify(patch)}),

  /**
   * Buy a Service Rank, or fit a package.
   *
   * The target is sent, never the price - the server recomputes the cost from
   * the catalogue and refuses anything else. The split is optional and the
   * server spends Credits first without it.
   */
  baseLevels: () => call<BaseLevelsView>('/api/base/levels'),
  startLevel: (building: string) =>
    call<BaseLevelsView>('/api/base/level', {method: 'POST', body: JSON.stringify({building})}),
  buyResource: (resource: string, amount: number, split?: Wallet) =>
    call<BaseLevelsView & {bought: number}>('/api/depot/resources', {
      method: 'POST',
      body: JSON.stringify({resource, amount, split}),
    }),
  buySecondTeam: (split?: Wallet) =>
    call<BaseLevelsView>('/api/base/second-team', {method: 'POST', body: JSON.stringify({split})}),
  rankUp: (assetId: string, target: number, split?: Wallet) =>
    call<UpgradeResponse>('/api/assets/rank', {
      method: 'POST',
      body: JSON.stringify({assetId, target, split}),
    }),
  fitPackage: (assetId: string, pkg: PackageKey, target: number, split?: Wallet) =>
    call<UpgradeResponse>('/api/assets/package', {
      method: 'POST',
      body: JSON.stringify({assetId, package: pkg, target, split}),
    }),
  tradePost: () => call<TradePostView>('/api/trade-post'),
  tradePostBuy: (body: {purchaseId: string; offerId: string; assetId: string; package: PackageKey; route: 'tokens' | 'credits'}) =>
    call<TradePostBuyResponse>('/api/trade-post/buy', {method: 'POST', body: JSON.stringify(body)}),
  power: () => call<PowerBreakdown>('/api/power'),
  /** Development-only progression seeds; 404 anywhere but the test realm. */
  devStatus: () => call<DevStatus>('/api/dev/progression'),
  devAction: (body: Record<string, unknown>) =>
    call<{ok: true; message: string; status: DevStatus}>('/api/dev/progression', {method: 'POST', body: JSON.stringify(body)}),
  systemUp: (squad: string, lane: CombatSystemLane, target: number, split?: Wallet) =>
    call<{ok: true; wallet: Wallet; systems: Record<string, CombatSystems>}>('/api/squads/systems', {
      method: 'POST',
      body: JSON.stringify({squad, lane, target, split}),
    }),
  resetPackages: (assetId: string) =>
    call<UpgradeResponse>('/api/assets/reset', {
      method: 'POST',
      body: JSON.stringify({assetId}),
    }),
  attack: (squad: string, x: number, y: number, contract = false) =>
    call<{arrivesAt: number; seconds: number}>('/api/attack', {
      method: 'POST',
      body: JSON.stringify({squad, x, y, contract}),
    }),
  daily: () => call<DailyView>('/api/ops/daily'),
  arena: () => call<ArenaView>('/api/arena'),
  warfront: () => call<WarfrontView>('/api/warfront'),
  convoy: () => call<AllianceConvoyView>('/api/convoy'),
  convoyJoin: (convoyId: string, truck: number) => call<{ok: true; view: AllianceConvoyView}>('/api/convoy/join', {method: 'POST', body: JSON.stringify({convoyId, truck})}),
  convoyLeave: (convoyId: string) => call<{ok: true; view: AllianceConvoyView}>('/api/convoy/leave', {method: 'POST', body: JSON.stringify({convoyId})}),
  convoyContract: () => call<{ok: true; wallet: Wallet; view: AllianceConvoyView}>('/api/convoy/contract', {method: 'POST', body: '{}'}),
  convoyGuardian: (convoyId: string, username: string) => call<{ok: true; view: AllianceConvoyView}>('/api/convoy/guardian', {method: 'POST', body: JSON.stringify({convoyId, username})}),
  convoyGuard: (convoyId: string, guard: Array<{slot: string; assetId: string}>) => call<{ok: true; view: AllianceConvoyView}>('/api/convoy/guard', {method: 'POST', body: JSON.stringify({convoyId, guard})}),
  arenaSquad: () => call<ArenaSquadView>('/api/arena/squad'),
  arenaSaveSquad: (slots: Array<string | null>) => call<ArenaSquadView>('/api/arena/squad', {method: 'POST', body: JSON.stringify({slots})}),
  arenaReport: (id: string) => call<{attempt: ArenaAttempt}>(`/api/arena/report?id=${encodeURIComponent(id)}`),
  arenaReports: () => call<{attempts: ArenaAttempt[]}>('/api/arena/reports'),
  arenaAttempt: () =>
    call<{ok: true; attempt: ArenaAttempt; fieldCache: boolean; fullEngagement: boolean; view: ArenaView}>('/api/arena/attempt', {
      method: 'POST',
      body: '{}',
    }),
  exercise: (id: string, squad: string) =>
    call<{arrivesAt: number; seconds: number}>('/api/ops/exercise', {method: 'POST', body: JSON.stringify({id, squad})}),
  claimDailyCache: () => call<{ok: true; reward: Reward; daily: DailyView}>('/api/ops/daily/claim', {method: 'POST', body: '{}'}),
  rewardGrants: () => call<{grants: RewardGrant[]}>('/api/ops/grants'),
  recall: (squad: string) =>
    call<{arrivesAt: number}>('/api/recall', {
      method: 'POST',
      body: JSON.stringify({squad}),
    }),
  assignSlot: (squad: string, slot: number, assetId: string | null) =>
    call<SquadView>('/api/squads/assign', {
      method: 'POST',
      body: JSON.stringify({squad, slot, assetId}),
    }),
  moveSlot: (
    from: {squad: string; slot: number},
    to: {squad: string; slot: number},
  ) => call<SquadView>('/api/squads/move', {method: 'POST', body: JSON.stringify({from, to})}),
  battles: (scope: 'mine' | 'alliance', before?: number) => {
    const params = new URLSearchParams({scope});
    if (before !== undefined) params.set('before', String(before));
    return call<{scope: string; battles: BattleSummary[]; retentionDays: number}>(
      `/api/battles?${params.toString()}`,
    );
  },
  battle: (id: string) =>
    call<{summary: BattleSummary; detail: BattleDetail}>(
      `/api/battle?id=${encodeURIComponent(id)}`,
    ),
  chatChannels: () => call<ChatChannels>('/api/chat/channels'),
  chatRead: (channel: string, since?: number) => {
    const params = new URLSearchParams({channel});
    if (since !== undefined) params.set('since', String(since));
    return call<{channel: string; messages: ChatMessage[]; serverTime: number}>(
      `/api/chat?${params.toString()}`,
    );
  },
  chatSend: (channel: string, body: string, replyTo?: string | null) =>
    call<{ok: true; serverTime: number; mentioned: string[]}>('/api/chat', {
      method: 'POST',
      body: JSON.stringify(replyTo ? {channel, body, replyTo} : {channel, body}),
    }),
  chatMentionable: (channel: string) =>
    call<{channel: string; names: string[]}>(
      `/api/chat/mentionable?channel=${encodeURIComponent(channel)}`,
    ),
  chatMentions: () => call<{mentions: PendingMention[]}>('/api/chat/mentions'),
  chatCreateGroup: (name: string) =>
    call<{channel: string; id: string; name: string}>('/api/chat/group', {
      method: 'POST',
      body: JSON.stringify({name}),
    }),
  chatAddToGroup: (groupId: string, username: string) =>
    call<ChatChannels>('/api/chat/group/add', {
      method: 'POST',
      body: JSON.stringify({groupId, username}),
    }),
  chatLeaveGroup: (groupId: string) =>
    call<ChatChannels>('/api/chat/group/leave', {
      method: 'POST',
      body: JSON.stringify({groupId}),
    }),
  chatOpenDm: (username: string) =>
    call<{channel: string; other: string}>('/api/chat/dm', {
      method: 'POST',
      body: JSON.stringify({username}),
    }),
  alliance: () => call<AllianceView>('/api/alliance'),
  browseAlliances: () =>
    call<{homeWorldId: number; capacity: number; alliances: AllianceSummary[]}>(
      '/api/alliance/browse',
    ),
  createAlliance: (body: {
    tag: string;
    name: string;
    description: string;
    openJoin: boolean;
  }) => call<AllianceView>('/api/alliance/create', {method: 'POST', body: JSON.stringify(body)}),
  joinAlliance: (allianceId: string) =>
    call<AllianceView>('/api/alliance/join', {
      method: 'POST',
      body: JSON.stringify({allianceId}),
    }),
  leaveAlliance: (disband = false) =>
    call<AllianceView>('/api/alliance/leave', {
      method: 'POST',
      body: JSON.stringify({disband}),
    }),
  decideApplication: (username: string, accept: boolean) =>
    call<AllianceView>('/api/alliance/decide', {
      method: 'POST',
      body: JSON.stringify({username, accept}),
    }),
  allianceRank: (username: string, action: 'promote' | 'demote' | 'remove' | 'handover') =>
    call<AllianceView>('/api/alliance/rank', {
      method: 'POST',
      body: JSON.stringify({username, action}),
    }),
  setAllianceCrest: (body: {image?: string | null; tint?: string}) =>
    call<AllianceView>('/api/alliance/crest', {method: 'POST', body: JSON.stringify(body)}),
  allianceSettings: (body: {description: string; openJoin: boolean}) =>
    call<AllianceView>('/api/alliance/settings', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  profile: (name: string) =>
    call<{profile: Profile}>(`/api/profile?name=${encodeURIComponent(name)}`),
  saveProfile: (edit: {glyph: string; tint: string; motto: string | null; language: string}) =>
    call<{profile: Profile}>('/api/profile', {
      method: 'POST',
      body: JSON.stringify(edit),
    }),
  setPortrait: (image: string | null) =>
    call<{profile: Profile}>('/api/profile/portrait', {
      method: 'POST',
      body: JSON.stringify({image}),
    }),
  upgrade: (kind: string) =>
    call<BaseView>('/api/base/upgrade', {method: 'POST', body: JSON.stringify({kind})}),
  cosmetics: () =>
    call<{
      slots: CosmeticSlot[];
      items: CosmeticItem[];
      owned: string[];
      loadout: Loadout;
      skinIds: string[];
      skinsOwned: string[];
      skin: string;
    }>('/api/cosmetics'),
  equip: (loadout: Loadout, skin: string) =>
    call<{loadout: Loadout; skin: string}>('/api/cosmetics/equip', {
      method: 'POST',
      body: JSON.stringify({...loadout, skin}),
    }),
};

export function formatDuration(ms: number): string {
  if (ms <= 0) return 'complete';
  const total = Math.ceil(ms / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (days > 0) return `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${minutes}:${pad(seconds)}`;
}

export function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 10_000) return `${(value / 1000).toFixed(1)}K`;
  return Math.floor(value).toLocaleString('en-US');
}

export const RESOURCE_LABEL: Record<ResourceKind, string> = {
  fuel: 'Fuel',
  steel: 'Steel',
  munitions: 'Munitions',
  alloy: 'Alloy',
};
