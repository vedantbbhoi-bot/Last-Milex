import { useState } from 'react';
import { AlertOctagon, Beaker, Droplets, PackageOpen, RotateCw } from 'lucide-react';
import type { Profile } from '../../lib/types/domain';
import { supabase } from '../../lib/supabase/client';

const scenarios = [
  { id: 'ghost_rider', label: 'Simulate ghost rider', icon: RotateCw, detail: 'Advance an unconfirmed claim past its dead-man deadline.' },
  { id: 'shelter_filled', label: 'Fill shelter mid-route', icon: AlertOctagon, detail: 'Trigger a server-side destination shock and reroute.' },
  { id: 'dependency_violation', label: 'Trigger dependency violation', icon: Droplets, detail: 'Attempt pickup where the required water or fuel is missing.' },
  { id: 'split_180', label: 'Force 180-unit split', icon: PackageOpen, detail: 'Create a test batch and split it against the 40-unit cap.' },
] as const;

export function JudgeDeck({ profile, onRefresh }: { profile: Profile; onRefresh: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  if (profile.role !== 'admin') return null;

  async function run(id: string) {
    if (!supabase) return;
    setBusy(id); setMessage(null);
    const { data, error } = await supabase.rpc('run_judge_scenario', { p_scenario: id });
    setBusy(null);
    if (error) setMessage(error.message);
    else { setMessage(typeof data === 'string' ? data : JSON.stringify(data)); onRefresh(); }
  }

  return <section className="judge-deck">
    <div className="judge-heading"><div><span className="section-index">ADMIN / FAILURE INJECTION</span><h2><Beaker size={18} /> Stress the handoff</h2></div><span className="admin-only-tag">ADMIN ONLY</span></div>
    <div className="judge-actions">{scenarios.map(({ id, label, icon: Icon, detail }) => <button className="scenario-button" key={id} type="button" disabled={busy !== null} onClick={() => void run(id)} title={detail}><Icon size={16} /><span>{busy === id ? 'Running…' : label}</span><small>{detail}</small></button>)}</div>
    {message && <p className="inline-notice" role="status">{message}</p>}
  </section>;
}
