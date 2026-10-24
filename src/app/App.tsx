import { useAuth } from '../features/auth/useAuth';
import { useDashboard } from '../features/auth/useDashboard';
import { MagicLinkGate } from '../features/auth/MagicLinkGate';
import { TopBar } from '../components/TopBar';
import { MetricStrip } from '../components/MetricStrip';
import { AtRiskBanner } from '../components/AtRiskBanner';
import { ShelterBoard } from '../components/ShelterBoard';
import { DonorQueue } from '../features/batches/DonorQueue';
import { RiderCockpit } from '../features/claims/RiderCockpit';
import { FlowMap } from '../features/routing/FlowMap';
import { JudgeDeck } from '../features/judge/JudgeDeck';
import { Activity, RefreshCw, PackageCheck } from 'lucide-react';

export function App() {
  const auth = useAuth();
  const dashboard = useDashboard(auth.session?.user.id);

  if (auth.loading) return <main className="loading-screen"><span className="brand-glyph"><PackageCheck size={24} /></span><span>Opening dispatch link…</span></main>;
  if (!auth.session) return <MagicLinkGate error={auth.error} onSend={auth.signInWithMagicLink} />;

  const profile = dashboard.data.profile;
  if (dashboard.state === 'error' && !profile) return <main className="setup-screen"><div className="setup-card"><span className="brand-glyph"><PackageCheck size={24} /></span><span className="section-index">DATABASE CONNECTION</span><h1>Dispatch schema isn’t ready.</h1><p>The application can sign you in, but the Supabase tables and access policies are not ready yet.</p><code>{dashboard.error}</code><button className="primary-button" type="button" onClick={() => void dashboard.reload()}><RefreshCw size={16} /> Retry data load</button><button className="quiet-button" type="button" onClick={() => void auth.signOut()}>Sign out</button></div></main>;
  if (!profile) return <main className="loading-screen"><Activity size={18} /> Preparing your profile… <button className="quiet-button" type="button" onClick={() => void dashboard.reload()}>Refresh</button></main>;

  return <main className="app-shell">
    <TopBar profile={profile} connected={dashboard.state === 'ready'} onSignOut={() => void auth.signOut()} />
    <div className="dashboard-content">
      <div className="welcome-line"><div><span className="section-index">FIELD OPERATIONS / 01</span><h1>Dispatch board<span className="title-period">.</span></h1></div><div className="last-update"><span className="live-dot" /> SUPABASE REALTIME <span className="update-divider">/</span> ROLE: {profile.role.toUpperCase()}</div></div>
      <MetricStrip batches={dashboard.data.batches} subBatches={dashboard.data.subBatches} audit={dashboard.data.audit} />
      <AtRiskBanner subBatches={dashboard.data.subBatches} />
      {dashboard.error && <div className="connection-warning" role="status"><Activity size={15} /> Refresh issue: {dashboard.error} <button className="text-button" type="button" onClick={() => void dashboard.reload()}>Retry</button></div>}
      <div className="workbench">
        <div className="left-rail"><DonorQueue profile={profile} batches={dashboard.data.batches} subBatches={dashboard.data.subBatches} onRefresh={dashboard.reload} /><RiderCockpit profile={profile} subBatches={dashboard.data.subBatches} onRefresh={dashboard.reload} /></div>
        <FlowMap shelters={dashboard.data.shelters} subBatches={dashboard.data.subBatches} />
        <div className="right-rail"><ShelterBoard shelters={dashboard.data.shelters} /><div className="operator-note"><span className="note-index">FIELD NOTE / 07</span><p>Pickup confirmation re-checks water and fuel at the shelter. A green route is not a promise until the database clears dispatch.</p></div></div>
      </div>
      <JudgeDeck profile={profile} onRefresh={dashboard.reload} />
      <footer className="dashboard-footer"><span>LAST-MILEX / COORDINATION CORE</span><span>CLAIMS · EXPIRY · REROUTES ARE DATABASE-OWNED</span><span>BUILD 0.1 / {new Date().getFullYear()}</span></footer>
    </div>
  </main>;
}
