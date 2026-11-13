import { describe, expect, it } from 'vitest';
import { computeOrlandoTimeOfDay, mapWmoToAtmosphere } from '@/lib/orlando-sky';

describe('orlando-sky solar and WMO weather mapping', () => {
  it('maps 06:45 EDT sunrise in Orlando to dawn range with positive solar azimuth', () => {
    // June 15, 06:45 EDT = 10:45 UTC
    const dawnDate = new Date('2026-06-15T10:45:00Z');
    const result = computeOrlandoTimeOfDay(dawnDate);

    expect(result.timeOfDay).toBeGreaterThanOrEqual(0.05);
    expect(result.timeOfDay).toBeLessThan(0.25);
    expect(result.localTimeLabel).toContain('6:45');
    expect(Math.hypot(...result.sunDirection)).toBeCloseTo(1, 5);
  });

  it('maps solar noon to bright midday elevation', () => {
    // June 15, 13:25 EDT = 17:25 UTC
    const noonDate = new Date('2026-06-15T17:25:00Z');
    const result = computeOrlandoTimeOfDay(noonDate);

    expect(result.timeOfDay).toBeGreaterThanOrEqual(0.32);
    expect(result.timeOfDay).toBeLessThanOrEqual(0.5);
    expect(result.sunDirection[1]).toBeGreaterThan(0.75);
  });

  it('maps 16:15 EDT afternoon squall and WMO 95 thunderstorm cleanly', () => {
    // June 15, 16:15 EDT = 20:15 UTC
    const afternoonDate = new Date('2026-06-15T20:15:00Z');
    const solar = computeOrlandoTimeOfDay(afternoonDate);
    expect(solar.timeOfDay).toBeGreaterThanOrEqual(0.48);
    expect(solar.timeOfDay).toBeLessThanOrEqual(0.68);

    const storm = mapWmoToAtmosphere(95, 95, 4.2);
    expect(storm.stormIntensity).toBeGreaterThanOrEqual(0.85);
    expect(storm.stormIntensity).toBeLessThanOrEqual(1);
    expect(storm.conditionLabel.toLowerCase()).toContain('thunderstorm');
  });

  it('maps 23:00 night in Orlando to timeOfDay >= 0.88 and sun below horizon', () => {
    // Nov 12, 23:00 EST = Nov 13 04:00 UTC
    const nightDate = new Date('2026-11-13T04:00:00Z');
    const result = computeOrlandoTimeOfDay(nightDate);

    expect(result.timeOfDay).toBeGreaterThanOrEqual(0.88);
    expect(result.sunDirection[1]).toBeLessThan(0);
    expect(Math.hypot(...result.sunDirection)).toBeCloseTo(1, 5);
  });

  it('maps clear sky and rain WMO codes within 0..1 bounds', () => {
    const clear = mapWmoToAtmosphere(0, 5, 0);
    expect(clear.stormIntensity).toBeLessThan(0.1);
    expect(clear.conditionLabel).toBe('Clear Sky');

    const rain = mapWmoToAtmosphere(63, 85, 2.5);
    expect(rain.stormIntensity).toBeGreaterThan(0.5);
    expect(rain.stormIntensity).toBeLessThanOrEqual(1);
    expect(rain.conditionLabel).toBe('Rain');
  });
});
