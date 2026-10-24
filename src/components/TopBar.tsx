import { Activity, KeyRound, LogOut, PackageCheck, RotateCcw, Sparkles } from 'lucide-react';
import type { Profile, Role } from '../lib/types/domain';
import { demoStore } from '../lib/demoStore';

type ConnectionTone = 'live' | 'syncing' | 'stale' | 'offline';

interface Props {
  profile: Profile;
  connectionLabel: string;
  connectionTone: ConnectionTone;
  isDemo?: boolean;
  onSetPassword: () => void;
  onSignOut: () => void;
  onRefresh?: () => void;
}

export function TopBar({ profile, connectionLabel, connectionTone, isDemo = false, onSetPassword, onSignOut, onRefresh }: Props) {
  const isDemoMode = isDemo || profile.id.startsWith('demo-');

  function handleSwitchRole(role: Role) {
    demoStore.switchRole(role);
    onRefresh?.();
  }

  function handleResetDemo() {
    demoStore.resetToBaseline();
    onRefresh?.();
  }

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="brand-glyph small"><PackageCheck size={18} strokeWidth={1.8} /></span>
        <span className="brand-name">LAST-MILE<span className="brand-x">X</span></span>
        <span className="brand-divider" />
        <span className="brand-sub">SPOILAGE TRAP</span>
        {isDemoMode && (
          <span className="demo-mode-badge" title="Running in interactive Judge Evaluation Demo mode">
            <Sparkles size={12} /> JUDGE DEMO
          </span>
        )}
      </div>

      {isDemoMode && (
        <nav className="role-switcher-nav" aria-label="Demo role selector">
          <span className="role-switcher-label">EVALUATE ROLE:</span>
          <button
            className={`role-tab ${profile.role === 'admin' ? 'active' : ''}`}
            onClick={() => handleSwitchRole('admin')}
            type="button"
            title="Judge & Administrator with stress-testing failure injection deck"
          >
            ⚖️ Judge / Admin
          </button>
          <button
            className={`role-tab ${profile.role === 'donor' ? 'active' : ''}`}
            onClick={() => handleSwitchRole('donor')}
            type="button"
            title="Food Donor view with automated 40-unit batch splitter"
          >
            📦 Donor
          </button>
          <button
            className={`role-tab ${profile.role === 'rider' ? 'active' : ''}`}
            onClick={() => handleSwitchRole('rider')}
            type="button"
            title="Field Rider view with 5-minute dead-man claim & heartbeats"
          >
            🚴 Rider
          </button>
          <button
            className={`role-tab ${profile.role === 'shelter' ? 'active' : ''}`}
            onClick={() => handleSwitchRole('shelter')}
            type="button"
            title="Shelter view with capacity, demand & utility constraints"
          >
            🏠 Shelter
          </button>
        </nav>
      )}

      <div className="topbar-right">
        {isDemoMode && (
          <button
            className="icon-button"
            onClick={handleResetDemo}
            type="button"
            aria-label="Reset demo state"
            title="Reset demo data to initial benchmark"
          >
            <RotateCcw size={14} />
          </button>
        )}
        <span className={`connection-pill is-${connectionTone}`}>
          <Activity size={13} aria-hidden="true" />
          {isDemoMode ? 'LIVE DEMO' : connectionLabel}
        </span>
        <span className="role-tag">{profile.role.toUpperCase()}</span>
        <span className="user-name">{profile.display_name || 'Evaluator'}</span>
        {!isDemoMode && (
          <button className="icon-button" type="button" onClick={onSetPassword} aria-label="Set or change password" title="Set or change password">
            <KeyRound size={15} />
          </button>
        )}
        <button className="icon-button" type="button" onClick={onSignOut} aria-label="Sign out" title="Sign out">
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}
