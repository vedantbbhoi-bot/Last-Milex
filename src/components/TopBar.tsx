import { Activity, KeyRound, LogOut, PackageCheck } from 'lucide-react';
import type { Profile } from '../lib/types/domain';

type ConnectionTone = 'live' | 'syncing' | 'stale' | 'offline';

interface Props {
  profile: Profile;
  connectionLabel: string;
  connectionTone: ConnectionTone;
  onSetPassword: () => void;
  onSignOut: () => void;
}

export function TopBar({ profile, connectionLabel, connectionTone, onSetPassword, onSignOut }: Props) {
  return (
    <header className="topbar">
      <div className="topbar-brand"><span className="brand-glyph small"><PackageCheck size={18} strokeWidth={1.8} /></span><span className="brand-name">LAST-MILE<span className="brand-x">X</span></span><span className="brand-divider" /><span className="brand-sub">SPOILAGE TRAP</span></div>
      <div className="topbar-right"><span className={`connection-pill is-${connectionTone}`}><Activity size={13} aria-hidden="true" />{connectionLabel}</span><span className="role-tag">{profile.role.toUpperCase()}</span><span className="user-name">{profile.display_name || 'Operator'}</span><button className="icon-button" type="button" onClick={onSetPassword} aria-label="Set or change password" title="Set or change password"><KeyRound size={15} /></button><button className="icon-button" type="button" onClick={onSignOut} aria-label="Sign out" title="Sign out"><LogOut size={16} /></button></div>
    </header>
  );
}
