import { describe, expect, it } from 'vitest';
import { dependencyLabel, formatCountdown, formatPercentage, heartbeatTone } from './format';

const now = Date.parse('2026-10-23T10:00:00.000Z');

describe('formatCountdown', () => {
  it('shows minutes and seconds below one hour', () => {
    expect(formatCountdown('2026-10-23T10:01:30.000Z', now)).toBe('01:30');
  });

  it('shows hours and minutes for longer windows', () => {
    expect(formatCountdown('2026-10-23T12:03:00.000Z', now)).toBe('02:03');
  });

  it('does not show a negative countdown after expiry', () => {
    expect(formatCountdown('2026-10-23T09:59:00.000Z', now)).toBe('00:00');
  });
});

describe('heartbeatTone', () => {
  it('matches the configured heartbeat age thresholds', () => {
    expect(heartbeatTone(new Date(now - 29_000).toISOString(), now)).toBe('green');
    expect(heartbeatTone(new Date(now - 30_000).toISOString(), now)).toBe('amber');
    expect(heartbeatTone(new Date(now - 60_000).toISOString(), now)).toBe('amber');
    expect(heartbeatTone(new Date(now - 61_000).toISOString(), now)).toBe('red');
    expect(heartbeatTone(null, now)).toBe('muted');
  });
});

describe('dashboard formatting helpers', () => {
  it('maps water and fuel dependency to clear operator language', () => {
    expect(dependencyLabel('both')).toBe('Water + fuel');
  });

  it('handles empty totals and clamps ratios to a percentage range', () => {
    expect(formatPercentage(0, 0)).toBe(0);
    expect(formatPercentage(1, 4)).toBe(25);
    expect(formatPercentage(8, 4)).toBe(100);
  });
});
