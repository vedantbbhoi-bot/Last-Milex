import type { Dependency } from './types/domain';

export function formatQuantity(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.max(0, value));
}

export function formatCountdown(expiresAt: string | null, now = Date.now()): string {
  if (!expiresAt) return '—';
  const seconds = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

export function heartbeatTone(heartbeatAt: string | null, now = Date.now()): 'green' | 'amber' | 'red' | 'muted' {
  if (!heartbeatAt) return 'muted';
  const elapsed = Math.max(0, (now - new Date(heartbeatAt).getTime()) / 1000);
  if (elapsed < 30) return 'green';
  if (elapsed <= 60) return 'amber';
  return 'red';
}

export function heartbeatAge(heartbeatAt: string | null, now = Date.now()): number | null {
  return heartbeatAt ? Math.max(0, Math.floor((now - new Date(heartbeatAt).getTime()) / 1000)) : null;
}

export function dependencyLabel(dependency: Dependency): string {
  return ({ none: 'No dependency', water: 'Water required', fuel: 'Fuel required', both: 'Water + fuel' })[dependency];
}

export function formatPercentage(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((numerator / denominator) * 100)));
}

export function relativeAge(isoDate: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - new Date(isoDate).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}
