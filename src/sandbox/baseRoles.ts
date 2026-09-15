/**
 * What each building on the live base board does in the practice sandbox.
 * Pure data, so tests can check every board building is accounted for.
 */
import {BOARD_BUILDINGS} from '../../shared/base';

/** What a tap on the base opens. */
export type BaseTarget =
  | {kind: 'bay'}
  | {kind: 'repair'}
  | {kind: 'hangar'; assetId: string | null}
  | {kind: 'ops'}
  | {kind: 'season'}
  | {kind: 'record'}
  | {kind: 'command'}
  | {kind: 'world'}
  | {kind: 'info'; buildingId: string};

/**
 * Which buildings run a sandbox function. Every building on the live board is
 * listed: a function, or an honest "not in the practice sandbox".
 */
export const BUILDING_ROLE: Record<string, {target: BaseTarget; role: string} | null> = {
  fabrication_shop: {target: {kind: 'bay'}, role: 'Robot Bay'},
  recovery_yard: {target: {kind: 'repair'}, role: 'Repairs'},
  armour_hub: {target: {kind: 'hangar', assetId: 'm1a2'}, role: 'Hangar: Abrams'},
  rotary_hub: {target: {kind: 'hangar', assetId: 'mi35m'}, role: 'Hangar: Hind'},
  drone_hub: {target: {kind: 'hangar', assetId: 'rq4'}, role: 'Hangar: Global Hawk'},
  tactical_operations_center: {target: {kind: 'season'}, role: 'Season 1 Events'},
  signals_center: {target: {kind: 'record'}, role: 'Reports'},
  fuel_point: null,
  garrison_barracks: null,
  quartermaster_warehouse: null,
  depot: null,
  engineer_support_yard: null,
  alliance_trading_post: null,
  artillery_hub: null,
  fixed_wing_hub: null,
};

export function buildingLabel(id: string): string {
  const b = BOARD_BUILDINGS.find((x) => x.id === id);
  return b?.name ?? id;
}

