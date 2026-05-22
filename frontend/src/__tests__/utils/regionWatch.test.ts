import { describe, it, expect } from 'vitest';
import { inBbox } from '@/utils/regionWatch';
import type { WatchRegion } from '@/types/dashboard';

describe('inBbox', () => {
  it('returns false when lat or lng is null or undefined', () => {
    const region: WatchRegion = {
      mode: 'country',
      label: 'France',
      south: 41.3,
      north: 51.1,
      west: -5.2,
      east: 9.6
    };
    expect(inBbox(null, 5.0, region)).toBe(false);
    expect(inBbox(45.0, null, region)).toBe(false);
    expect(inBbox(undefined, 5.0, region)).toBe(false);
    expect(inBbox(45.0, undefined, region)).toBe(false);
  });

  it('returns true when coordinate is inside standard bounding box', () => {
    // Metropolitan France
    const region: WatchRegion = {
      mode: 'country',
      label: 'France',
      south: 41.3,
      north: 51.1,
      west: -5.2,
      east: 9.6
    };
    // Paris is at approx 48.85, 2.35
    expect(inBbox(48.85, 2.35, region)).toBe(true);
    // Nice is at approx 43.7, 7.26
    expect(inBbox(43.7, 7.26, region)).toBe(true);
  });

  it('returns false when coordinate is outside standard bounding box', () => {
    // Metropolitan France
    const region: WatchRegion = {
      mode: 'country',
      label: 'France',
      south: 41.3,
      north: 51.1,
      west: -5.2,
      east: 9.6
    };
    // London is at approx 51.5, -0.12 (too far north)
    expect(inBbox(51.5, -0.12, region)).toBe(false);
    // New York is at approx 40.71, -74.0 (too far west/south)
    expect(inBbox(40.71, -74.0, region)).toBe(false);
  });

  it('handles antimeridian crossing correctly (west > east)', () => {
    // A mock region that crosses the antimeridian.
    // E.g., from 170 degrees (west) to -170 degrees (east), i.e. crossing 180/-180.
    const region: WatchRegion = {
      mode: 'country',
      label: 'Antimeridian Region',
      south: -10,
      north: 10,
      west: 170,
      east: -170
    };

    // Point in Eastern Hemisphere close to antimeridian (e.g. 175) -> inside
    expect(inBbox(0, 175, region)).toBe(true);
    // Point in Western Hemisphere close to antimeridian (e.g. -175) -> inside
    expect(inBbox(0, -175, region)).toBe(true);
    // Exactly at boundaries
    expect(inBbox(0, 170, region)).toBe(true);
    // Point outside (e.g. 0) -> outside
    expect(inBbox(0, 0, region)).toBe(false);
    // Point outside (e.g. 160) -> outside
    expect(inBbox(0, 160, region)).toBe(false);
    // Point outside (e.g. -160) -> outside
    expect(inBbox(0, -160, region)).toBe(false);
  });
});
