import type { StackLevel } from './stack-types';
import { vehicleByKey, vehicleForLevel, type VehicleDef } from './stack-vehicles';
import { levelForRoute, vehicleLevelForRoute, type StackRoute } from './stack-progress';

/** Sedan rides are drawn from three sprites; every other ride is a single rear-view sprite. */
export const SEDAN_ART = ['vehicles/sedan_v1_body', 'vehicles/sedan_v1_trunk', 'vehicles/sedan_v1_lid'] as const;

/** The ride a route shows (`?vehicle=` may force one for checks). */
export function rideForRoute(route: StackRoute, forced?: string | null, now: Date = new Date()): {def: VehicleDef; displayName: string} {
  const forcedDef = forced ? vehicleByKey(forced) : undefined;
  return forcedDef ? {def: forcedDef, displayName: forcedDef.name} : vehicleForLevel(vehicleLevelForRoute(route, now));
}

/**
 * Every image a level shows before the first tap: the night backdrop, the ride and all goods the
 * board (and mom) can deal. The pile waits for these so no card ever starts as a text placeholder.
 */
export function stackArtFiles(level: StackLevel, ride: VehicleDef): string[] {
  const kinds = new Set<string>([...level.items.map(item => item.key), ...level.cards.map(card => card.kind)]);
  return [
    'ui/bg_night',
    ...(ride.art ? [ride.art] : SEDAN_ART),
    ...[...kinds].sort().map(kind => `items/${kind}`),
  ];
}

/** Files for a route without building its page (home uses this to prefetch level 1 and the saved level). */
export function stackArtFilesForRoute(route: StackRoute, forced?: string | null, now: Date = new Date()): string[] {
  return stackArtFiles(levelForRoute(route, now), rideForRoute(route, forced, now).def);
}
