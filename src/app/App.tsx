import { useState } from 'react';
import { Activity, PackageCheck, RefreshCw, WifiOff } from 'lucide-react';
import { useAuth } from '../features/auth/useAuth';
import { useDashboard } from '../features/auth/useDashboard';
import { PasswordGate } from '../features/auth/MagicLinkGate';
import { SetPasswordForm } from '../features/auth/SetPasswordForm';
import { TopBar } from '../components/TopBar';
import { MetricStrip } from '../components/MetricStrip';
import { AtRiskBanner } from '../components/AtRiskBanner';
import { ShelterBoard } from '../components/ShelterBoard';
import { DonorQueue } from '../features/batches/DonorQueue';
import { RiderCockpit } from '../features/claims/RiderCockpit';
import { FlowMap } from '../features/routing/FlowMap';
import { JudgeDeck } from '../features/judge/JudgeDeck';
import { useConnectivity } from '../lib/useConnectivity';

function formatLastSync(value: string | null): string {
  if (!value) return 'No successful sync in this session';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function App() {
  const auth = useAuth();
  const connectivity = useConnectivity();
  const dashboard = useDashboard(auth.session?.user.id, auth.isDemo);
  const [passwordSetupOpen, setPasswordSetupOpen] = useState(false);

  if (auth.loading) {
    return (
      <main className="loading-screen">
        <span className="brand-glyph"><PackageCheck size={24} /></span>
        <span>Checking saved session…</span>
      </main>
    );
  }

  if (!auth.session) {
    return (
      <PasswordGate
        error={auth.error}
        onSignIn={auth.signInWithPassword}
        isOnline={connectivity.isOnline}
      />
    );
  }

  const profile = dashboard.data.profile;
  if (dashboard.state === 'error' && !profile) {
    const offline = !dashboard.browserOnline;
    return (
      <main className="setup-screen">
        <div className="setup-card">
          <span className="brand-glyph"><PackageCheck size={24} /></span>
          <span className="section-index">{offline ? 'OFFLINE / NO LOCAL SNAPSHOT' : 'DISPATCH DATA UNAVAILABLE'}</span>
          <h1>{offline ? 'No dispatch data is saved on this device.' : 'Could not load dispatch data.'}</h1>
          <p>{offline ? 'The static app shell is available, but operational data has not been cached locally. Reconnect to load the current board.' : 'The session is valid, but the current profile and dispatch board could not be refreshed. Check the connection and retry.'}</p>
          {dashboard.error && <code>{dashboard.error}</code>}
          <button className="primary-button" type="button" disabled={!dashboard.browserOnline} onClick={() => void dashboard.reload()}><RefreshCw size={16} /> Retry data load</button>
          <button className="quiet-button" type="button" onClick={() => void auth.signOut()}>Sign out</button>
        </div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="loading-screen">
        <Activity size={18} /> Preparing your profile…
        <button className="quiet-button" type="button" onClick={() => void dashboard.reload()}>Refresh</button>
      </main>
    );
  }

  const connectionLabel = !dashboard.browserOnline ? 'OFFLINE' : dashboard.error ? 'STALE' : dashboard.realtimeStatus === 'SUBSCRIBED' ? 'LIVE' : 'SYNCING';
  const connectionTone = !dashboard.browserOnline ? 'offline' : dashboard.error ? 'stale' : dashboard.realtimeStatus === 'SUBSCRIBED' ? 'live' : 'syncing';
  const canDispatch = auth.isDemo || (dashboard.browserOnline && dashboard.state === 'ready' && !dashboard.error && dashboard.realtimeStatus === 'SUBSCRIBED');
  const showConnectionNotice = !auth.isDemo && (!dashboard.browserOnline || Boolean(dashboard.error) || dashboard.realtimeStatus !== 'SUBSCRIBED');

  return (
    <main className="app-shell">
      <TopBar
        profile={profile}
        connectionLabel={connectionLabel}
        connectionTone={connectionTone}
        isDemo={auth.isDemo}
        onSetPassword={() => setPasswordSetupOpen(true)}
        onSignOut={() => void auth.signOut()}
        onRefresh={dashboard.reload}
      />
      {showConnectionNotice && (
        <div className="connection-warning connection-status-banner" role="status" aria-live="polite">
          <WifiOff size={15} aria-hidden="true" />
          <span><strong>{!dashboard.browserOnline ? 'Offline — showing the last data loaded in this session.' : dashboard.error ? 'Sync issue — showing the last successful snapshot.' : 'Live updates are not confirmed.'}</strong> Last synced: {formatLastSync(dashboard.lastSyncedAt)}. Dispatch actions are disabled until a fresh snapshot and live updates are confirmed.</span>
          <button className="text-button" type="button" disabled={!dashboard.browserOnline} onClick={() => void dashboard.reload()}>Retry sync</button>
        </div>
      )}
      <div className="dashboard-content">
        <div className="welcome-line">
          <div>
            <span className="section-index">FIELD OPERATIONS / 01</span>
            <h1>Dispatch board<span className="title-period">.</span></h1>
          </div>
          <div className="last-update">
            <span className={dashboard.realtimeStatus === 'SUBSCRIBED' && dashboard.browserOnline ? 'live-dot' : 'status-indicator'} />
            DATA SYNC: {formatLastSync(dashboard.lastSyncedAt)}
            <span className="update-divider">/</span>
            REALTIME: {dashboard.realtimeStatus}
            <span className="update-divider">/</span>
            ROLE: {profile.role.toUpperCase()}
          </div>
        </div>

        <MetricStrip batches={dashboard.data.batches} subBatches={dashboard.data.subBatches} audit={dashboard.data.audit} />
        <AtRiskBanner subBatches={dashboard.data.subBatches} />

        <div className="workbench">
          <div className="left-rail">
            <DonorQueue profile={profile} batches={dashboard.data.batches} subBatches={dashboard.data.subBatches} onRefresh={dashboard.reload} online={canDispatch} />
            <RiderCockpit profile={profile} subBatches={dashboard.data.subBatches} riders={dashboard.data.riders} onRefresh={dashboard.reload} online={canDispatch} />
          </div>
          <FlowMap shelters={dashboard.data.shelters} subBatches={dashboard.data.subBatches} />
          <div className="right-rail">
            <ShelterBoard shelters={dashboard.data.shelters} />
            <div className="operator-note">
              <span className="note-index">FIELD NOTE / 07</span>
              <p>Pickup confirmation re-checks water and fuel at the shelter. A green route is not a promise until the database clears dispatch.</p>
            </div>
          </div>
        </div>

        <JudgeDeck profile={profile} onRefresh={dashboard.reload} />

        <footer className="dashboard-footer">
          <span>LAST-MILEX / COORDINATION CORE</span>
          <span>CLAIMS · EXPIRY · REROUTES ARE DATABASE-OWNED</span>
          <span>BUILD 0.1 / {new Date().getFullYear()}</span>
        </footer>
      </div>

      {passwordSetupOpen && (
        <div className="password-overlay">
          <section className="password-dialog" role="dialog" aria-modal="true" aria-label="Set account password">
            <button className="quiet-button password-close" type="button" onClick={() => setPasswordSetupOpen(false)}>Close</button>
            <SetPasswordForm error={auth.error} onSetPassword={auth.setPassword} />
          </section>
        </div>
      )}
    </main>
  );
}
